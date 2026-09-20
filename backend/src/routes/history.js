const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.get('/:productId/prices', async (req, res) => {
  const { productId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', productId)
    .order('scraped_at', { ascending: true })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data });
});

router.get('/:productId/logs', async (req, res) => {
  const { productId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  const { data, error } = await supabase
    .from('scrape_logs')
    .select('*')
    .eq('product_id', productId)
    .order('attempted_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ logs: data });
});

module.exports = router;
