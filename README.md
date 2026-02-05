
#  Library AI Assistant

**Hybrid Semantic Retrieval System with Deterministic AI-Controlled Response Generation**

A **production-style, full-stack AI-assisted information retrieval system** built to demonstrate **real-world backend engineering, safe AI integration, and scalable search architecture**.

This project intentionally avoids “toy chatbot” patterns and instead implements a **multi-stage retrieval, ranking, and validation pipeline** backed by a real database.

---

##  High-Level Overview

The Library AI Assistant is a **hybrid search and conversational system** that enables users to query a structured library inventory using **natural language**, while guaranteeing **zero hallucination** and **database-grounded responses**.

Key design goal:

> **AI is never trusted with data integrity. Deterministic logic always comes first.**

---

##  System Architecture

```
React Frontend (Chat UI)
        │
        │ JSON over REST
        ▼
Node.js + Express API Layer
        │
        ├── Query Normalization & NLP Expansion
        ├── Intent Classification
        ├── Hybrid Retrieval Engine
        │     ├── Lexical Search (Lucene-style)
        │     └── Semantic Vector Search
        ├── Ranking & Deduplication
        ├── Deterministic Inventory Validation
        │
        ▼
IBM Cloudant (NoSQL Document Store)
        │
        ▼
IBM watsonx.ai (STRICTLY OUTPUT-FORMATTING ONLY)
```

---

##  Core Engineering Concepts Demonstrated

* Hybrid Search Architecture (Lexical + Semantic)
* Vector Embeddings & Similarity Scoring
* Controlled AI Output Generation
* Intent-Aware Query Processing
* Conversational Context Resolution
* Safe AI Guardrails (Hallucination Prevention)
* Real-Time Inventory Computation
* Production-Style API Design

---

##  Hybrid Retrieval Engine

### 1️ Lexical Full-Text Search

* Implemented using **Cloudant Search indexes**
* Performs title/author matching
* Supports:

  * Partial tokens
  * Wildcards
  * OR-based query composition
* Guarantees **precision recall**

---

### 2️ Semantic Vector Search

* Each book is encoded into a **high-dimensional embedding vector**
* User queries are embedded using the same model
* Similarity is calculated using **cosine similarity**
* Enables **meaning-based retrieval** when keywords fail

---

### 3️ Hybrid Ranking Pipeline

Results from both channels are:

* Merged
* Deduplicated
* Ranked using a composite relevance score:

  * Semantic similarity
  * Keyword frequency
  * Intent-based boosts

Only the **top-N high-confidence results** are returned.

---

##  NLP & Query Intelligence Layer

The system includes a **query normalization pipeline** that performs:

* Stop-word elimination
* Token extraction
* Domain-specific synonym expansion
* Morphological normalization (plural/singular/suffix handling)
* Title-vocabulary-driven auto-synonym generation

This allows:

```
"DSA" → data structures, algorithms
"coding" → programming, software, CS
```

without relying on brittle keyword rules.

---

##  Conversational Context Resolution

The backend maintains **lightweight conversational state** to resolve follow-up queries.

Example:

```
User: Operating systems books
User: Beginner
```

The system infers intent continuity instead of treating the second message as a standalone query.

This mimics **state-aware conversational agents** while remaining backend-safe and stateless at the API level.

---

##  Deterministic Inventory Intelligence

For factual queries such as:

* total books
* available books
* copy counts
* availability checks

The system **bypasses AI entirely** and computes results directly from the database.

This guarantees:

* Exact numerical correctness
* No hallucinated data
* Real-time accuracy

---

##  AI Integration (Strictly Controlled)

AI is intentionally **sandboxed**.

It:

* Never queries the database
* Never sees raw user intent
* Never invents entities

AI is used **only at the final stage** to:

* Format pre-validated inventory data
* Produce human-readable responses

Hard constraints enforced via:

* Explicit prompt contracts
* Output termination tokens
* Post-generation sanitization

This is **AI as a renderer**, not a decision-maker.

---

##  Hallucination Prevention Strategy

| Layer         | Responsibility                   |
| ------------- | -------------------------------- |
| Backend Logic | Retrieval, filtering, validation |
| Database      | Source of truth                  |
| AI            | Output formatting only           |

If a book does not exist in the database, **it cannot appear in the response**.

---

##  Frontend (React)

* Chat-based UI
* Stateless API communication
* Conversation context management on client side
* Clean separation of concerns

Frontend acts purely as a **presentation layer**.

---

##  Tech Stack

### Backend

* Node.js
* Express
* IBM Cloudant (NoSQL)
* IBM watsonx.ai
* Vector Embeddings
* RESTful API Design

### Frontend

* React
* Functional Components
* Async API handling

---

##  Key API Endpoint

### `POST /ask-ai`

Natural language query endpoint

```json
{
  "query": "Beginner books on data structures under 400 pages",
  "context": []
}
```

Returns:

* Ranked book list
* Verified inventory data
* Strictly bounded output

---

##  Engineering Philosophy

This project intentionally avoids:

* End-to-end AI decision making
* Black-box “LLM does everything” design
* Hallucination-prone architectures

Instead, it demonstrates:

> **AI-assisted systems with deterministic control and auditability**

---

##  Why Recruiters Care

This project demonstrates:

* Real backend problem-solving
* Safe AI system design
* Scalable search patterns
* Production-style guardrails
* Clear separation of responsibilities

It is not a demo chatbot — it is an **engineering system**.

---

##  Author

** Biggestprocrastinator **
Full-Stack Engineer | Backend & AI Systems
Built to demonstrate **production-grade AI integration**, not hype.

---

