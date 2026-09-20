/**
 * headedRun.js
 *
 * Run the scraper in headed (visible browser) mode for recording.
 * Usage: npm run scrape:headed
 *
 * Shows: navigation, async price load, retry on slow/error response.
 */

require('dotenv').config();
process.env.HEADLESS = 'false';

const supabase = require('../lib/supabase');
const { scrapeProduct } = require('../lib/scraper');

async function main() {
  console.log('=== INE Tracker — Headed Scrape Run ===');
  console.log('Browser will be visible. Watch the price load asynchronously.\n');

  const { data: products } = await supabase
    .from('tracked_products')
    .select('*')
    .limit(3);

  if (!products || products.length === 0) {
    console.log('No tracked products found. Add some via the frontend first.');
    process.exit(0);
  }

  for (const product of products) {
    console.log(`\n→ Scraping: ${product.name}`);
    console.log(`  URL: ${product.url}`);

    const start = Date.now();
    try {
      const result = await scrapeProduct(product.url);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ✓ Price: ₹${result.price}  |  Stock: ${result.stock}`);
      console.log(`  Took ${elapsed}s, ${result.attempt} attempt(s)`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }

    // Pause between products so viewer can see the browser
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('\n=== Run complete ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
