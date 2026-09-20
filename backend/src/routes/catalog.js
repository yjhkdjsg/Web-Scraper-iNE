const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { crawlCatalog } = require('../lib/scraper');

let refreshPromise = null;
let lastManualRefreshAt = 0;
const MANUAL_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

function requireCronAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function refreshCatalog() {
  if (refreshPromise) {
    const error = new Error('Catalog refresh already running');
    error.statusCode = 409;
    throw error;
  }

  refreshPromise = crawlCatalog({ maxPages: 50 })
    .then(async (catalog) => {
      if (catalog.length === 0) {
        throw new Error('Catalog crawl returned no products');
      }

      const { error } = await supabase
        .from('product_catalog')
        .upsert(catalog.map((product) => ({
          ...product,
          last_seen_at: new Date().toISOString(),
        })), { onConflict: 'url' });

      if (error) throw new Error(`Saving catalog failed: ${error.message}`);
      return catalog.length;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function respondToRefresh(req, res) {
  try {
    const count = await refreshCatalog();
    res.json({ message: 'Catalog refresh complete', count });
  } catch (err) {
    console.error(`[catalog/refresh] ${err.message}`);
    res.status(err.statusCode || 500).json({ error: 'Catalog refresh failed', detail: err.message });
  }
}

router.post('/refresh', requireCronAuth, respondToRefresh);

router.post('/refresh/manual', async (req, res) => {
  const now = Date.now();
  if (now - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN_MS) {
    const remainingMinutes = Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - (now - lastManualRefreshAt)) / 60000);
    return res.status(429).json({ error: `Catalog was refreshed recently. Try again in ${remainingMinutes} minutes.` });
  }
  try {
    const count = await refreshCatalog();
    lastManualRefreshAt = Date.now();
    res.json({ message: 'Catalog refresh complete', count });
  } catch (err) {
    console.error(`[catalog/refresh/manual] ${err.message}`);
    res.status(err.statusCode || 500).json({ error: 'Catalog refresh failed', detail: err.message });
  }
});

module.exports = router;
