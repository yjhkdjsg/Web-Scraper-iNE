require('dotenv').config();
const express = require('express');
const cors = require('cors');
const productsRouter = require('./routes/products');
const scrapeRouter = require('./routes/scrape');
const historyRouter = require('./routes/history');
const catalogRouter = require('./routes/catalog');

const app = express();
const PORT = process.env.PORT || 3001;

const requiredConfig = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CRON_SECRET'];
const missingConfig = requiredConfig.filter((name) => !process.env[name]);
if (missingConfig.length > 0) {
  console.error(`[config] Missing required environment variables: ${missingConfig.join(', ')}`);
} else {
  console.log('[config] Supabase and cron configuration loaded');
}

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health check — keeps Render warm
app.get('/health', (req, res) => {
  res.json({
    status: missingConfig.length === 0 ? 'ok' : 'misconfigured',
    ts: new Date().toISOString(),
    config: { missing: missingConfig },
  });
});

app.use('/api/products', productsRouter);
app.use('/api/scrape', scrapeRouter);
app.use('/api/history', historyRouter);
app.use('/api/catalog', catalogRouter);

app.listen(PORT, () => {
  console.log(`INE Tracker backend running on port ${PORT}`);
});
