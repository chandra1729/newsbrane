
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { google } = require("googleapis");

let GA_KEY = null;
const GA_PROPERTY_ID = "529846605";

const app = express();

/* ------------------ ✅ 1.2 CORS FIX ------------------ */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* ------------------ ✅ 1.1 PORT FIX ------------------ */
const PORT = process.env.PORT || 3000;

/* ------------------ ✅ 1.3 HEALTH CHECK ------------------ */
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* ------------------ LOAD PROMPTS ------------------ */
const SUMMARIZE_PROMPT = fs.readFileSync(path.join(__dirname, "prompts", "summarize.txt"), "utf-8");
const SIGNALS_PROMPT = fs.readFileSync(path.join(__dirname, "prompts", "signals.txt"), "utf-8");

/* ------------------ OPENAI ------------------ */
async function fetchOpenAI({ system, userText, isJson = false }) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
        response_format: isJson ? { type: "json_object" } : undefined,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ OpenAI Error:", errText);
      throw new Error("OpenAI failed");
    }

    return await res.json();
  } catch (err) {
    console.error("OpenAI API Error:", err.message);
    throw err;
  }
}

/* ------------------ SUMMARIZE ------------------ */
app.post("/summarize", async (req, res) => {
  try {
    const data = await fetchOpenAI({
      system: SUMMARIZE_PROMPT,
      userText: req.body.text
    });

    const short =
      data.choices?.[0]?.message?.content
        ?.trim()
        .toUpperCase()
        .replace(/[".]/g, "") || "SIGNAL LOSS";

    res.json({ short });
  } catch {
    res.json({ short: "SIGNAL LOSS" });
  }
});

/* ------------------ SIGNALS ------------------ */
app.post("/signals", async (req, res) => {
  try {
    const data = await fetchOpenAI({
      system: SIGNALS_PROMPT,
      userText: req.body.text,
      isJson: true
    });

    res.json(JSON.parse(data.choices?.[0]?.message?.content || "{}"));
  } catch {
    res.json({
      severity: "MODERATE",
      howItHitsYou: "Analyzing impact...",
      plan: "STAY ALERT"
    });
  }
});

/* ------------------ 🔥 SMART DEDUPE ------------------ */
function normalizeTitle(title) {
  return title
    ?.toLowerCase()
    .replace(/[0-9+]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\b(over|amid|after|due|to|for|of|in|on|with)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a, b) {
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");

  let common = 0;
  wordsA.forEach(w => {
    if (wordsB.includes(w)) common++;
  });

  return common / Math.min(wordsA.length, wordsB.length);
}

function dedupeArticles(articles) {
  const unique = [];

  for (let article of articles) {
    const norm = normalizeTitle(article.title);

    let isDuplicate = false;

    for (let existing of unique) {
      const existingNorm = normalizeTitle(existing.title);
      const score = similarityScore(norm, existingNorm);

      if (score > 0.5) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(article);
    }
  }

  return unique;
}

/* ------------------ DIVERSIFY ------------------ */
function diversifyArticles(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title?.toLowerCase().split(" ").slice(0, 3).join(" ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------ 🔥 SEEN ARTICLES TRACKING ------------------ */
let seenTitles = new Set();

setInterval(() => {
  seenTitles.clear();
  console.log("🧹 Cleared seen articles cache");
}, 60 * 60 * 1000);

/* ------------------ CACHE ------------------ */
let cache = {};
let lastFetchTime = 0;
const CACHE_TTL = 180000;

/* ------------------ NEWS ------------------ */
app.get("/news", async (req, res) => {
  const topic = req.query.q;
  if (!topic) return res.status(400).json({ error: "Missing query" });

  if (Date.now() - lastFetchTime < CACHE_TTL && cache[topic]) {
    console.log("⚡ Cache hit:", topic);
    return res.json(cache[topic]);
  }

  async function fetchNews(hours) {
    const fromTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&lang=en&max=20&from=${fromTime}&to=${now}&sortby=publishedAt&apikey=${process.env.GNEWS_API_KEY}`;

    console.log("🌐 Fetch:", url);

    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ GNews Error:", response.status, errText);
      throw new Error("GNews failed");
    }

    const data = await response.json();
    return data.articles || [];
  }

  try {
    let articles = await fetchNews(6);

    if (articles.length < 3) {
      console.log("⚠️ Expanding → 12h");
      articles = await fetchNews(12);

      if (articles.length < 3) {
        console.log("⚠️ Expanding → 24h");
        articles = await fetchNews(24);
      }
    }

    articles = articles.filter(a => {
      if (!a.title) return false;
      const key = a.title.toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });

    let cleaned = dedupeArticles(articles);
    cleaned = diversifyArticles(cleaned);

    if (cleaned.length < 5) {
      cleaned = dedupeArticles(articles);
    }

    cleaned = cleaned.slice(0, 10);

    const result = { articles: cleaned };

    cache[topic] = result;
    lastFetchTime = Date.now();

    res.json(result);

  } catch (err) {
    console.error("🚨 FINAL ERROR:", err.message);

    res.json({
      articles: [
        { title: "News temporarily unavailable", description: "", url: "", isFallback: true }
      ]
    });
  }
});

/* ------------------ VISITS ------------------ */
let visits24h = 0;

app.use((req, res, next) => {
  if (req.method === "GET") visits24h++;
  next();
});

setInterval(() => {
  visits24h = 0;
}, 24 * 60 * 60 * 1000);

/* ------------------ GA ------------------ */
async function getHistoricalVisits() {

  if (!GA_KEY) {
  return { month: 0, year: 0 };
}
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: GA_KEY,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"]
    });

    const analytics = google.analyticsdata("v1beta");
    const authClient = await auth.getClient();

    const response = await analytics.properties.runReport({
      property: `properties/${GA_PROPERTY_ID}`,
      auth: authClient,
      requestBody: {
        dateRanges: [
          { startDate: "31daysAgo", endDate: "today" },
          { startDate: "365daysAgo", endDate: "today" }
        ],
        metrics: [{ name: "activeUsers" }]
      }
    });

    const values = response.data.rows.map(r => Number(r.metricValues[0].value));
    return { month: values[0], year: values[1] };

  } catch {
    return { month: 0, year: 0 };
  }
}

app.get("/api/visits", async (req, res) => {
  const hist = await getHistoricalVisits();
  res.json({
    day: visits24h,
    month: hist.month,
    year: hist.year
  });
});

/* ------------------ START ------------------ */
app.listen(PORT, () => {
  console.log(`
-----------------------------------------
✅ Server Running on PORT ${PORT}
🔥 Smart News Engine Active (Seen Tracking ON)
-----------------------------------------
`);
});
