import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import './MidasBot.css';

const API_BASE =
  import.meta.env.VITE_MIDAS_API_BASE ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://api.diegozamarron.com');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatCurrency(value) {
  const n = toNumber(value);
  if (n === null) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function formatPercent(value) {
  const n = toNumber(value);
  if (n === null) return '--';
  return `${n.toFixed(2)}%`;
}

function normalizePick(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    ticker: raw.ticker || raw.symbol || '--',
    mean: toNumber(raw.mean ?? raw.score ?? raw.meanSentimentScore),
    mentions: toNumber(raw.mentions ?? raw.count ?? raw.n),
  };
}

function parseDateLabel(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString();
}

function buildChartPoints(series, metric) {
  const width = 1000;
  const height = 320;
  const padX = 36;
  const padY = 24;

  if (!Array.isArray(series) || series.length < 2) {
    return { points: '', width, height, min: 0, max: 0 };
  }

  const values = series.map((p) => (metric === 'equity' ? toNumber(p.equity) : toNumber(p.dailyReturnPct))).filter((v) => v !== null);
  if (values.length < 2) {
    return { points: '', width, height, min: 0, max: 0 };
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const span = max - min;
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;

  const points = series
    .map((p, i) => {
      const v = metric === 'equity' ? toNumber(p.equity) : toNumber(p.dailyReturnPct);
      if (v === null) return null;
      const x = padX + (i / (series.length - 1)) * (width - padX * 2);
      const y = height - padY - ((v - yMin) / (yMax - yMin)) * (height - padY * 2);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  return { points, width, height, min: yMin, max: yMax };
}

function toTreeLayout(rawTree) {
  if (!rawTree) return null;

  if (rawTree.nodes && rawTree.edges) {
    return {
      nodes: rawTree.nodes,
      edges: rawTree.edges,
      width: 1000,
      height: 420,
    };
  }

  const root = rawTree.root || rawTree;
  if (!root || typeof root !== 'object') return null;

  const nodeMap = new Map();
  let idCounter = 0;

  function register(node, depth, parentId) {
    if (!node || typeof node !== 'object') return null;
    const id = `n${idCounter++}`;
    nodeMap.set(id, { id, node, depth, parentId, leftId: null, rightId: null, order: -1 });

    const leftId = register(node.left, depth + 1, id);
    const rightId = register(node.right, depth + 1, id);

    const current = nodeMap.get(id);
    current.leftId = leftId;
    current.rightId = rightId;
    return id;
  }

  const rootId = register(root, 0, null);
  if (!rootId) return null;

  const orderIds = [];
  function inorder(id) {
    if (!id) return;
    const entry = nodeMap.get(id);
    inorder(entry.leftId);
    orderIds.push(id);
    inorder(entry.rightId);
  }
  inorder(rootId);

  orderIds.forEach((id, idx) => {
    const entry = nodeMap.get(id);
    entry.order = idx;
  });

  const maxDepth = Math.max(...Array.from(nodeMap.values()).map((n) => n.depth));
  const width = Math.max(900, orderIds.length * 130);
  const height = Math.max(320, (maxDepth + 1) * 120);
  const padX = 70;
  const padY = 60;

  const nodes = Array.from(nodeMap.values()).map((entry) => {
    const x = padX + ((entry.order + 0.5) / orderIds.length) * (width - padX * 2);
    const y = padY + entry.depth * ((height - padY * 2) / Math.max(1, maxDepth));

    const score = toNumber(entry.node.score);
    const scoreText = score === null ? '--' : score.toFixed(3);
    const ticker = entry.node.ticker || '--';

    return {
      id: entry.id,
      x,
      y,
      labelTop: ticker,
      labelBottom: scoreText,
      depth: entry.depth,
    };
  });

  const coords = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const entry of nodeMap.values()) {
    if (entry.leftId && coords.has(entry.leftId)) {
      edges.push({ from: entry.id, to: entry.leftId });
    }
    if (entry.rightId && coords.has(entry.rightId)) {
      edges.push({ from: entry.id, to: entry.rightId });
    }
  }

  return { nodes, edges, width, height, coords };
}

export default function MidasBot() {
  const [metric, setMetric] = useState('equity');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/api/dashboard`, { headers: { Accept: 'application/json' } });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to fetch dashboard');
        }
        if (!ignore) {
          setData(json);
        }
      } catch (e) {
        if (!ignore) {
          setError(e.message || 'Unknown error');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      ignore = true;
    };
  }, []);

  const summary = data?.summary || {};
  const positions = Array.isArray(data?.positions) ? data.positions : [];
  const activity = Array.isArray(data?.recentActivity) ? data.recentActivity : [];
  const historySeries = Array.isArray(data?.historySeries) ? data.historySeries : [];

  const buyPick = normalizePick(data?.latestPicks?.buy || data?.latestPicks?.best || data?.latestPicks?.long);
  const sellPick = normalizePick(data?.latestPicks?.sell || data?.latestPicks?.worst || data?.latestPicks?.short);

  const chart = useMemo(() => buildChartPoints(historySeries, metric), [historySeries, metric]);
  const tree = useMemo(() => toTreeLayout(data?.persistentTree), [data?.persistentTree]);

  const latestMetricValue = historySeries.length
    ? metric === 'equity'
      ? toNumber(historySeries[historySeries.length - 1]?.equity)
      : toNumber(historySeries[historySeries.length - 1]?.dailyReturnPct)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <section className="introduction midas-intro">
        <h1 className="title">MidasBot</h1>
        <p className="subtitle">Live trading dashboard</p>
        <p className="description">
          Positions, picks, account performance, recent fills, and persistent sentiment tree.
        </p>
      </section>

      <section className="midas-wrap">
        {loading && <p className="midas-info">Loading dashboard...</p>}
        {error && <p className="midas-error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="midas-grid four">
              <article className="midas-card">
                <h3>Equity</h3>
                <p className="midas-value">{formatCurrency(summary.equity)}</p>
              </article>
              <article className="midas-card">
                <h3>Win/Loss $</h3>
                <p className="midas-value">{formatCurrency(summary.winLossUsd)}</p>
              </article>
              <article className="midas-card">
                <h3>Win/Loss %</h3>
                <p className="midas-value">{formatPercent(summary.winLossPct)}</p>
              </article>
              <article className="midas-card">
                <h3>As Of</h3>
                <p className="midas-value small">{parseDateLabel(data?.asOf)}</p>
              </article>
            </div>

            <div className="midas-grid two">
              <article className="midas-card">
                <h3>Latest Picks</h3>
                <div className="pick-row">
                  <span className="pick-label">BUY</span>
                  <span>{buyPick?.ticker || '--'}</span>
                  <span>{buyPick?.mean === null || buyPick?.mean === undefined ? '--' : buyPick.mean.toFixed(3)}</span>
                  <span>n={buyPick?.mentions ?? '--'}</span>
                </div>
                <div className="pick-row">
                  <span className="pick-label">SELL/SHORT</span>
                  <span>{sellPick?.ticker || '--'}</span>
                  <span>{sellPick?.mean === null || sellPick?.mean === undefined ? '--' : sellPick.mean.toFixed(3)}</span>
                  <span>n={sellPick?.mentions ?? '--'}</span>
                </div>
              </article>

              <article className="midas-card">
                <div className="midas-header-row">
                  <h3>Portfolio Graph</h3>
                  <div className="toggle-group">
                    <button
                      type="button"
                      className={metric === 'equity' ? 'toggle-btn active' : 'toggle-btn'}
                      onClick={() => setMetric('equity')}
                    >
                      value
                    </button>
                    <button
                      type="button"
                      className={metric === 'dailyReturnPct' ? 'toggle-btn active' : 'toggle-btn'}
                      onClick={() => setMetric('dailyReturnPct')}
                    >
                      return
                    </button>
                  </div>
                </div>

                <p className="metric-line">
                  {metric === 'equity' ? 'Latest value:' : 'Latest return:'}{' '}
                  <strong>{metric === 'equity' ? formatCurrency(latestMetricValue) : formatPercent(latestMetricValue)}</strong>
                </p>

                <div className="chart-shell">
                  {chart.points ? (
                    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="midas-chart" role="img" aria-label="Portfolio chart">
                      <line x1="24" y1={chart.height - 22} x2={chart.width - 24} y2={chart.height - 22} className="axis" />
                      <line x1="24" y1="22" x2="24" y2={chart.height - 22} className="axis" />
                      <polyline points={chart.points} className="chart-line" />
                    </svg>
                  ) : (
                    <p className="midas-info">Not enough portfolio history points yet.</p>
                  )}
                </div>
              </article>
            </div>

            <div className="midas-grid two">
              <article className="midas-card">
                <h3>Current Positions</h3>
                {positions.length === 0 ? (
                  <p className="midas-info">No open positions.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="midas-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Qty</th>
                          <th>Side</th>
                          <th>Market Value</th>
                          <th>Unrealized P/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p) => (
                          <tr key={p.asset_id || p.symbol}>
                            <td>{p.symbol}</td>
                            <td>{p.qty}</td>
                            <td>{p.side || '--'}</td>
                            <td>{formatCurrency(p.market_value)}</td>
                            <td>{formatCurrency(p.unrealized_pl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="midas-card">
                <h3>Recent Activity</h3>
                {activity.length === 0 ? (
                  <p className="midas-info">No recent fills.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="midas-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Symbol</th>
                          <th>Side</th>
                          <th>Qty</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity.slice(0, 20).map((a, idx) => (
                          <tr key={`${a.id || idx}`}>
                            <td>{parseDateLabel(a.transaction_time || a.date)}</td>
                            <td>{a.symbol || '--'}</td>
                            <td>{a.side || '--'}</td>
                            <td>{a.qty || '--'}</td>
                            <td>{formatCurrency(a.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>

            <article className="midas-card tree-card">
              <h3>Persistent Sentiment Tree</h3>
              {!tree ? (
                <p className="midas-info">Tree data unavailable. Publish persistent tree JSON in your MidasBot repo.</p>
              ) : (
                <div className="tree-shell">
                  <svg viewBox={`0 0 ${tree.width} ${tree.height}`} className="midas-tree" role="img" aria-label="Persistent binary tree">
                    {tree.edges.map((edge, i) => {
                      const from = tree.coords ? tree.coords.get(edge.from) : tree.nodes.find((n) => n.id === edge.from);
                      const to = tree.coords ? tree.coords.get(edge.to) : tree.nodes.find((n) => n.id === edge.to);
                      if (!from || !to) return null;
                      return <line key={`${edge.from}-${edge.to}-${i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="tree-edge" />;
                    })}
                    {tree.nodes.map((node) => (
                      <g key={node.id}>
                        <circle cx={node.x} cy={node.y} r="26" className="tree-node" />
                        <text x={node.x} y={node.y - 2} textAnchor="middle" className="tree-label-top">
                          {node.labelTop || node.label || node.id}
                        </text>
                        <text x={node.x} y={node.y + 12} textAnchor="middle" className="tree-label-bottom">
                          {node.labelBottom || ''}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}
            </article>
          </>
        )}
      </section>
    </motion.div>
  );
}
