// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { CloudantV1 } from "@ibm-cloud/cloudant";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import axios from "axios";

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








import fs from "fs";

app.post("/import-books", async (req, res) => {
  try {
    const books = JSON.parse(
      fs.readFileSync("books.json", "utf8")
    );

    const response = await cloudant.postBulkDocs({
      db: DB,
      bulkDocs: {
        docs: books
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
    // 1️⃣ Normalization + stop-words removal
    const stopWords = new Set([
      "do","you","have","the","a","an","is","are",
      "books","book","any","of","for","with","and",
      "please","want","need","show","find","about",
      "hi","hello","hey"
    ]);

    const tokens = userQuery
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w && w.length > 2 && !stopWords.has(w));

    if (tokens.length === 0) {
      return [];
    }

    // 2️⃣ Build Lucene query
    const terms = [];
    tokens.forEach(t => {
      const clean = t.replace(/[^a-z0-9]/gi, "").trim();
      if (clean) {
        terms.push(`title:${clean}`, `author:${clean}`);
      }
    });

    // Join with OR for ANY match
    const luceneQuery = terms.join(" OR ");

    // 3️⃣ Execute Cloudant full-text search
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

    return docs;
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

    // ————————————————
    // 1️⃣ GET IBM TOKEN
    const token = await getAccessToken();
    if (!token) throw new Error("Failed to get IBM Access Token");


     const lowerQuery = query.toLowerCase().trim();
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

    // Continue with inventory search…

    
    // ————————————————
    // 2️⃣ SEARCH INVENTORY (full-text Lucene search)
    const books = await searchBooks(query);

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
          return `• ${index + 1}. Title: ${title}\n  Author: ${author}\n  Copies: ${copies}\n  Location: ${location}`;
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
