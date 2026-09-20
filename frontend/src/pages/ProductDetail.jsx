import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import styles from './ProductDetail.module.css';

export default function ProductDetail({ product, onBack }) {
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [activeTab, setActiveTab] = useState('chart'); 

  async function load() {
    setLoading(true);
    try {
      const [h, l] = await Promise.all([
        api.getPriceHistory(product.id),
        api.getScrapeLogs(product.id),
      ]);
      setHistory(h.history);
      setLogs(l.logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [product.id]);

  async function handleScrapeNow() {
    setScraping(true);
    try {
      await api.scrapeNow(product.id);
      await load();
    } catch (e) {
      alert(`Scrape failed: ${e.message}`);
    } finally {
      setScraping(false);
    }
  }

  // Chart data
  const chartData = history.map((h) => ({
    time: formatChartTime(h.scraped_at),
    price: h.price,
    stock: h.stock,
  }));

  const prices = history.map((h) => h.price).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const currentP = product.last_price;

  return (
    <div className={styles.page}>
      {/* Back */}
      <button className={styles.back} onClick={onBack}>← All products</button>

      {/* Product header */}
      <div className={styles.productHeader}>
        <div>
          <span className={styles.category}>{product.category}</span>
          <h1 className={styles.name}>{product.name}</h1>
          <div className={styles.meta}>
            {product.brand && <span>{product.brand}</span>}
            {product.sku && <span>SKU {product.sku}</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.currentPrice}>
            <span className={styles.currentPriceLabel}>Current price</span>
            <span className={styles.currentPriceValue}>
              {currentP != null ? `₹${Number(currentP).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </span>
          </div>
          <button
            className={styles.scrapeBtn}
            onClick={handleScrapeNow}
            disabled={scraping}
          >
            {scraping ? 'Scraping…' : 'Scrape now'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {prices.length > 0 && (
        <div className={styles.statsRow}>
          <Stat label="Data points" value={prices.length} />
          <Stat label="Low" value={`₹${Number(minP).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <Stat label="High" value={`₹${Number(maxP).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <Stat
            label="Change"
            value={prices.length > 1
              ? `${((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(1)}%`
              : '—'}
          />
          <Stat label="Last updated" value={product.last_scraped_at
            ? formatRelative(product.last_scraped_at) : '—'} />
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {['chart', 'table', 'logs'].map((t) => (
          <button
            key={t}
            className={activeTab === t ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(t)}
          >
            {t === 'chart' ? 'Price chart' : t === 'table' ? 'History' : 'Scrape log'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : activeTab === 'chart' ? (
        <ChartView data={chartData} />
      ) : activeTab === 'table' ? (
        <TableView history={history} />
      ) : (
        <LogsView logs={logs} />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

function ChartView({ data }) {
  if (data.length === 0) {
    return <div className={styles.empty}>No price data yet. Trigger a scrape to begin.</div>;
  }
  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e0e0e0" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: '#6b6b6b', fontFamily: 'Inter, sans-serif' }}
            axisLine={{ stroke: '#e0e0e0' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b6b6b', fontFamily: 'Inter, sans-serif' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
            width={56}
          />
          <Tooltip
            content={<CustomTooltip />}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#1a1a1a"
            strokeWidth={1.5}
            dot={{ fill: '#1a1a1a', r: 3 }}
            activeDot={{ r: 5, fill: '#1a1a1a' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      padding: '8px 12px',
      fontSize: 12,
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ color: '#6b6b6b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>₹{Number(payload[0].value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  );
}

function TableView({ history }) {
  if (history.length === 0) {
    return <div className={styles.empty}>No history yet.</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Price</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {[...history].reverse().map((h) => (
            <tr key={h.id}>
              <td>{formatFull(h.scraped_at)}</td>
              <td className={styles.tdPrice}>₹{Number(h.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>{h.stock || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsView({ logs }) {
  if (logs.length === 0) {
    return <div className={styles.empty}>No scrape logs yet.</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Price</th>
            <th>Attempts</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{formatFull(l.attempted_at)}</td>
              <td><StatusBadge status={l.status} /></td>
              <td>{l.price != null ? `₹${Number(l.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
              <td>{l.attempts}</td>
              <td className={styles.tdNote}>{l.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = {
    success: styles.badgeSuccess,
    retried: styles.badgeRetried,
    failed: styles.badgeFailed,
  }[status] || styles.badgeFailed;
  return <span className={cls}>{status}</span>;
}

function formatChartTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatFull(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
