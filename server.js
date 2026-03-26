const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let client;
let scoresCollection;
const memoryScores = [];

function sortScores(scores) {
  return [...scores].sort((a, b) => {
    if (b.linesCleared !== a.linesCleared) {
      return b.linesCleared - a.linesCleared;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

async function initMongo() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI is missing. Falling back to in-memory leaderboard.");
    return;
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db("badui");
    scoresCollection = db.collection("leaderboard");
    await scoresCollection.createIndex({ linesCleared: -1, createdAt: 1 });
    console.log("Connected to MongoDB.");
  } catch (err) {
    console.error("MongoDB connection failed. Falling back to in-memory leaderboard.", err.message);
    scoresCollection = null;
  }
}

app.get("/api/leaderboard", async (req, res) => {
  try {
    if (scoresCollection) {
      const entries = await scoresCollection
        .find({}, { projection: { _id: 0, email: 1, linesCleared: 1, createdAt: 1 } })
        .sort({ linesCleared: -1, createdAt: 1 })
        .limit(10)
        .toArray();
      return res.json({ entries });
    }

    const entries = sortScores(memoryScores).slice(0, 10);
    return res.json({ entries });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load leaderboard." });
  }
});

app.post("/api/leaderboard", async (req, res) => {
  const email = String(req.body.email || "").trim();
  const linesCleared = Number(req.body.linesCleared || 0);

  if (!email || !Number.isFinite(linesCleared) || linesCleared < 0) {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const entry = {
    email,
    linesCleared,
    createdAt: new Date().toISOString()
  };

  try {
    if (scoresCollection) {
      await scoresCollection.insertOne(entry);
    } else {
      memoryScores.push(entry);
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save score." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

initMongo().finally(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
