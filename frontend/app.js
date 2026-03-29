const container = document.getElementById("main-container");
const lastUpdatedEl = document.getElementById("last-updated");
const REFRESH_INTERVAL = 1000 * 60 * 60; // 1 hour

/* 🔥 ADD THIS (GLOBAL API BASE) */
const API_BASE = "https://newsbrane-production.up.railway.app";

let newsBuffers = {};
let domMap = {};
let lastHeadlines = {};

/* ---------------- HELPERS ---------------- */
function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

function rotateArray(arr, step = 5) {
  if (arr.length === 0) return arr;
  const rotated = arr.splice(0, step);
  return arr.concat(rotated);
}

/* ⭐ DOMAIN + FAVICON */
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getFavicon(url) {
  try {
    const domain = getDomain(url);
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
  } catch {
    return "";
  }
}

/* ---------------- ACTION LABEL LOGIC ---------------- */
function getActionLabel(severity) {
  return "SMART MOVE ➔";
}

/* ---------------- API CALLS ---------------- */
async function getCondensedTitle(text) {
  try {
    const res = await fetch(`${API_BASE}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    return data.short || text;
  } catch {
    return text.substring(0, 40);
  }
}

async function getSignalsFromLLM(text) {
  try {
    const res = await fetch(`${API_BASE}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    return await res.json();
  } catch {
    return {
      severity: "MODERATE",
      howItHitsYou: "Scanning for impact...",
      plan: "Monitor the situation"
    };
  }
}

/* ---------------- CREATE CARD ---------------- */
function createCardShell(color, id) {
  const card = document.createElement("div");
  card.className = "signal-card";

  card.innerHTML = `
    <div class="headline">
      <span class="expand-arrow">&#8599;</span>
      <span class="news-title">Loading...</span>
      <span class="severity">
        <span class="severity-badge"></span>
        <span class="severity-text">...</span>
      </span>
      <img class="news-logo" src="" alt="logo">
    </div>
    <div class="impact-container">
      <span class="impact-label">HOW IT HITS YOU:</span>
      <span class="impact-text">Loading...</span>
    </div>
    <div class="action-bar">
      <div class="plan-pill">PLAN ➔ </div>
      <div class="plan-text">Loading...</div>
    </div>
  `;

  domMap[id] = card;
  lastHeadlines[id] = null;

  return card;
}

/* ---------------- UPDATE CARD ---------------- */
async function updateCardContent(newsObj, id) {
  const card = domMap[id];
  if (!card) return;

  const [shortTitle, signalsRaw] = await Promise.all([
    newsObj.isFallback
      ? Promise.resolve(newsObj.title)
      : getCondensedTitle(newsObj.title),
    newsObj.isFallback
      ? Promise.resolve({
          severity: "LOW",
          howItHitsYou: "Static system update.",
          plan: "No action needed"
        })
      : getSignalsFromLLM(newsObj.content)
  ]);

  const signals = signalsRaw || {};
  const severity = signals.severity || "LOW";
  const level = severity.toLowerCase();

  const isNewHeadline = lastHeadlines[id] !== newsObj.title;
  lastHeadlines[id] = newsObj.title;

  if (isNewHeadline || severity === "HIGH") {
    card.classList.remove("updated");
    void card.offsetWidth;
    card.classList.add("updated");
  }

  const severityEl = card.querySelector(".severity");
  const severityText = card.querySelector(".severity-text");

  severityEl.className = `severity ${level}`;
  severityText.textContent = severity;

  card.classList.remove("high-impact", "moderate-impact", "low-impact");
  card.classList.add(`${level}-impact`);

  card.classList.remove("active-alert");
  void card.offsetWidth;

  if (severity === "HIGH") {
    card.classList.add("active-alert");
  }

  const titleEl = card.querySelector(".news-title");
  titleEl.textContent = shortTitle;

  const arrowEl = card.querySelector(".expand-arrow");
  arrowEl.onclick = () => {
    if (newsObj.url) window.open(newsObj.url, "_blank");
  };

  const favicon = card.querySelector(".news-logo");
  favicon.src = newsObj.url ? getFavicon(newsObj.url) : "";
  favicon.style.cursor = newsObj.url ? "pointer" : "default";
  favicon.onclick = () => {
    if (newsObj.url) window.open(newsObj.url, "_blank");
  };

  favicon.onerror = () => {
    favicon.onerror = null;
    favicon.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><text x='2' y='12'>•</text></svg>";
  };

  card.querySelector(".impact-text").textContent =
    signals.howItHitsYou || "Scanning for impact...";

  const label = getActionLabel(severity);
  card.querySelector(".plan-pill").textContent = label;

  const safePlan = (signals.plan || "Monitor the situation")
    .replace(/IMMEDIATELY/gi, "")
    .replace(/NOW/gi, "")
    .replace(/SELL ALL/gi, "consider reducing");

  card.querySelector(".plan-text").textContent = safePlan;
}

/* ---------------- FETCH ---------------- */
async function fetchTopicNews(topic) {
  try {
    const res = await fetch(
      `${API_BASE}/news?q=${encodeURIComponent(topic.query)}`
    );
    const data = await res.json();

    let articles = data.articles?.length
      ? data.articles.map(a => ({
          title: a.title,
          content: a.description || a.title,
          url: a.url,
          isFallback: false
        }))
      : topic.fallback.map(t => ({
          title: t,
          content: t,
          isFallback: true
        }));

    newsBuffers[topic.name] = shuffleArray(articles);
  } catch {
    newsBuffers[topic.name] = topic.fallback.map(t => ({
      title: t,
      content: t,
      isFallback: true
    }));
  }
}

/* ---------------- INIT ---------------- */
async function init() {
  container.innerHTML = "";
  domMap = {};
  lastHeadlines = {};

  for (const topic of CONFIG.topics) {
    await fetchTopicNews(topic);

    const col = document.createElement("div");
    col.className = "topic-column";

    col.innerHTML = `
      <h2 class="topic-title" style="color:${topic.color}">
        ${topic.name}
      </h2>
    `;

    const tilesContainer = document.createElement("div");
    tilesContainer.className = "topic-tiles";

    col.appendChild(tilesContainer);
    container.appendChild(col);

    for (let i = 0; i < CONFIG.maxVisibleSignals; i++) {
      const id = `${topic.name}-${i}`;
      const card = createCardShell(topic.color, id);
      tilesContainer.appendChild(card);
    }
  }

  await updateAllTiles();
  updateTimestamp();
}

/* ---------------- UPDATE ---------------- */
async function updateAllTiles() {
  const tasks = [];

  for (const topic of CONFIG.topics) {
    const articles = newsBuffers[topic.name] || [];

    for (let i = 0; i < CONFIG.maxVisibleSignals; i++) {
      const id = `${topic.name}-${i}`;
      const newsObj = articles[i % articles.length];
      tasks.push(updateCardContent(newsObj, id));
    }
  }

  await Promise.all(tasks);
}

/* ---------------- REFRESH ---------------- */
async function silentRefresh() {
  for (const topic of CONFIG.topics) {
    newsBuffers[topic.name] = rotateArray(
      newsBuffers[topic.name] || [],
      CONFIG.maxVisibleSignals
    );
  }

  await updateAllTiles();

  for (const id in domMap) {
    const card = domMap[id];
    if (card.classList.contains("high-impact")) {
      card.classList.remove("active-alert");
      void card.offsetWidth;
      card.classList.add("active-alert");
    }
  }

  updateTimestamp();
}

/* ---------------- TIME ---------------- */
function updateTimestamp() {
  lastUpdatedEl.textContent = `SYNC: ${new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

/* ---------------- RUN ---------------- */
window.onload = async () => {
  await init(); // initial load

  // Only refresh every hour
  setInterval(async () => {
    console.log("Hourly refresh triggered...");
    for (const topic of CONFIG.topics) {
      await fetchTopicNews(topic); // fetch fresh news from API
    }
    await silentRefresh(); // update tiles with new news
  }, REFRESH_INTERVAL);
};

/* ---------------- VISITS ---------------- */
const visitsContainer = document.createElement("div");
visitsContainer.id = "visits-container";
document.body.appendChild(visitsContainer);

async function updateVisits() {
  try {
    const res = await fetch(`${API_BASE}/api/visits`);
    const data = await res.json();

    visitsContainer.innerHTML = `
      ⚡ VISITS TO NEWSBRANE<br>
      24H: <strong>${data.day}</strong><br>
      31D: <strong>${data.month}</strong><br>
      1Y: <strong>${data.year}</strong>
    `;
  } catch (err) {
    visitsContainer.textContent = "⚡ VISITS: ERROR";
    console.error("Visits fetch error:", err);
  }
}

updateVisits();
// setInterval(updateVisits, 60000);
