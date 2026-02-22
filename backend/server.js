import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const APCA_API_KEY_ID = (process.env.APCA_API_KEY_ID || "").trim();
const APCA_API_SECRET_KEY = (process.env.APCA_API_SECRET_KEY || "").trim();
const APCA_API_BASE_URL = (process.env.APCA_API_BASE_URL || "https://paper-api.alpaca.markets").replace(/\/$/, "");

const GITHUB_REPO = (process.env.GITHUB_REPO || "diegozamarron/MidasBot").trim();
const GITHUB_BRANCH = (process.env.GITHUB_BRANCH || "main").trim();
const GITHUB_DASHBOARD_JSON_PATH = (process.env.GITHUB_DASHBOARD_JSON_PATH || "dashboard/latest.json").trim();

const rawBase = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;
const githubDashboardUrl = `${rawBase}/${GITHUB_DASHBOARD_JSON_PATH}`;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://diegozamarron.com,https://www.diegozamarron.com,http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, _res, next) => {
  const started = Date.now();
  req._startedAt = started;
  console.log(`[REQ] ${req.method} ${req.path}`);
  next();
});

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed by CORS"));
    },
  })
);

app.use((req, res, next) => {
  res.on("finish", () => {
    const ms = Date.now() - (req._startedAt || Date.now());
    console.log(`[RES] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

function ensureAlpacaConfigured() {
  if (!APCA_API_KEY_ID || !APCA_API_SECRET_KEY) {
    const err = new Error("Missing Alpaca credentials");
    err.status = 500;
    throw err;
  }
}

async function alpacaRequest(path, searchParams = null) {
  ensureAlpacaConfigured();

  const url = new URL(`${APCA_API_BASE_URL}${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }

  console.log(`[UPSTREAM] Alpaca -> ${url.toString()}`);

  let res;
  try {
    res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": APCA_API_KEY_ID,
        "APCA-API-SECRET-KEY": APCA_API_SECRET_KEY,
        Accept: "application/json",
      },
    });
  } catch (e) {
    const err = new Error(`Alpaca network fetch failed: ${e?.message || "unknown"}`);
    err.status = 502;
    throw err;
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Alpaca error ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

async function fetchJson(url) {
  console.log(`[UPSTREAM] GitHub -> ${url}`);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`GitHub JSON fetch failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getPicksAndTree() {
  try {
    const snapshot = await fetchJson(githubDashboardUrl);
    return {
      source: "github_snapshot_json",
      picks: snapshot.latest_picks || null,
      tree: snapshot.persistent_tree || null,
      sentimentRows: snapshot.sentiment_rows || [],
      asOf: snapshot.as_of || null,
      warning: null,
    };
  } catch (e) {
    return {
      source: "none",
      picks: null,
      tree: null,
      sentimentRows: [],
      asOf: null,
      warning: `No GitHub snapshot available: ${e?.message || "unknown"}`,
    };
  }
}

function buildHistorySeries(raw) {
  const timestamps = raw?.timestamp || [];
  const equity = raw?.equity || [];
  const out = [];

  for (let i = 0; i < Math.min(timestamps.length, equity.length); i += 1) {
    const ts = Number(timestamps[i]);
    const eq = Number(equity[i]);
    if (!Number.isFinite(ts) || !Number.isFinite(eq)) continue;
    out.push({
      date: new Date(ts * 1000).toISOString(),
      equity: eq,
    });
  }

  let previous = null;
  return out.map((point) => {
    const dailyReturnPct = previous && previous !== 0 ? ((point.equity - previous) / previous) * 100 : 0;
    previous = point.equity;
    return { ...point, dailyReturnPct };
  });
}

function unwrapSettled(result, key) {
  if (result.status === "fulfilled") {
    return { value: result.value, error: null };
  }
  return { value: null, error: `${key}: ${result.reason?.message || "failed"}` };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "midas-api" });
});

app.get("/api/account", async (_req, res, next) => {
  try {
    const account = await alpacaRequest("/v2/account");
    const equity = Number(account.equity || 0);
    const lastEquity = Number(account.last_equity || 0);
    const winLossUsd = equity - lastEquity;
    const winLossPct = lastEquity !== 0 ? (winLossUsd / lastEquity) * 100 : 0;
    res.json({ account, summary: { equity, lastEquity, winLossUsd, winLossPct } });
  } catch (err) {
    next(err);
  }
});

app.get("/api/positions", async (_req, res, next) => {
  try {
    const positions = await alpacaRequest("/v2/positions");
    res.json({ positions });
  } catch (err) {
    next(err);
  }
});

app.get("/api/activity", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const activity = await alpacaRequest("/v2/account/activities", {
      activity_types: "FILL",
      direction: "desc",
      page_size: limit,
    });
    res.json({ activity });
  } catch (err) {
    next(err);
  }
});

app.get("/api/portfolio-history", async (req, res, next) => {
  try {
    const period = req.query.period || "1M";
    const timeframe = req.query.timeframe || "1D";
    const intradayReporting = req.query.intraday_reporting || "market_hours";

    const raw = await alpacaRequest("/v2/account/portfolio/history", {
      period,
      timeframe,
      intraday_reporting: intradayReporting,
      pnl_reset: "per_day",
      extended_hours: "false",
    });

    res.json({ raw, series: buildHistorySeries(raw) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/picks", async (_req, res) => {
  const data = await getPicksAndTree();
  res.json({
    source: data.source,
    asOf: data.asOf,
    latestPicks: data.picks,
    sentimentRows: data.sentimentRows,
    warning: data.warning,
  });
});

app.get("/api/tree", async (_req, res) => {
  const data = await getPicksAndTree();
  res.json({
    source: data.source,
    asOf: data.asOf,
    persistentTree: data.tree,
    warning: data.warning || (data.tree ? null : "No persistent_tree found in snapshot."),
  });
});

app.get("/api/dashboard", async (_req, res) => {
  const settled = await Promise.allSettled([
    alpacaRequest("/v2/account"),
    alpacaRequest("/v2/positions"),
    alpacaRequest("/v2/account/activities", { activity_types: "FILL", direction: "desc", page_size: 20 }),
    alpacaRequest("/v2/account/portfolio/history", {
      period: "1M",
      timeframe: "1D",
      intraday_reporting: "market_hours",
      pnl_reset: "per_day",
      extended_hours: "false",
    }),
    getPicksAndTree(),
  ]);

  const accountR = unwrapSettled(settled[0], "account");
  const positionsR = unwrapSettled(settled[1], "positions");
  const activityR = unwrapSettled(settled[2], "activity");
  const historyR = unwrapSettled(settled[3], "history");
  const picksR = unwrapSettled(settled[4], "picks");

  const account = accountR.value || {};
  const equity = Number(account.equity || 0);
  const lastEquity = Number(account.last_equity || 0);
  const winLossUsd = equity - lastEquity;
  const winLossPct = lastEquity !== 0 ? (winLossUsd / lastEquity) * 100 : 0;

  const warnings = [accountR.error, positionsR.error, activityR.error, historyR.error, picksR.error]
    .filter(Boolean);

  res.json({
    asOf: new Date().toISOString(),
    source: {
      alpacaBaseUrl: APCA_API_BASE_URL,
      picksSource: picksR.value?.source || "none",
    },
    summary: { equity, lastEquity, winLossUsd, winLossPct },
    latestPicks: picksR.value?.picks || null,
    positions: positionsR.value || [],
    recentActivity: activityR.value || [],
    historySeries: historyR.value ? buildHistorySeries(historyR.value) : [],
    persistentTree: picksR.value?.tree || null,
    sentimentRows: picksR.value?.sentimentRows || [],
    warnings,
  });
});

app.use((err, _req, res, _next) => {
  const status = Number(err.status || 500);
  console.error("[ERROR]", err.message, err.payload || "");
  res.status(status).json({
    error: err.message || "Internal server error",
    details: err.payload || undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Midas API listening on port ${PORT}`);
});
