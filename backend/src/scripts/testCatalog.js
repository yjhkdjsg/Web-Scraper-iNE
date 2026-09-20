/**
 * testCatalog.js — crawl the first 2 listing pages and print what the
 * catalog extractor finds, without touching Supabase.
 *
 * Usage: node src/scripts/testCatalog.js
 */

const { crawlCatalog } = require('../lib/scraper');

(async () => {
  const items = await crawlCatalog({
    maxPages: 2,
    onPage: (p, n) => console.log(`page ${p}: ${n} products`),
  });
  console.log(`\nTotal: ${items.length}`);
  console.log(items.slice(0, 5));
  process.exit(0);
})();
