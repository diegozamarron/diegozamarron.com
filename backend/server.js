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
const GITHUB_AGG_CSV_PATH = (process.env.GITHUB_AGG_CSV_PATH || "truthsocial_daily_aggregated.csv").trim();

const rawBase = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;
const githubDashboardUrl = `${rawBase}/${GITHUB_DASHBOARD_JSON_PATH}`;
const githubAggCsvUrl = `${rawBase}/${GITHUB_AGG_CSV_PATH}`;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://diegozamarron.com,https://www.diegozamarron.com,http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

  const res = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": APCA_API_KEY_ID,
      "APCA-API-SECRET-KEY": APCA_API_SECRET_KEY,
      Accept: "application/json",
    },
  });

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
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`GitHub JSON fetch failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`GitHub text fetch failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

function parseSimpleCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function computePicksFromAggregated(rows) {
  if (!rows.length) return { best: null, worst: null, rows: [] };

  const normalized = rows
    .map((r) => ({
      ticker: r.Ticker,
      mean: Number(r.MeanSentimentScore),
      mentions: Number(r.Mentions),
    }))
    .filter((r) => r.ticker && Number.isFinite(r.mean) && Number.isFinite(r.mentions));

  if (!normalized.length) return { best: null, worst: null, rows: [] };

  let best = normalized[0];
  let worst = normalized[0];
  for (const row of normalized) {
    if (row.mean > best.mean) best = row;
    if (row.mean < worst.mean) worst = row;
  }

  return { best, worst, rows: normalized };
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
    };
  } catch {
    const csv = await fetchText(githubAggCsvUrl);
    const rows = parseSimpleCsv(csv);
    const picks = computePicksFromAggregated(rows);
    return {
      source: "github_aggregated_csv",
      picks: {
        best: picks.best,
        worst: picks.worst,
      },
      tree: null,
      sentimentRows: picks.rows,
      asOf: null,
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

    res.json({
      account,
      summary: {
        equity,
        lastEquity,
        winLossUsd,
        winLossPct,
      },
    });
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

    const series = buildHistorySeries(raw);
    res.json({ raw, series });
  } catch (err) {
    next(err);
  }
});

app.get("/api/picks", async (_req, res, next) => {
  try {
    const data = await getPicksAndTree();
    res.json({
      source: data.source,
      asOf: data.asOf,
      latestPicks: data.picks,
      sentimentRows: data.sentimentRows,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/tree", async (_req, res, next) => {
  try {
    const data = await getPicksAndTree();
    res.json({
      source: data.source,
      asOf: data.asOf,
      persistentTree: data.tree,
      note: data.tree ? undefined : "No persistent_tree found. Add dashboard/latest.json in MidasBot repo.",
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const [account, positions, activity, history, picksTree] = await Promise.all([
      alpacaRequest("/v2/account"),
      alpacaRequest("/v2/positions"),
      alpacaRequest("/v2/account/activities", {
        activity_types: "FILL",
        direction: "desc",
        page_size: 20,
      }),
      alpacaRequest("/v2/account/portfolio/history", {
        period: "1M",
        timeframe: "1D",
        intraday_reporting: "market_hours",
        pnl_reset: "per_day",
        extended_hours: "false",
      }),
      getPicksAndTree(),
    ]);

    const equity = Number(account.equity || 0);
    const lastEquity = Number(account.last_equity || 0);
    const winLossUsd = equity - lastEquity;
    const winLossPct = lastEquity !== 0 ? (winLossUsd / lastEquity) * 100 : 0;

    res.json({
      asOf: new Date().toISOString(),
      source: {
        alpacaBaseUrl: APCA_API_BASE_URL,
        picksSource: picksTree.source,
      },
      summary: {
        equity,
        lastEquity,
        winLossUsd,
        winLossPct,
      },
      latestPicks: picksTree.picks,
      positions,
      recentActivity: activity,
      historySeries: buildHistorySeries(history),
      persistentTree: picksTree.tree,
      sentimentRows: picksTree.sentimentRows,
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const status = Number(err.status || 500);
  res.status(status).json({
    error: err.message || "Internal server error",
    details: err.payload || undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Midas API listening on port ${PORT}`);
});
