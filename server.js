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

// ---------------- List All Available Models ----------------
app.get("/list-models", async (req, res) => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${process.env.IBM_URL}/ml/v1/foundation_model_specs?version=2024-05-31`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const allModels = response.data.resources || [];
    res.json({
      ok: true,
      totalModels: allModels.length,
      models: allModels.map((m) => ({
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
app.post("/ask-ai", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ ok: false, error: "Missing query text" });

    const token = await getAccessToken();

    const prompt = `You are a helpful AI assistant for a library. Answer the following question clearly and concisely without repeating the query.\n\nQuestion: ${query}\nAnswer:`;

    const response = await axios.post(
      `${process.env.IBM_URL}/ml/v1/text/generation?version=2024-05-31`,
      {
        model_id: "ibm/granite-3-3-8b-instruct",
        input: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          stop_sequences: ["Question:", "Query:"],
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

    // ✅ Clean up extra text properly
    const reply =
      response.data.results?.[0]?.generated_text
        ?.replace(/(Query:|Output:|Question:)/gi, "")
        ?.trim() || "I couldn’t generate a clean reply.";

    res.json({ ok: true, query, reply });
  } catch (error) {
    console.error("❌ watsonx.ai chat error:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "Failed to generate AI reply" });
  }
});


// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
