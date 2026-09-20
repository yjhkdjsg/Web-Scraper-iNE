const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { crawlCatalog } = require('../lib/scraper');

function cleanSearchQuery(value) {
  return value.replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

router.get('/search', async (req, res) => {
  const q = cleanSearchQuery(req.query.q?.trim() || '');
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const pattern = `%${q}%`;
    let { data, error } = await supabase
      .from('product_catalog')
      .select('name, sku, brand, category, url')
      .or(`name.ilike.${pattern},brand.ilike.${pattern},category.ilike.${pattern},sku.ilike.${pattern}`)
      .order('name', { ascending: true })
      .limit(30);

    if (error) throw error;

    if (!data || data.length === 0) {
      const { data: catalogExists, error: catalogError } = await supabase
        .from('product_catalog')
        .select('id')
        .limit(1);
      if (catalogError) throw catalogError;
      if (catalogExists && catalogExists.length > 0) {
        return res.json({ results: [] });
      }

      const { data: catalog, error: crawlError } = await crawlCatalog({ maxPages: 50 });
      if (catalog.length > 0) {
        const upserted = await supabase
          .from('product_catalog')
          .upsert(catalog.map((product) => ({ ...product, last_seen_at: new Date().toISOString() })), { onConflict: 'url' });
        if (upserted.error) throw upserted.error;
      }
      data = catalog.filter((product) => [product.name, product.brand, product.category, product.sku]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q.toLowerCase())))
        .slice(0, 30);
    }

    res.json({ results: data || [] });
  } catch (err) {
    console.error(`[api/search] failed: ${err.message}`);
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ products: data });
});

router.post('/', async (req, res) => {
  const { name, sku, brand, category, url } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'name and url are required' });
  }

  const { data: existing } = await supabase
    .from('tracked_products')
    .select('id')
    .eq('url', url)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'Product already tracked' });
  }

  const { data, error } = await supabase
    .from('tracked_products')
    .insert({ name, sku, brand, category, url })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ product: data });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('tracked_products')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
