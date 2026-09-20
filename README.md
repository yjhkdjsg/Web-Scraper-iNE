# INE Price Tracker

Track product prices from the INE mock store.
# INE Price Tracker

Track product prices from the INE mock store.

## Local Setup

### 1. Database Setup

Create a Supabase project and run `supabase/schema.sql` in the SQL editor.

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npx playwright install chromium

### Render deployment with Docker

The backend uses Playwright, so deploy it on Render as a Docker Web Service:

- Root directory: `backend`
- Dockerfile path: `Dockerfile`
- Health check path: `/health`

The repository includes `backend/Dockerfile`, based on the official
`mcr.microsoft.com/playwright:v1.63.0-jammy` image. That image already contains
the Linux libraries and browser runtime required by Playwright. Do not use
`FROM ://microsoft.com`; the complete image name must include the `mcr` host
and image tag.

Set the following variables in Render's Environment tab. Do not commit them or
put them in the Dockerfile:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_your_server_key
CRON_SECRET=your_long_random_cron_secret
FRONTEND_URL=https://your-frontend.vercel.app
HEADLESS=true
```

Render supplies `PORT` automatically. After changing environment variables,
redeploy or restart the service. Keep `SUPABASE_SERVICE_KEY` server-side only;
never add it to the frontend or `VITE_*` variables.
npm run dev
```

Backend runs at http://localhost:3001

### 3. Frontend Setup

```bash
cd frontend
cp .env.example .env
# Set VITE_API_URL=http://localhost:3001
npm install
npm run dev
```

Frontend runs at http://localhost:5173

## Usage

1. Search for products (live search, takes a few seconds)
2. Click "Track" to add products
3. Click "Scrape now" to get price and stock
4. View price history and scrape logs

## Scheduled scraping

Configure an external cron service such as cron-job.org to send the tracked
price job every 2 hours:

```text
POST https://<render-backend>/api/scrape/run
Authorization: Bearer <CRON_SECRET>
```

Run it every 2 hours. The backend processes tracked products sequentially. Each
product navigation is retried up to three times with exponential backoff. A
successful scrape writes price history, the tracked product snapshot, and a
success/retried log entry. A failed scrape writes a failed log entry and never
overwrites the last known price or stock.

The search catalog is crawled from the INE store and cached in memory for 15
minutes. An exhausted catalog-page retry fails the search rather than returning
an incomplete catalog.

Configure a second, lower-frequency cron job for catalog discovery:

```text
POST https://<render-backend>/api/catalog/refresh
Authorization: Bearer <CRON_SECRET>
```

Run it daily or every 6-12 hours. It crawls the storefront listing pages and
upserts product names, brands, categories, SKUs, and real product links into
`product_catalog`. User search reads this table and does not crawl the store.
The first search after a fresh database can bootstrap the catalog automatically;
later no-match searches remain database-only.

## Environment variables

Backend (`backend/.env`):

- `PORT` - Render-provided HTTP port (defaults to `3001` locally)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service-role key; keep this server-side
- `CRON_SECRET` - shared secret for the scheduled scrape endpoint
- `FRONTEND_URL` - deployed frontend origin for CORS
- `HEADLESS` - leave unset for unattended runs; set to `false` for a visible run

Frontend (`frontend/.env`):

- `VITE_API_URL` - backend base URL, for example `http://localhost:3001`

If the database already has the previous schema, rerun `supabase/schema.sql` to
create the new `product_catalog` table and its indexes before using catalog
search.

## Scripts

Backend:
- `npm run dev` - Start server
- `npm run scrape:headed` - Run scraper with visible browser
- `npm run scrape:test` - Test scraper on single product

Frontend:
- `npm run dev` - Start dev server
- `npm run build` - Build for production

## Reliability design note

The store uses delayed rendering, decoy price values, and a mouse-gated price
reveal. The scraper waits for the detail shell, simulates spaced pointer
movement over the price block, waits for an eligible visible price, ignores
hidden and crossed-out decoys, and validates that the extracted value is
positive. Navigation and extraction retry independently at the browser-run
level. Database write errors are treated as scrape failures, so the API cannot
claim success while history or the current snapshot was lost.

The trade-off is Playwright rather than lightweight HTTP parsing: the store's
interaction and asynchronous rendering make a browser the more reliable
choice. The headed script uses the same scraper path with `HEADLESS=false` so
the recorded run demonstrates the production behavior.
