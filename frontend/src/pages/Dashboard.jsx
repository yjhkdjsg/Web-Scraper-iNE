import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import styles from './Dashboard.module.css';

export default function Dashboard({ onSelect }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [tracked, setTracked] = useState([]);
  const [loadingTracked, setLoadingTracked] = useState(true);
  const [tracking, setTracking] = useState(null); // id being added
  const [removing, setRemoving] = useState(null);
  const [scraping, setScraping] = useState(() => new Set());
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState('');

  const debounceRef = useRef(null);

  useEffect(() => {
    api.getProducts()
      .then((d) => setTracked(d.products))
      .catch(() => {})
      .finally(() => setLoadingTracked(false));
  }, []);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const d = await api.searchProducts(query);
        setSearchResults(d.results);
        if (d.results.length === 0) setSearchError('No products found.');
      } catch (e) {
        setSearchError('Search failed — try again.');
      } finally {
        setSearching(false);
      }
    }, 600);
  }, [query]);

  async function handleTrack(product) {
    setTracking(product.url);
    try {
      const d = await api.trackProduct(product);
      setTracked((prev) => [d.product, ...prev]);
      setQuery('');
      setSearchResults([]);
    } catch (e) {
      alert(e.message);
    } finally {
      setTracking(null);
    }
  }

  async function handleRemove(id) {
    setRemoving(id);
    try {
      await api.deleteProduct(id);
      setTracked((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert('Could not remove product.');
    } finally {
      setRemoving(null);
    }
  }

  async function handleScrape(product) {
    setScraping((current) => new Set(current).add(product.id));
    try {
      const result = await api.scrapeNow(product.id);
      setTracked((prev) => prev.map((item) => item.id === product.id
        ? { ...item, last_price: result.price, last_stock: result.stock, last_scraped_at: new Date().toISOString() }
        : item));
    } catch (e) {
      alert(`Scrape failed: ${e.message}`);
    } finally {
      setScraping((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  async function handleCatalogRefresh() {
    setRefreshingCatalog(true);
    setCatalogMessage('Refreshing catalog...');
    try {
      const result = await api.refreshCatalog();
      setCatalogMessage(`${result.count} products indexed.`);
    } catch (e) {
      setCatalogMessage(e.message);
    } finally {
      setRefreshingCatalog(false);
    }
  }

  const trackedUrls = new Set(tracked.map((p) => p.url));

  return (
    <div className={styles.page}>
      {/* Hero */}
      <div className={styles.hero}>
        <h1 className={styles.heading}>Track prices from the INE Store.</h1>
        <p className={styles.sub}>
          Search for a product, add it, and we'll check its price and stock every 2 hours.
        </p>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <div className={styles.searchBox}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by product name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && <span className={styles.spinner} />}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className={styles.results}>
            {searchResults.map((p) => {
              const alreadyTracked = trackedUrls.has(p.url);
              return (
                <div key={p.url} className={styles.resultRow}>
                  <div className={styles.resultInfo}>
                    <span className={styles.resultCategory}>{p.category}</span>
                    <span className={styles.resultName}>{p.name}</span>
                    {p.sku && <span className={styles.resultMeta}>SKU {p.sku}</span>}
                  </div>
                  <button
                    className={alreadyTracked ? styles.btnTracked : styles.btnTrack}
                    disabled={alreadyTracked || tracking === p.url}
                    onClick={() => !alreadyTracked && handleTrack(p)}
                  >
                    {alreadyTracked ? 'Tracking' : tracking === p.url ? 'Adding…' : 'Track'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {searchError && <p className={styles.searchError}>{searchError}</p>}
      </div>

      {/* Tracked products */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeading}>
            <h2 className={styles.sectionTitle}>Tracked products</h2>
            {tracked.length > 0 && (
              <span className={styles.count}>{tracked.length}</span>
            )}
          </div>
          <div className={styles.sectionTools}>
            {catalogMessage && <span className={styles.catalogMessage}>{catalogMessage}</span>}
            <button
              className={styles.refreshButton}
              type="button"
              onClick={handleCatalogRefresh}
              disabled={refreshingCatalog}
            >
              {refreshingCatalog ? 'Refreshing...' : 'Refresh catalog'}
            </button>
          </div>
        </div>

        {loadingTracked ? (
          <div className={styles.empty}>Loading…</div>
        ) : tracked.length === 0 ? (
          <div className={styles.empty}>
            No products tracked yet. Search above to get started.
          </div>
        ) : (
          <div className={styles.grid}>
            {tracked.map((p) => (
              <div
                key={p.id}
                className={styles.card}
                onClick={() => onSelect(p)}
              >
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.cardCategory}>{p.category}</span>
                    <h3 className={styles.cardName}>{p.name}</h3>
                    {p.brand && <span className={styles.cardBrand}>{p.brand}</span>}
                    {p.sku && <span className={styles.cardSku}>SKU {p.sku}</span>}
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={(e) => { e.stopPropagation(); handleRemove(p.id); }}
                    disabled={removing === p.id}
                    aria-label="Stop tracking"
                  >
                    {removing === p.id ? '…' : '×'}
                  </button>
                </div>

                <div className={styles.cardBottom}>
                  <div className={styles.priceBlock}>
                    <span className={styles.priceLabel}>Last price</span>
                    <span className={styles.price}>
                      {p.last_price != null ? `₹${Number(p.last_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </span>
                    <div className={styles.stockBlock}>
                      <StockBadge stock={p.last_stock} />
                    </div>
                  </div>
                </div>

                {p.last_scraped_at && (
                  <div className={styles.cardTime}>
                    Updated {formatRelative(p.last_scraped_at)}
                  </div>
                )}

                <div className={styles.cardActions}>
                  <button
                    className={styles.primaryAction}
                    onClick={(e) => { e.stopPropagation(); handleScrape(p); }}
                    disabled={scraping.has(p.id)}
                  >
                    {scraping.has(p.id) ? 'Scraping...' : 'Scrape now'}
                  </button>
                  <button
                    className={styles.secondaryAction}
                    onClick={(e) => { e.stopPropagation(); onSelect(p); }}
                  >
                    History <span aria-hidden="true">-&gt;</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StockBadge({ stock }) {
  const lower = (stock || '').toLowerCase();
  const outOfStock = lower.includes('out') || lower.includes('unavailable');
  const hasAvailability = Boolean(stock);
  const label = outOfStock ? 'Out of stock' : hasAvailability ? 'In stock' : 'Availability unknown';
  const cls = outOfStock ? styles.badgeOut : hasAvailability ? styles.badgeIn : styles.badgeLow;
  return <span className={cls}>{label}</span>;
}

function formatRelative(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
