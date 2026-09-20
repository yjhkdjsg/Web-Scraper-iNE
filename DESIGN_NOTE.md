# Design Note — Scraping Reliability

## Why Playwright, Not Lightweight Fetch

The INE store is a client-rendered React SPA. A simple HTTP fetch returns ~460 bytes of empty HTML with just `<div id="root">` and a script tag. The entire page—product names, prices, and especially the price reveal button—is rendered by JavaScript. 

More critically, the price is completely hidden until the user clicks a "Reveal price" button. No HTTP request alone can trigger that interaction. **Playwright (headless Chromium) is mandatory**, not optional.

## Handling the Store's Deliberate Obstacles

### 1. Cookie Consent Overlay
The overlay blocks all pointer events until dismissed. The scraper:
- Waits for `.cookie-overlay` to appear (with timeout)
- Finds the "Accept cookies" button by aria-label
- Clicks it and waits for the overlay to detach
- Falls back to removing it from the DOM if it won't disappear

### 2. Hidden Price Behind Disabled Button
The "Reveal price" button is `disabled` for a warm-up period, then becomes clickable. The scraper:
- Detects when the button becomes enabled using `waitForFunction`
- Clicks it only after it's enabled
- Continues if the button never appears (price already visible)

### 3. Decoy Price Elements
Once revealed, `.price-main` contains multiple spans:
- A hidden `.amount[data-price]` span (`display: none`)
- A struck-through original price (`text-decoration: line-through`)
- A "Deal price" label span
- "X% off" badge
- The genuine price (largest font, no decoration, no label text)

The scraper:
- Inspects computed styles of every span in `.price-main`
- Skips anything with `display: none`, `line-through`, or label text ("Deal price", "% off")
- Picks the span with the **largest font size** (matches the store's visual hierarchy)
- Extracts the number from the text

### 4. Validation Click
The scraper clicks "Refresh price" and re-extracts to confirm the reading is live post-interaction, not a pre-hydration artifact.

### 5. Slow and Failing Responses
- Navigation uses `waitUntil: 'domcontentloaded'` (not `networkidle`, which hangs on slow background requests)
- HTTP ≥500 throws immediately into the retry loop
- 404s are permanent failures (product removed)
- Each product gets a **fresh browser instance** per retry, preventing state leaks
- **3 retries with exponential backoff**: 2s → 4s → 8s

## Never Storing Wrong Data

Before writing a price to the database:
- Validate `price > 0 && !NaN`
- On total failure, write only to `scrape_logs` with `status: 'failed'` and error message
- **Never** write a zero or null price to `price_history`
- The chart only shows real readings; failures are logged honestly, not hidden

## Search Strategy

The store has 1000 products across 50 pages. Live-scraping on every keystroke would be slow and fragile. Instead:
- Search crawls the first 5-50 pages on demand
- Filters results by name (case-insensitive `includes`)
- Fast enough for local testing; could be cached for production

## Trade-offs Made

| Decision | Trade-off |
|----------|-----------|
| Playwright over fetch | Required by JS SPA + interactive reveal. Higher memory/startup cost. |
| Largest-font extraction | Robust to class-name hashing and rotation. Depends on visual hierarchy staying constant. |
| Fresh browser per retry | More overhead, but guarantees no cross-attempt state pollution. |
| Sequential scraping | Slower, but fits free-tier memory limits (512 MB). |
| Live search | Slower first query (crawls all pages), but no sync step needed. |

## What Could Break

1. **Store changes class names**: Unlikely to break (we use semantic selectors like `article.tile`, `.price-block`, aria-labels).
2. **Store changes price styling**: Could break if the largest-font span is no longer the real price. Monitor by comparing extraction with visual inspection.
3. **Store adds more decoy elements**: Filter logic is defensive; new decoys would need explicit detection.
4. **Store changes SKU-to-URL mapping**: Currently assumes `SKU XXX-10040` → `/product/40`. Would need mapping table if this changes.
5. **Cookies disabled or iframe isolation**: Would need reconfiguration of Playwright browser args.

## Performance Notes

- First search: 2-3 minutes (crawls all 50 pages × 20 products)
- Subsequent searches: Instant if same browser context reused
- Product scrape: 10-30 seconds depending on store latency
- Retry backoff: 2s + 4s + 8s = up to 14 seconds on third retry

## Future Improvements

1. **Cache search results** in Supabase with TTL (1 hour)
2. **Per-product scrape frequency**: Allow tracking every 1, 2, 4, 12 hours
3. **Price alerts**: Email or in-app notification on drop below threshold
4. **Change detection**: Hash the page HTML structure, flag when it shifts
5. **Concurrent scraping**: Run 2-3 products in parallel (if memory allows)
