const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { scrapeProduct } = require('../lib/scraper');

let scrapeRunActive = false;

function requireDbResult(result, operation) {
  if (result.error) {
    throw new Error(`${operation} failed: ${result.error.message}`);
  }
  return result.data;
}

async function writeScrapeResult(product, scraped, logBase) {
  requireDbResult(await supabase.from('price_history').insert({
    product_id: product.id,
    price: scraped.price,
    stock: scraped.stock,
    scraped_at: scraped.scrapedAt,
  }), 'Saving price history');

  requireDbResult(await supabase
    .from('tracked_products')
    .update({
      last_price: scraped.price,
      last_stock: scraped.stock,
      last_scraped_at: scraped.scrapedAt,
    })
    .eq('id', product.id), 'Updating tracked product');

  requireDbResult(await supabase.from('scrape_logs').insert({
    ...logBase,
    status: scraped.attempt > 1 ? 'retried' : 'success',
    price: scraped.price,
    stock: scraped.stock,
    attempts: scraped.attempt,
    note: scraped.attempt > 1 ? `Succeeded after ${scraped.attempt} attempts` : null,
  }), 'Saving scrape log');
}

async function writeFailureLog(logBase, error) {
  const result = await supabase.from('scrape_logs').insert({
    ...logBase,
    status: 'failed',
    price: null,
    stock: null,
    attempts: error.attempts || 3,
    note: error.message,
  });
  if (result.error) {
    console.error(`[scrape] Could not save failure log: ${result.error.message}`);
  }
}

/**
 * POST /api/scrape/run
 * Called by cron-job.org every 2 hours (and can be called manually).
 * Protected by a shared secret in Authorization header.
 *
 * Scrapes all tracked products sequentially to avoid hammering the store.
 */
router.post('/run', async (req, res) => {
  // Simple bearer-token guard
  const auth = req.headers['authorization'] || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (scrapeRunActive) {
    return res.status(409).json({ error: 'Scrape run already in progress' });
  }
  scrapeRunActive = true;

  try {
    // Fetch all tracked products
    const { data: products, error: fetchErr } = await supabase
      .from('tracked_products')
      .select('*');

    if (fetchErr) {
      return res.status(500).json({ error: fetchErr.message });
    }

    if (!products || products.length === 0) {
      return res.json({ message: 'No products to scrape', results: [] });
    }

    const results = [];

    for (const product of products) {
    const logBase = {
      product_id: product.id,
      attempted_at: new Date().toISOString(),
    };

    try {
      const scraped = await scrapeProduct(product.url);

      await writeScrapeResult(product, scraped, logBase);

      results.push({ id: product.id, name: product.name, status: 'success', price: scraped.price });
      console.log(`[scrape/run] ✓ ${product.name} → $${scraped.price}`);
    } catch (err) {
      // Log failure honestly
      await writeFailureLog(logBase, err);

      results.push({ id: product.id, name: product.name, status: 'failed', error: err.message });
      console.error(`[scrape/run] ✗ ${product.name}: ${err.message}`);
    }
    }

    res.json({ message: 'Scrape complete', results });
  } finally {
    scrapeRunActive = false;
  }
});

router.post('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: product, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const logBase = {
    product_id: product.id,
    attempted_at: new Date().toISOString(),
  };

  try {
    const scraped = await scrapeProduct(product.url);

    await writeScrapeResult(product, scraped, logBase);

    res.json({ success: true, price: scraped.price, stock: scraped.stock });
  } catch (err) {
    await writeFailureLog(logBase, err);

    res.status(500).json({ error: 'Scrape failed', detail: err.message });
  }
});

module.exports = router;
