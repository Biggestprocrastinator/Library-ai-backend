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

// ✅ Verify environment variables
if (!process.env.CLOUDANT_URL || !process.env.CLOUDANT_API_KEY) {
  console.error("❌ Missing Cloudant credentials in .env file");
  process.exit(1);
}

// ✅ Create authenticator object correctly
const authenticator = new IamAuthenticator({
  apikey: process.env.CLOUDANT_API_KEY,
});

// ✅ Initialize Cloudant client
const cloudant = CloudantV1.newInstance({
  authenticator,
  serviceUrl: process.env.CLOUDANT_URL,
});

const DB = process.env.CLOUDANT_DB;

/* -------------------------------------------------------------------------- */
/* 🧠 watsonx.ai helper functions                                             */
/* -------------------------------------------------------------------------- */

// ✅ Get temporary IAM access token from IBM Cloud
async function getAccessToken() {
  try {
    const response = await axios.post(
      "https://iam.cloud.ibm.com/identity/token",
      new URLSearchParams({
        grant_type: "urn:ibm:params:oauth:grant-type:apikey",
        apikey: process.env.IBM_API_KEY,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(
      "❌ Failed to get IAM token:",
      error.response?.data || error.message
    );
    throw new Error("Failed to authenticate with IBM Cloud IAM");
  }
}
async function getEmbedding(text) {
  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${process.env.IBM_URL}/ml/v1/text/embeddings?version=2024-05-31`,
      {
        model_id: "ibm/granite-embedding-278m-multilingual", // ✅ verified model
        inputs: [text],
        project_id: process.env.PROJECT_ID,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // 👇 Handle both new and old response formats
    const embedding =
      response.data.data?.[0]?.embedding ||
      response.data.results?.[0]?.embedding ||
      response.data.embedding ||
      null;

    if (!embedding) {
      console.error("⚠️ Unexpected watsonx.ai response:", response.data);
      throw new Error("No embedding returned from watsonx.ai");
    }

    return embedding;
  } catch (error) {
    console.error(
      "❌ watsonx.ai embedding error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to generate embedding");
  }
}


/* -------------------------------------------------------------------------- */
/* 🌐 API ROUTES                                                             */
/* -------------------------------------------------------------------------- */

// ✅ Base route
app.get("/", (req, res) => {
  res.json({ message: "Library AI Agent backend is running ✅" });
});

// ✅ Cloudant connection test route
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

// ✅ Test route: Generate AI embedding
app.get("/test-ai", async (req, res) => {
  try {
    const sampleText =
      "Books about artificial intelligence and machine learning";
    const embedding = await getEmbedding(sampleText);
    res.json({
      ok: true,
      sampleText,
      embeddingLength: embedding.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// 🧠 Test route: List available models
app.get("/list-models", async (req, res) => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${process.env.IBM_URL}/ml/v1/foundation_model_specs?version=2024-05-31`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    // Filter only embedding models for clarity
    const embeddingModels = response.data.resources.filter(
      (m) => m.model_id.toLowerCase().includes("embedding")
    );
    res.json({
      ok: true,
      totalModels: embeddingModels.length,
      models: embeddingModels.map((m) => ({
        id: m.model_id,
        name: m.name,
        description: m.description,
      })),
    });
  } catch (error) {
    console.error("❌ Error fetching models:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: error.response?.data || error.message });
  }
});
// 🧠 Endpoint for frontend to query AI
app.post("/ask-ai", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ ok: false, error: "Missing query text" });

    const embedding = await getEmbedding(query);
    res.json({
      ok: true,
      message: "AI embedding generated successfully",
      query,
      embeddingLength: embedding.length,
      sample: embedding.slice(0, 5), // first 5 numbers just to verify
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});



/* -------------------------------------------------------------------------- */
/* 🚀 START SERVER                                                           */
/* -------------------------------------------------------------------------- */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
