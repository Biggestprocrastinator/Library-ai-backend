
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { CloudantV1 } from "@ibm-cloud/cloudant";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import axios from "axios";
import fs from "fs";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// ---------------- IBM Cloudant Setup ----------------
if (!process.env.CLOUDANT_URL || !process.env.CLOUDANT_API_KEY) {
  console.error("❌ Missing Cloudant credentials in .env file");
  process.exit(1);
}

const authenticator = new IamAuthenticator({
  apikey: process.env.CLOUDANT_API_KEY,
});

const cloudant = CloudantV1.newInstance({
  authenticator,
  serviceUrl: process.env.CLOUDANT_URL,
});

const DB = process.env.CLOUDANT_DB;
// Embedding model (from your /list-models output)
const EMBED_MODEL = process.env.EMBED_MODEL || "ibm/slate-30m-english-rtrvr-v2";
const EMBED_BATCH = Number(process.env.EMBED_BATCH || 50);
const SEMANTIC_SEARCH = (process.env.SEMANTIC_SEARCH || "true").toLowerCase() === "true";
const IBM_API_VERSION = process.env.IBM_API_VERSION || "2024-05-31";

// ---------------- watsonx.ai Auth ----------------
async function getAccessToken() {
  try {
    const response = await axios.post(
      "https://iam.cloud.ibm.com/identity/token",
      new URLSearchParams({
        grant_type: "urn:ibm:params:oauth:grant-type:apikey",
        apikey: process.env.IBM_API_KEY,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.data.access_token;
  } catch (error) {
    console.error("❌ Failed to get IAM token:", error.response?.data || error.message);
    throw new Error("Failed to authenticate with IBM Cloud IAM");
  }
}

// ---------------- watsonx.ai Embeddings ----------------
async function getEmbeddings(inputs) {
  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${process.env.IBM_URL}/ml/v1/text/embeddings?version=${IBM_API_VERSION}`,
      {
        model_id: EMBED_MODEL,
        project_id: process.env.PROJECT_ID,
        inputs
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data?.results?.map(r => r.embedding) || [];
  } catch (err) {
    console.error("❌ Embeddings error:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data || null
    });
    throw err;
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
// ---------------- Base Route ----------------
app.get("/", (req, res) => {
  res.json({ message: "✅ Library AI Agent backend is running" });
});

// ---------------- Cloudant Test Route ----------------
app.get("/test-db", async (req, res) => {
  try {
    const response = await cloudant.postAllDocs({ db: DB, limit: 5 });
    res.json({
      ok: true,
      count: response.result.rows.length,
      database: DB,
    });
  } catch (err) {
    console.error("❌ Cloudant connection failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------- Watsonx Model List ----------------
app.get("/list-models", async (req, res) => {
  try {
    const token = await getAccessToken();
    const { limit, start, filters } = req.query;

    const response = await axios.get(
      `${process.env.IBM_URL}/ml/v1/foundation_model_specs`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        params: {
          version: IBM_API_VERSION,
          limit,
          start,
          filters
        }
      }
    );

    res.json({
      ok: true,
      version: IBM_API_VERSION,
      total_count: response.data?.total_count,
      limit: response.data?.limit,
      resources: response.data?.resources || [],
      next: response.data?.next || null
    });
  } catch (err) {
    console.error("❌ list-models error:", err.message);
    res.status(500).json({
      ok: false,
      error: err.message,
      details: err.response?.data || null
    });
  }
});







// ---------------- Title Vocabulary + Auto Synonyms (from books.json) ----------------
const TITLE_VOCAB = new Set();
const AUTO_SYNONYMS = {};
let BOOKS_CACHE = null;

function tokenizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(t => t && t.length > 2);
}

function loadTitleVocabFromFile() {
  try {
    if (!fs.existsSync("books.json")) return;
    const books = JSON.parse(fs.readFileSync("books.json", "utf8"));
    BOOKS_CACHE = books;
    for (const b of books) {
      const title = b?.title || "";
      for (const t of tokenizeTitle(title)) {
        TITLE_VOCAB.add(t);
      }
    }
  } catch (err) {
    console.warn("⚠️ Failed to load books.json for title vocab:", err.message);
  }
}

loadTitleVocabFromFile();

function buildAutoSynonymsFromTitles() {
  if (!Array.isArray(BOOKS_CACHE)) return;

  const stop = new Set([
    "and","for","the","with","using","guide","book","text","textbook","vol","volume",
    "edition","principles","introduction","approach","basic","advanced","course",
    "students","student","units","center","modern","engineering","engineers"
  ]);

  const co = new Map(); // token -> Map(otherToken -> count)

  for (const b of BOOKS_CACHE) {
    const tokens = tokenizeTitle(b?.title || "").filter(t => !stop.has(t));
    const uniq = Array.from(new Set(tokens));
    for (let i = 0; i < uniq.length; i++) {
      const a = uniq[i];
      if (!co.has(a)) co.set(a, new Map());
      const mapA = co.get(a);
      for (let j = 0; j < uniq.length; j++) {
        if (i === j) continue;
        const bTok = uniq[j];
        mapA.set(bTok, (mapA.get(bTok) || 0) + 1);
      }
    }
  }

  const MAX_SYNS = 6;
  const MIN_COUNT = 2;

  for (const [token, counts] of co.entries()) {
    const sorted = Array.from(counts.entries())
      .filter(([, c]) => c >= MIN_COUNT)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SYNS)
      .map(([t]) => t);
    if (sorted.length > 0) {
      AUTO_SYNONYMS[token] = sorted;
    }
  }
}

buildAutoSynonymsFromTitles();

// ---------------- Synonym Map (shared) ----------------
const SYNONYM_MAP = {
  // Math
  maths: ["math", "mathematics"],
  algebra: ["math", "mathematics", "linear", "equations"],
  geometry: ["math", "mathematics", "shapes", "proofs"],
  calculus: ["math", "mathematics", "differential", "integral"],
  trigonometry: ["math", "mathematics", "angles", "triangles"],
  statistics: ["math", "mathematics", "probability", "data", "analytics"],
  probability: ["math", "mathematics", "statistics", "stochastic"],
  linear: ["algebra", "math", "mathematics"],
  discrete: ["math", "mathematics", "structures", "logic"],
  vector: ["algebra", "math", "mathematics"],
  differential: ["calculus", "math", "mathematics"],
  integral: ["calculus", "math", "mathematics"],
  numerical: ["methods", "math", "mathematics"],
  numericalmethods: ["methods", "math", "mathematics"],
  matrices: ["linear", "algebra", "math"],
  optimization: ["math", "mathematics", "operations", "research"],
  "operations-research": ["optimization", "math", "mathematics"],
  ops: ["operations", "research", "optimization"],

  // Programming / CS
  "c++": ["cpp", "programming", "coding", "software", "computer", "cs"],
  cpp: ["c++", "programming", "coding", "software", "computer", "cs"],
  "c#": ["csharp", "programming", "coding", "software", "computer", "cs"],
  csharp: ["c#", "programming", "coding", "software", "computer", "cs"],
  c: ["programming", "coding", "software", "computer", "cs"],
  java: ["programming", "coding", "software", "computer", "cs"],
  python: ["programming", "coding", "software", "computer", "cs"],
  javascript: ["programming", "coding", "software", "computer", "cs", "web"],
  typescript: ["programming", "coding", "software", "computer", "cs", "web"],
  php: ["programming", "coding", "software", "web"],
  ruby: ["programming", "coding", "software", "web"],
  go: ["golang", "programming", "coding", "software"],
  golang: ["go", "programming", "coding", "software"],
  swift: ["programming", "coding", "software"],
  kotlin: ["programming", "coding", "software"],
  scala: ["programming", "coding", "software"],
  rust: ["programming", "coding", "software"],
  perl: ["programming", "coding", "software"],
  bash: ["shell", "scripting", "linux"],
  shell: ["scripting", "linux", "unix"],
  scripting: ["programming", "coding", "automation"],
  programming: ["coding", "software", "computer", "cs"],
  coding: ["programming", "software", "computer", "cs"],
  software: ["programming", "coding", "computer", "cs"],
  computer: ["programming", "coding", "software", "cs"],
  cs: ["computer", "science", "programming", "coding", "software"],

  // Data Structures & Algorithms
  dsa: ["data", "structures", "algorithms", "coding", "programming", "cs"],
  algorithm: ["algorithms", "coding", "programming", "cs"],
  algorithms: ["algorithm", "coding", "programming", "cs"],
  datastructure: ["data", "structures", "coding", "programming", "cs"],
  "data-structure": ["data", "structures", "coding", "programming", "cs"],
  "data-structures": ["data", "structures", "coding", "programming", "cs"],
  structures: ["data", "structures", "dsa", "cs"],
  complexity: ["algorithms", "analysis", "cs"],
  graph: ["graphs", "algorithms", "ds"],
  graphs: ["graph", "algorithms", "ds"],

  // Databases / Data
  dbms: ["database", "databases", "db", "sql", "rdbms"],
  rdbms: ["dbms", "database", "databases", "sql"],
  database: ["db", "data", "sql", "storage"],
  databases: ["database", "db", "data", "sql", "storage"],
  db: ["database", "data", "sql", "storage"],
  sql: ["database", "db", "data", "query"],
  nosql: ["database", "db", "data", "storage"],
  data: ["analytics", "database", "statistics"],
  analytics: ["data", "statistics", "business"],
  datawarehouse: ["warehouse", "database", "etl", "analytics"],
  warehouse: ["data", "etl", "analytics"],
  etl: ["data", "pipeline", "warehouse"],
  mongodb: ["nosql", "database"],
  mysql: ["sql", "database"],
  postgresql: ["sql", "database"],
  oracle: ["sql", "database"],

  // Web / Networking / Security
  web: ["internet", "network", "http", "www"],
  networking: ["network", "communications", "protocols"],
  network: ["networking", "communications", "protocols"],
  networks: ["network", "networking", "communications"],
  protocol: ["protocols", "networking"],
  protocols: ["protocol", "networking"],
  tcp: ["ip", "networking", "protocols"],
  udp: ["ip", "networking", "protocols"],
  http: ["web", "internet"],
  https: ["web", "security"],
  security: ["cyber", "cryptography", "network", "systems"],
  cyber: ["security", "cryptography", "network", "systems"],
  cryptography: ["security", "cyber", "encryption"],
  encryption: ["cryptography", "security"],
  firewall: ["security", "network"],
  malware: ["security", "cyber"],
  forensics: ["security", "cyber"],
  hacking: ["security", "cyber"],

  // Operating Systems / Systems
  os: ["operating", "systems", "kernel", "computer"],
  operating: ["os", "systems", "kernel"],
  systems: ["system", "computer", "os"],
  system: ["systems", "computer", "os"],
  linux: ["operating", "systems", "unix"],
  unix: ["operating", "systems", "linux"],
  kernel: ["os", "systems"],
  windows: ["os", "systems"],

  // Electronics / Electrical / Communication
  electronics: ["electronic", "circuits", "electrical"],
  electronic: ["electronics", "circuits", "electrical"],
  circuits: ["electronics", "electrical"],
  electrical: ["electronics", "circuits", "power"],
  power: ["electrical", "energy", "machines"],
  communication: ["communications", "signal", "network"],
  communications: ["communication", "signal", "network"],
  signal: ["signals", "communication", "communications"],
  signals: ["signal", "communication", "communications"],
  analog: ["electronics", "circuits"],
  digital: ["electronics", "circuits"],
  microprocessor: ["processor", "electronics", "computer"],
  microcontroller: ["embedded", "electronics"],
  embedded: ["microcontroller", "electronics", "systems"],

  // Mechanical / Civil / Materials
  mechanics: ["mechanical", "physics", "machines"],
  mechanical: ["mechanics", "machines", "engineering"],
  thermodynamics: ["thermal", "heat", "energy", "mechanics"],
  fluid: ["fluids", "mechanics", "hydraulics"],
  fluids: ["fluid", "mechanics", "hydraulics"],
  materials: ["material", "metallurgy", "engineering"],
  material: ["materials", "metallurgy", "engineering"],
  metallurgy: ["materials", "material", "engineering"],
  strength: ["materials", "mechanics"],
  kinematics: ["mechanics", "physics"],
  dynamics: ["mechanics", "physics"],
  hydraulics: ["fluid", "mechanics"],
  manufacturing: ["production", "engineering"],
  production: ["manufacturing", "engineering"],

  // Business / Management
  management: ["business", "strategy", "operations"],
  business: ["management", "finance", "economics"],
  finance: ["business", "accounting", "economics"],
  accounting: ["finance", "business", "economics"],
  economics: ["business", "finance", "management"],
  marketing: ["business", "management"],
  hr: ["management", "business"],
  operations: ["management", "business"],

  // AI / ML / Data Science
  ai: ["artificial", "intelligence", "machine", "learning", "ml"],
  artificial: ["ai", "intelligence"],
  intelligence: ["ai", "artificial"],
  ml: ["machine", "learning", "ai"],
  machine: ["learning", "ai"],
  learning: ["machine", "ai", "ml"],
  "data-science": ["data", "analytics", "statistics", "ml"],
  deeplearning: ["deep", "learning", "ai", "ml"],
  deep: ["learning", "ai", "ml"],
  neural: ["networks", "ai", "ml"],
  nlp: ["language", "ai", "ml"],
  vision: ["computer vision", "ai"],
  cv: ["computer vision", "ai"],

  // Physics / Chemistry / Biology
  physics: ["mechanics", "quantum", "thermodynamics"],
  quantum: ["physics"],
  optics: ["physics", "light"],
  chemistry: ["chemical", "chem"],
  chemical: ["chemistry"],
  biology: ["bio", "biological"],
  bio: ["biology"],

  // Civil / Architecture
  civil: ["construction", "structural", "engineering"],
  structural: ["civil", "construction"],
  architecture: ["design", "building"],

  // Cloud / DevOps
  cloud: ["computing", "aws", "azure", "gcp"],
  aws: ["cloud", "computing"],
  azure: ["cloud", "computing"],
  gcp: ["cloud", "computing"],
  devops: ["automation", "ci", "cd"],
  docker: ["containers", "devops"],
  kubernetes: ["containers", "devops"],

  // Software Engineering
  se: ["software", "engineering"],
  testing: ["software", "qa"],
  qa: ["testing", "software"]
};

function getExpandedTokens(text) {
  const stopWords = new Set([
    "do","you","have","the","a","an","is","are",
    "books","book","any","of","for","with","and",
    "please","want","need","show","find","about",
    "hi","hello","hey"
  ]);

  const rawTokens = String(text || "")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w && w.length > 2 && !stopWords.has(w));

  if (rawTokens.length === 0) return [];

  const tokenSet = new Set(rawTokens);
  rawTokens.forEach(t => {
    const extras = SYNONYM_MAP[t];
    if (extras && Array.isArray(extras)) {
      extras.forEach(x => tokenSet.add(x));
    }
    const auto = AUTO_SYNONYMS[t];
    if (auto && Array.isArray(auto)) {
      auto.forEach(x => tokenSet.add(x));
    }
  });

  // Morphological variants based on title vocabulary
  function addIfInVocab(word) {
    if (word && TITLE_VOCAB.has(word)) {
      tokenSet.add(word);
    }
  }

  rawTokens.forEach(t => {
    if (t.endsWith("ies") && t.length > 4) addIfInVocab(t.slice(0, -3) + "y");
    if (t.endsWith("es") && t.length > 4) addIfInVocab(t.slice(0, -2));
    if (t.endsWith("s") && t.length > 3) addIfInVocab(t.slice(0, -1));
    if (!t.endsWith("s")) {
      addIfInVocab(t + "s");
      addIfInVocab(t + "es");
    }
    if (t.endsWith("ics") && t.length > 4) addIfInVocab(t.slice(0, -1));
    if (t.endsWith("ic") && t.length > 3) addIfInVocab(t + "s");
    if (t.endsWith("ing") && t.length > 5) addIfInVocab(t.slice(0, -3));
  });

  return Array.from(tokenSet);
}

// ---------------- Embedding Build Route ----------------
app.post("/build-embeddings", async (req, res) => {
  try {
    const force = Boolean(req.body?.force);

    const allDocs = await cloudant.postAllDocs({
      db: DB,
      includeDocs: true,
      limit: 5000
    });

    const docs = allDocs.result.rows
      .map(r => r.doc)
      .filter(Boolean);

    const toEmbed = docs.filter(d => force || !Array.isArray(d.embedding));

    if (toEmbed.length === 0) {
      return res.json({ ok: true, updated: 0, total: docs.length, message: "No documents need embedding." });
    }

    let updated = 0;
    for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
      const batch = toEmbed.slice(i, i + EMBED_BATCH);
      const inputs = batch.map(d => {
        const title = String(d.title || "").trim();
        const author = String(d.author || "").trim();
        return `${title}. ${author}`.trim();
      });

      const embeddings = await getEmbeddings(inputs);
      const updatedDocs = batch.map((d, idx) => ({
        ...d,
        embedding: embeddings[idx],
        embedding_model: EMBED_MODEL,
        embedding_updated_at: new Date().toISOString()
      }));

      const bulkResp = await cloudant.postBulkDocs({
        db: DB,
        bulkDocs: { docs: updatedDocs }
      });

      updated += bulkResp.result.filter(r => r.ok).length;
    }

    return res.json({ ok: true, updated, total: docs.length, model: EMBED_MODEL });
  } catch (err) {
    console.error("❌ build-embeddings error:", err.message);
    res.status(500).json({
      ok: false,
      error: err.message,
      details: err.response?.data || null
    });
  }
});

app.post("/import-books", async (req, res) => {
  try {
    const books = JSON.parse(
      fs.readFileSync("books.json", "utf8")
    );

    // Attach _rev for existing docs so bulk update doesn't conflict
    const existing = await cloudant.postAllDocs({
      db: DB,
      includeDocs: false,
      limit: 10000
    });
    const revMap = new Map(
      existing.result.rows.map(r => [r.id, r.value?.rev]).filter(([id, rev]) => id && rev)
    );

    const docsToUpsert = books.map(b => {
      const doc = { ...b };
      const rev = revMap.get(doc._id);
      if (rev) doc._rev = rev;
      return doc;
    });

    const response = await cloudant.postBulkDocs({
      db: DB,
      bulkDocs: {
        docs: docsToUpsert
      }
    });

    const successCount = response.result.filter(r => r.ok).length;
    const errorCount = response.result.filter(r => r.error).length;

    res.json({
      ok: true,
      inserted: successCount,
      failed: errorCount,
      total: books.length
    });
  } catch (err) {
    console.error("❌ Import failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});





async function searchBooks(userQuery) {
  try {
    const tokens = getExpandedTokens(userQuery);
    const luceneTokens = tokens;

    if (tokens.length === 0) {
      return [];
    }

    const codingKeywords = new Set([
      "coding","programming","program","software","computer","cs","dsa","algorithm","algorithms",
      "structures","datastructures","data-structures","data structure","data structures",
      "compiler","java","python","javascript","typescript","c++","cpp","c#","csharp"
    ]);
    const looksLikeCodingQuery = tokens.some(t => codingKeywords.has(t));

    // Stricter DSA intent: require algorithm/data-structure indicators, not generic "data"
    const dsaIndicators = [
      "dsa","algorithm","algorithms","data structure","data structures","data-structure","data-structures","datastructures"
    ];
    const looksLikeDSAQuery = tokens.some(t => dsaIndicators.includes(t)) || /data\s+structure|algorithms?/i.test(userQuery);

    function isCodingBook(b) {
      const t = String(b?.title || "").toLowerCase();
      const a = String(b?.author || "").toLowerCase();
      return Array.from(codingKeywords).some(k => t.includes(k) || a.includes(k));
    }

    function isDSABook(b) {
      const t = String(b?.title || "").toLowerCase();
      return dsaIndicators.some(k => t.includes(k));
    }

    // 2️⃣ Hybrid search: semantic + keyword
    let semanticDocs = [];
    if (SEMANTIC_SEARCH) {
      try {
        const queryEmb = (await getEmbeddings([userQuery]))[0];
        if (queryEmb && Array.isArray(queryEmb)) {
          const allDocs = await cloudant.postAllDocs({
            db: DB,
            includeDocs: true,
            limit: 5000
          });

          semanticDocs = allDocs.result.rows
            .map(r => r.doc)
            .filter(d => Array.isArray(d?.embedding))
            .map(d => ({
              doc: d,
              score: cosineSimilarity(queryEmb, d.embedding)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);
        }
      } catch (e) {
        console.warn("⚠️ Semantic search failed, falling back to keyword search:", e.message);
      }
    }

    // 3️⃣ Build Lucene query
    const terms = [];
    luceneTokens.forEach(t => {
      const clean = t.replace(/[^a-z0-9]/gi, "").trim();
      if (clean) {
        terms.push(`title:${clean}`, `author:${clean}`);
        // Light wildcard for partial matches (e.g., "math" -> "mathematics")
        if (clean.length >= 4) {
          terms.push(`title:${clean}*`);
        }
      }
    });

    // Join with OR for ANY match
    const luceneQuery = terms.join(" OR ");

    // 4️⃣ Execute Cloudant full-text search
    const response = await cloudant.postSearch({
      db: DB,
      ddoc: "book_search",
      index: "books",
      query: luceneQuery,
      limit: 5
    });

    const docs = [];
    for (const row of response.result.rows) {
      if (row.id) {
        const docRes = await cloudant.getDocument({ db: DB, docId: row.id });
        docs.push(docRes.result);
      }
    }

    // 5️⃣ Merge semantic + keyword (hybrid) with ranking
    const ignoreTokens = new Set(["under","below","less","than","upto","up","to","pages","page"]);
    const queryContentTokens = tokens.filter(t => /[a-z]/i.test(t) && !ignoreTokens.has(t));

    function computeKeywordScore(doc) {
      const text = `${doc?.title || ""} ${doc?.author || ""}`.toLowerCase();
      let count = 0;
      for (const t of queryContentTokens) {
        if (text.includes(t)) count += 1;
      }
      let score = 1 + count / 10;
      if (looksLikeCodingQuery && Array.from(codingKeywords).some(k => text.includes(k))) {
        score += 0.5;
      }
      return score;
    }

    const keywordDocs = docs.map(d => ({
      doc: d,
      score: computeKeywordScore(d)
    }));

    const combinedRaw = [...keywordDocs, ...semanticDocs];
    const bestById = new Map();
    for (const item of combinedRaw) {
      const id = item?.doc?._id || item?.doc?.id;
      if (!id) continue;
      const prev = bestById.get(id);
      if (!prev || item.score > prev.score) {
        bestById.set(id, item);
      }
    }

    let combined = Array.from(bestById.values())
      .sort((a, b) => b.score - a.score)
      .map(x => x.doc);

    if (looksLikeDSAQuery) {
      combined = combined.filter(isDSABook);
    } else if (looksLikeCodingQuery) {
      combined = combined.filter(isCodingBook);
    }

    return combined.slice(0, 5);
  } catch (e) {
    console.error("❌ Cloudant Search Error:", e.response?.data || e.message);
    return [];
  }
}



















// ---------------- Student-Focused Ask AI Route ----------------
app.post("/ask-ai", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Missing or invalid query text" });
    }

    const trimmedQuery = query.trim();
    const lowerQ = trimmedQuery.toLowerCase();
    const effectiveQuery = trimmedQuery;

    // Lightweight intent hints for "works now" queries
    const extraTerms = [];
    if (/\bexam\b|\bpreparation\b|\bprep\b/i.test(effectiveQuery)) {
      extraTerms.push("guide", "practice", "review");
    }
    if (/\bpractice\b|\bquestions?\b|\bproblem(s)?\b/i.test(effectiveQuery)) {
      extraTerms.push("practice", "problems", "questions");
    }
    if (/\bprojects?\b|\bfinal year\b/i.test(effectiveQuery)) {
      extraTerms.push("project", "design", "applications");
    }
    if (/\bwith\s+diagrams?\b|\bdiagram(s)?\b/i.test(effectiveQuery)) {
      extraTerms.push("diagram", "illustrated");
    }
    if (/\bsimple\b|\beasy\b|\bbasics?\b/i.test(effectiveQuery)) {
      extraTerms.push("introduction", "basic", "fundamentals");
    }
    if (/\bpractical\b|\bexamples?\b/i.test(effectiveQuery)) {
      extraTerms.push("examples", "applications", "hands-on");
    }
    if (/\bgraphics\b/i.test(effectiveQuery)) {
      extraTerms.push("graphics", "visual");
    }

    // Intent: copies of a specific book/topic (e.g., "how many copies of database books")
    const copiesOfMatch = lowerQ.match(/\bhow\s+many\s+copies\s+(?:of|for)\s+(.+)/);
    if (copiesOfMatch && copiesOfMatch[1]) {
      let subject = copiesOfMatch[1].trim();
      subject = subject
        .replace(/\b(do you have|available|in stock|right now|are there)\b/gi, "")
        .replace(/[?!.]+$/g, "")
        .trim();
      const books = await searchBooks(subject);
      const totalCopies = books.reduce((sum, b) => {
        const c = Number.isFinite(b?.copies) ? b.copies : 0;
        return sum + c;
      }, 0);

      return res.json({
        ok: true,
        query,
        resultsFound: books.length,
        reply: books.length
          ? `Found ${books.length} matching book(s) for "${subject}" with a total of ${totalCopies} copies.`
          : `No matching books found for "${subject}".`
      });
    }

    // Intent: availability of a specific book/topic (e.g., "is compiler design available")
    const availabilityMatch = lowerQ.match(/\b(?:is|are)\s+(.+?)\s+available\b|\bavailability\s+of\s+(.+)/);
    if (availabilityMatch) {
      const subject = (availabilityMatch[1] || availabilityMatch[2] || "").trim();
      if (subject) {
        const books = await searchBooks(subject);
        const availableBooks = books.filter(b => b?.available === true);
        const totalCopies = books.reduce((sum, b) => sum + (Number.isFinite(b?.copies) ? b.copies : 0), 0);
        const availableCopies = availableBooks.reduce((sum, b) => sum + (Number.isFinite(b?.copies) ? b.copies : 0), 0);

        return res.json({
          ok: true,
          query,
          resultsFound: books.length,
          reply: books.length
            ? `Found ${books.length} matching book(s). Available copies: ${availableCopies} (total copies: ${totalCopies}).`
            : `No matching books found for "${subject}".`
        });
      }
    }

    // Direct inventory stats queries
    const totalCountMatch = lowerQ.match(/\bhow\s+many\s+(?:total\s+)?(books|titles|items)\b|\btotal\s+(books|titles|items)\b/);
    const availableCountMatch = lowerQ.match(/\bhow\s+many\s+available\s+(books|titles|items)\b/);
    const copiesMatch = lowerQ.match(/\bhow\s+many\s+copies\b|\btotal\s+copies\b/);
    let topicCountMatch = lowerQ.match(/\bhow\s+many\s+([a-z0-9+#+-]+)\s+books?\b/);
    if (topicCountMatch && ["total", "all"].includes(topicCountMatch[1])) {
      topicCountMatch = null;
    }
    if (totalCountMatch) {
      topicCountMatch = null;
    }

    if (totalCountMatch || availableCountMatch || copiesMatch || topicCountMatch) {
      try {
        let total = 0;
        let docs = null;

        // Prefer counting actual docs to avoid stale/incorrect doc_count
        if (totalCountMatch || availableCountMatch || copiesMatch || topicCountMatch) {
          const allDocs = await cloudant.postAllDocs({
            db: DB,
            includeDocs: true,
            limit: 10000
          });
          docs = allDocs.result.rows.map(r => r.doc).filter(Boolean);
          total = docs.length;
        } else {
          const info = await cloudant.getDatabaseInformation({ db: DB });
          total = info.result?.doc_count ?? 0;
        }

        if (availableCountMatch || copiesMatch || topicCountMatch) {
          const availableCount = docs.filter(d => d.available === true).length;
          const totalCopies = docs.reduce((sum, d) => {
            const c = Number.isFinite(d?.copies) ? d.copies : 0;
            return sum + c;
          }, 0);

          if (topicCountMatch) {
            const topic = topicCountMatch[1];
            const topicAliases = new Set(getExpandedTokens(topic));
            if (topicAliases.size === 0) topicAliases.add(topic.toLowerCase());

            const count = docs.filter(d => {
              const title = String(d?.title || "").toLowerCase();
              const author = String(d?.author || "").toLowerCase();
              return Array.from(topicAliases).some(t => title.includes(t) || author.includes(t));
            }).length;

            return res.json({
              ok: true,
              query,
              resultsFound: 0,
              reply: `There are ${count} ${topic} books in the inventory.`
            });
          }

          if (availableCountMatch) {
            return res.json({
              ok: true,
              query,
              resultsFound: 0,
              reply: `There are ${availableCount} available books in the inventory.`
            });
          }

          if (copiesMatch) {
            return res.json({
              ok: true,
              query,
              resultsFound: 0,
              reply: `There are ${totalCopies} total copies in the inventory.`
            });
          }
        }

        return res.json({
          ok: true,
          query,
          resultsFound: 0,
          reply: `There are ${total} books in the library inventory.`
        });
      } catch (err) {
        console.error("❌ Stats query failed:", err.message);
        return res.status(500).json({ ok: false, error: "Failed to fetch inventory stats" });
      }
    }

    // Optional page-limit intent (e.g., "under 400 pages", "less than 350 pages")
    const pageLimitMatch = effectiveQuery.toLowerCase().match(/\b(?:under|below|less\s+than|upto|up\s+to)\s+(\d{2,4})\s*pages?\b/);
    const pageLimit = pageLimitMatch ? Number(pageLimitMatch[1]) : null;

    // ————————————————
    // 1️⃣ GET IBM TOKEN
    const token = await getAccessToken();
    if (!token) throw new Error("Failed to get IBM Access Token");


     const lowerQuery = effectiveQuery.toLowerCase().trim();
    const BOOK_QUERY_KEYWORDS = [
      "book",
      "books",
      "read",
      "find",
      "author",
      "title",
      "have",
      "available",
      "inventory",
      "copy",
      "copies",
      "where",
      "which",
      "what",
      "do you have",
      "search"
    ];

    const looksLikeBookQuery = BOOK_QUERY_KEYWORDS.some(keyword =>
      lowerQuery.includes(keyword)
    );

    if (!looksLikeBookQuery) {
      return res.json({
        ok: true,
        query,
        resultsFound: 0,
        reply: "Hi! If you’re looking for books or need help finding something in the library, just ask me about specific topics, titles, or authors 😊"
      });
    }
    // ————————— End casual query handling —————————

    // (Level prompting removed)

    // Continue with inventory search…

    
    // ————————————————
    // 2️⃣ SEARCH INVENTORY (full-text Lucene search)
    // NLP-style query expansion (safe): expand but always search inventory
    const searchQuery = extraTerms.length > 0
      ? `${effectiveQuery} ${extraTerms.join(" ")}`.trim()
      : effectiveQuery;

    let books = await searchBooks(searchQuery);

    // (Level filtering removed)

    // Apply page filter if requested and field exists
    if (pageLimit && Array.isArray(books)) {
      books = books.filter(b => Number.isFinite(b?.max_pages) && b.max_pages <= pageLimit);
    }

    // De-duplicate by title + author
    if (Array.isArray(books)) {
      const seen = new Set();
      books = books.filter(b => {
        const title = String(b?.title || "").trim().toLowerCase();
        const author = String(b?.author || "").trim().toLowerCase();
        const key = `${title}||${author}`;
        if (!title) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Build number of matches
    const resultsFound = Array.isArray(books) ? books.length : 0;

    // ————————————————
    // 3️⃣ BUILD INVENTORY CONTEXT TEXT
    let inventoryContext;
    if (resultsFound === 0) {
      inventoryContext = "No books in the library inventory match this query.";
    } else {
      inventoryContext = books
        .map((b, index) => {
          // safe field extraction
          const title = String(b.title || "Unknown Title").trim();
          const author = String(b.author || "Unknown Author").trim();
          const copies = Number.isInteger(b.copies) ? b.copies : 0;
          const location = String(b.location || "Unknown Location").trim();
          const maxPages = Number.isInteger(b.max_pages) ? b.max_pages : null;
          const pagesLine = maxPages ? `\n  Max Pages: ${maxPages}` : "";
          return `• ${index + 1}. Title: ${title}\n  Author: ${author}\n  Copies: ${copies}\n  Location: ${location}${pagesLine}`;
        })
        .join("\n\n");
    }

    // ————————————————
    // 4️⃣ BUILD AI PROMPT (robust + instructive)
const prompt = `
You are Libra, an expert library assistant AI.

Below are books from the library inventory matching the user’s query:

${inventoryContext}

User query:
"${query}"

Answer the query using ONLY the inventory above.

RULES:
1. Provide exactly up to 5 book entries maximum.
2. Do NOT list more than 5.
3. Each entry must be formatted as:
   1. Title: …
      Author: …
      Copies: …
      Location: …
      Max Pages: …
4. After listing the books (or saying none are available), output the single token:
   [END_OF_ANSWER]
5. Do NOT generate anything after [END_OF_ANSWER].

Start your answer now:
`;



    // ————————————————
    // 5️⃣ CALL watsonx.ai GRANITE (safely)
const aiResponse = await axios.post(
  `${process.env.IBM_URL}/ml/v1/text/generation?version=2024-05-31`,
  {
    model_id: "ibm/granite-3-3-8b-instruct",
    input: prompt,
    parameters: {
      max_new_tokens: 400,  // larger budget
      temperature: 0.0,
      stop_sequences: ["[END_OF_ANSWER]"]  // safe stop delimiter
    },
    project_id: process.env.PROJECT_ID,
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  }
);


    // ————————————————
    // 6️⃣ EXTRACT RAW MODEL OUTPUT
    const rawReply = aiResponse.data.results?.[0]?.generated_text || "";

    // ————————————————
    // 7️⃣ CLEAN & VALIDATE AI OUTPUT
    // Remove accidental prompt fragments
    let formattedReply = rawReply
      .replace(/Below is a list of library inventory items that may match the student's request:/gi, "")
      .replace(/USER QUERY:/gi, "")
      .replace(/INSTRUCTIONS:/gi, "")
      .trim();
    
      formattedReply = formattedReply
  .replace(/\[END_OF_ANSWER\]/gi, "")
  .replace(/\[LIBRA_END\]/gi, "")
  .replace(/\[STOP\]/gi, "")
  .trim();

    // Guaranteed fallback
    if (!formattedReply || formattedReply.length < 3) {
      formattedReply = "Not available in the library inventory.";
    }

    // ————————————————
    // 8️⃣ SEND RESPONSE
    res.json({
      ok: true,
      query,
      resultsFound,
      reply: formattedReply
    });
  } catch (error) {
    console.error("❌ ask-ai error:", {
      message: error.message,
      details: error.response?.data || null
    });
    res.status(500).json({
      ok: false,
      error: "AI generation failed or search failed",
      details: error.response?.data || error.message
    });
  }
});










// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
