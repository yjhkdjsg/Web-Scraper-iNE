/**
 * testScrape.js
 *
 * Quick test script to verify the scraper works without setting up the
 * full backend or database. Useful for debugging scraping logic.
 *
 * Usage: node src/scripts/testScrape.js [product-id]
 * Example: node src/scripts/testScrape.js 36
 */

require('dotenv').config();
process.env.HEADLESS = process.env.HEADLESS || 'false';

const { scrapeProduct, STORE_URL } = require('../lib/scraper');

async function main() {
  const productId = process.argv[2] || '36';
  const url = `${STORE_URL}/product/${productId}`;

  console.log('=== INE Tracker — Scrape Test ===');
  console.log(`Testing scraper on: ${url}`);
  console.log(`Headless mode: ${process.env.HEADLESS}\n`);

  const start = Date.now();

  try {
    const result = await scrapeProduct(url);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('\n✓ Scrape succeeded!');
    console.log('─────────────────────────────────');
    console.log(`Product:  ${result.name || 'N/A'}`);
    console.log(`Price:    ₹${result.price.toLocaleString('en-IN')}`);
    console.log(`Stock:    ${result.stock || 'N/A'}`);
    console.log(`Rating:   ${result.rating || 'N/A'}`);
    console.log(`Raw:      ${result.raw || 'N/A'}`);
    console.log(`Attempts: ${result.attempt}`);
    console.log(`Time:     ${elapsed}s`);
    console.log('─────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`\n✗ Scrape failed after ${elapsed}s`);
    console.error(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
