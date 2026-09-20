const { chromium } = require('playwright');

const STORE_URL = 'https://demo.inelabteamdev.com';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000; // 2 s, doubles each retry: 2s -> 4s -> 8s
const NAVIGATION_TIMEOUT = 45_000;
const REVEAL_TIMEOUT = 20_000;
const PRICE_TIMEOUT = 15_000;
const LISTING_TIMEOUT = 20_000;
const CATALOG_CACHE_MS = 15 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => sleep(RETRY_BASE_MS * 2 ** attempt);

function launchBrowser() {
  return chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function dismissCookieBanner(page) {
  try {
    await page.waitForSelector('.cookie-overlay', { timeout: 8000 });
  } catch {
    return;
  }
  try {
    const acceptBtn = page.locator('.cookie-overlay button[aria-label="Accept cookies"]');
    await acceptBtn.waitFor({ state: 'visible', timeout: 3000 });
    await acceptBtn.click();
    await page.waitForSelector('.cookie-overlay', { state: 'detached', timeout: 5000 });
  } catch {
    await page.evaluate(() => {
      document.querySelectorAll('.cookie-overlay').forEach((el) => el.remove());
    });
  }
}

function skuToProductId(sku) {
  const match = String(sku).match(/(\d+)\s*$/);
  if (!match) return null;
  const n = parseInt(match[1], 10) - 10000;
  return n > 0 ? n : parseInt(match[1], 10);
}

function productUrlFromSku(sku) {
  const id = skuToProductId(sku);
  return id ? `${STORE_URL}/product/${id}` : null;
}

async function crawlCatalog({ maxPages = 50, onPage } = {}) {
  const browser = await launchBrowser();
  const context = await browser.newContext({ userAgent: 'INE-Tracker/1.0' });
  const page = await context.newPage();
  const all = [];

  try {
    for (let p = 1; p <= maxPages; p++) {
      const url = p === 1 ? `${STORE_URL}/` : `${STORE_URL}/?page=${p}`;
      let items = [];
      let pageError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) await backoff(attempt - 1);
          const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
          if (!resp || resp.status() >= 500) throw new Error(`HTTP ${resp?.status() || 'no response'}`);

          if (p === 1) await dismissCookieBanner(page);

          await page.waitForSelector('article.tile', { timeout: LISTING_TIMEOUT });

          items = await page.evaluate(() => {
            const tiles = Array.from(document.querySelectorAll('article.tile'));
            return tiles.map((tile) => {
              const name = tile.querySelector('.tile-name')?.textContent?.trim() || '';
              const brand = tile.querySelector('.tile-brand')?.textContent?.trim() || '';
              const category = tile.querySelector('.tile-category')?.textContent?.trim() || '';
              const skuText = tile.querySelector('.tile-sku')?.textContent?.trim() || '';
              const sku = skuText.replace(/^SKU\s*/i, '');
              const link = tile.querySelector('a[href*="/product/"]');
              const url = link?.href || '';
              return { name, brand, category, sku, url };
            }).filter((x) => x.name && x.sku);
          });
          console.log(`[crawl] page ${p}: found ${items.length} products`);
          break;
        } catch (err) {
          pageError = err;
          console.error(`[crawl] page ${p} attempt ${attempt + 1}: ${err.message}`);
          if (attempt === MAX_RETRIES - 1) {
            console.error(`[crawl] page ${p} failed after ${MAX_RETRIES} attempts`);
          }
        }
      }

      if (pageError && items.length === 0) {
        throw new Error(`Catalog page ${p} failed after ${MAX_RETRIES} attempts: ${pageError.message}`);
      }

      const withUrls = items
        .map((it) => ({ ...it, url: it.url || productUrlFromSku(it.sku) }))
        .filter((it) => it.url);
      all.push(...withUrls);
      if (onPage) onPage(p, withUrls.length);
      if (items.length === 0) break;
    }
  } catch (err) {
    console.error(`[crawl] fatal error: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }

  const unique = Array.from(new Map(all.map((product) => [product.url, product])).values());
  console.log(`[crawl] total ${all.length} cards crawled, ${unique.length} unique products, ${all.length - unique.length} duplicates`);
  return unique;
}

async function liveSearchFallback(query) {
  console.log(`[search] live search for: "${query}"`);
  const lower = query.toLowerCase();
  try {
    if (!liveSearchFallback.cache || Date.now() - liveSearchFallback.cache.createdAt > CATALOG_CACHE_MS) {
      if (!liveSearchFallback.refresh) {
        liveSearchFallback.refresh = crawlCatalog({ maxPages: 50 })
          .then((catalog) => {
            liveSearchFallback.cache = { catalog, createdAt: Date.now() };
            return catalog;
          })
          .finally(() => { liveSearchFallback.refresh = null; });
      }
      await liveSearchFallback.refresh;
    }
    const catalog = liveSearchFallback.cache.catalog;
    console.log(`[search] crawled ${catalog.length} products, filtering...`);
    const results = catalog.filter((p) => [p.name, p.brand, p.category, p.sku]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(lower)));
    console.log(`[search] found ${results.length} matches`);
    return results;
  } catch (err) {
    console.error(`[search] crawl failed: ${err.message}`);
    throw err;
  }
}

/**
 * The store keeps the "Reveal price" button disabled until it has observed
 * genuine mouse interaction over the price area: it requires at least
 * ~8 mousemove events (spaced at least ~40ms apart, since events arriving
 * faster are dropped) plus a ~600ms dwell after the first move. A single
 * `hover()` produces too few events, so we wiggle the mouse across the
 * price block like a human would.
 */
async function satisfyMouseRequirements(page, box) {
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const x = box.x + (box.width * i) / steps;
    const y = box.y + box.height / 2 + Math.sin(i * 1.2) * 8;
    await page.mouse.move(x, y);
    await page.waitForTimeout(70); // comfortably above the 40ms throttle
  }
}

function extractRealPriceInBrowser() {
  const block = document.querySelector('.price-block');
  if (!block) return { price: null, raw: null };

  const candidates = Array.from(block.querySelectorAll('.price-main *'));
  let best = null;

  for (const el of candidates) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none') continue;
    if (style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
    if (style.textDecoration.includes('line-through')) continue;
    const text = (el.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (/deal price/i.test(text)) continue;
    if (/%\s*off/i.test(text)) continue;
    if (!/(rs\.?|₹)\s*[\d,]+/i.test(text)) continue;
    const fontSize = parseFloat(style.fontSize) || 0;
    if (!best || fontSize > best.fontSize) {
      best = { text, fontSize };
    }
  }

  if (!best) return { price: null, raw: null };
  const match = best.text.match(/[\d,]+(\.\d+)?/);
  const price = match ? parseFloat(match[0].replace(/,/g, '')) : null;
  return { price, raw: best.text };
}

async function scrapeProduct(productUrl) {
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[scraper] retry ${attempt} for ${productUrl}`);
      await backoff(attempt - 1);
    }

    const browser = await launchBrowser();
    const context = await browser.newContext({ userAgent: 'INE-Tracker/1.0' });
    const page = await context.newPage();

    page.on('response', (resp) => {
      if (resp.url().startsWith(STORE_URL) && resp.status() >= 400) {
        console.warn(`[scraper] HTTP ${resp.status()} from ${resp.url()}`);
      }
    });

    try {
      const response = await page.goto(productUrl, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });

      if (!response || response.status() >= 500) {
        throw new Error(`HTTP ${response?.status() || 'no response'} from store`);
      }
      if (response.status() === 404) {
        throw new Error('Product not found (404)');
      }

      await dismissCookieBanner(page);
      await page.waitForSelector('.detail-card', { timeout: PRICE_TIMEOUT });

      // The price starts hidden behind a "Reveal price" button that stays
      // disabled until the store has observed ~8 spaced mousemove events
      // over the price area plus a short dwell. Simulate that interaction.
      const priceBlock = page.locator('.price-block');
      const revealBtn = page.locator('button[aria-label="Reveal price"]');

      if ((await revealBtn.count()) > 0) {
        const box = await priceBlock.boundingBox();
        if (box) await satisfyMouseRequirements(page, box);
        // Signature: waitForFunction(fn, arg, options)
        await page.waitForFunction(
          () => {
            const btn = document.querySelector('button[aria-label="Reveal price"]');
            return !btn || !btn.disabled; // enabled, or already revealed & removed
          },
          undefined,
          { timeout: REVEAL_TIMEOUT }
        );
        // The button may have been replaced by the price after hover; click
        // only if it's still present and enabled.
        if ((await revealBtn.count()) > 0 && (await revealBtn.isEnabled())) {
          await revealBtn.click();
        }
      }

      // Wait for the genuine (non-decoy) price text to appear.
      await page.waitForFunction(
        () => {
          const block = document.querySelector('.price-block');
          if (!block) return false;
          const candidates = Array.from(block.querySelectorAll('.price-main *'));
          return candidates.some((el) => {
            const s = window.getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
            if (s.textDecoration.includes('line-through')) return false;
            const t = (el.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            return !/deal price/i.test(t) && !/%\s*off/i.test(t) && /(rs\.?|₹)\s*[\d,]+/i.test(t);
          });
        },
        undefined,
        { timeout: PRICE_TIMEOUT }
      );

      let { price, raw } = await page.evaluate(extractRealPriceInBrowser);

      // Click "Refresh price" once to confirm the reading isn't a stale
      // pre-hydration artifact, then re-extract.
      const refreshBtn = page.locator('button', { hasText: 'Refresh price' });
      if ((await refreshBtn.count()) > 0) {
        await refreshBtn.first().click();
        await page.waitForTimeout(800); // brief settle for the async update
        await page
          .waitForFunction(
            () => {
              const block = document.querySelector('.price-block');
              return !!block && !block.className.includes('price-idle');
            },
            undefined,
            { timeout: PRICE_TIMEOUT }
          )
          .catch(() => {}); // non-fatal — fall back to whatever is on screen
        const refreshed = await page.evaluate(extractRealPriceInBrowser);
        if (refreshed.price != null) {
          price = refreshed.price;
          raw = refreshed.raw;
        }
      }

      const data = await page.evaluate(() => {
        const stockEl = document.querySelector('.stock-badge, [class*="stock"], [class*="availability"]');
        const explicitStock = stockEl?.textContent?.trim() || '';
        const bodyAvailability = document.body.innerText.match(/\b(out of stock|in stock|unavailable|available)\b/i)?.[0] || '';
        const stockText = explicitStock || bodyAvailability || null;
        const ratingEl = document.querySelector('[aria-label*="Rated"]');
        const rating = ratingEl?.getAttribute('aria-label') || null;
        const nameEl = document.querySelector('h1');
        const name = nameEl?.textContent?.trim() || null;
        return { stock: stockText, rating, name };
      });

      if (price === null || Number.isNaN(price) || price <= 0) {
        throw new Error(`Invalid price extracted from "${raw}"`);
      }

      return {
        price,
        stock: data.stock,
        rating: data.rating,
        name: data.name,
        raw,
        scrapedAt: new Date().toISOString(),
        attempt: attempt + 1,
      };
    } catch (err) {
      lastError = err;
      console.error(`[scraper] attempt ${attempt + 1} failed for ${productUrl}: ${err.message}`);
    } finally {
      await browser.close();
    }
  }

  const finalError = new Error(`All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  finalError.attempts = MAX_RETRIES;
  throw finalError;
}

module.exports = {
  STORE_URL,
  MAX_RETRIES,
  sleep,
  backoff,
  launchBrowser,
  dismissCookieBanner,
  skuToProductId,
  productUrlFromSku,
  crawlCatalog,
  liveSearchFallback,
  scrapeProduct,
};

