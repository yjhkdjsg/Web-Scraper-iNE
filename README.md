# INE Product Price Tracker

A full-stack web application that tracks product prices from the INE mock store. Search for products, add them to your watchlist, and the app scrapes their current price and stock on demand or on a schedule.

## Features

- **Product Search**: Live search across 1000 products from the INE store
- **Price Tracking**: Scrape current price and stock for tracked products
- **Price History**: View price changes over time with interactive charts
- **Scrape Logs**: Complete log of all scraping attempts with success/failure status
- **Robust Scraping**: Handles cookie banners, lazy-loaded prices, decoy elements, and retry logic

## Tech Stack

- Frontend: React 18 + Vite + Recharts
- Backend: Node.js + Express
- Database: Supabase (PostgreSQL)
- Scraping: Playwright (Chromium)

## Local Setup

### Prerequisites
- Node.js 18+
- Supabase account (free tier)

### 1. Database

Create a Supabase project. In the SQL editor, run `supabase/schema.sql`:

```bash
# Copy supabase/schema.sql content into Supabase SQL editor and execute
```

### 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```
PORT=3001
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_KEY=your-service-role-key
CRON_SECRET=any-random-string
FRONTEND_URL=http://localhost:5173
HEADLESS=true
```

Install and run:
```bash
npm install
npx playwright install chromium
npm run dev
```

Backend at `http://localhost:3001`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:
```
VITE_API_URL=http://localhost:3001
```

Install and run:
```bash
npm install
npm run dev
```

Frontend at `http://localhost:5173`

## Usage

1. Open the app in your browser
2. Search for a product (e.g., "laptop")
3. Click "Track" to add it to your watchlist
4. Click "Scrape now" to fetch current price and stock
5. View price history and scrape logs on the product detail page

## Scripts

Backend:
- `npm run dev` - Start dev server
- `npm run scrape:headed` - Run scraper with visible browser
- `npm run scrape:test [id]` - Test scraper on single product

Frontend:
- `npm run dev` - Start dev server
- `npm run build` - Build for production

## How It Works

### Search
Live search crawls the first 5-50 pages of the store and filters by product name.

### Scraping
- Handles cookie consent overlay
- Waits for "Reveal price" button to become enabled
- Extracts real price by filtering decoy elements (hidden, struck-through, labels)
- Validates by clicking "Refresh price"
- Retries up to 3 times with exponential backoff on failure
- Logs all attempts honestly (success, retried, or failed)

### Database
- `tracked_products`: Products you're monitoring
- `price_history`: All price/stock readings
- `scrape_logs`: Complete scrape attempt history

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/products` | List tracked products |
| GET | `/api/products/search?q=` | Search products |
| POST | `/api/products` | Start tracking |
| DELETE | `/api/products/:id` | Stop tracking |
| POST | `/api/scrape/:id` | Scrape one product |
| GET | `/api/history/:id/prices` | Price history |
| GET | `/api/history/:id/logs` | Scrape logs |

## Deployment

### Frontend (Vercel)
- Set `VITE_API_URL` to your backend URL

### Backend (Render)
- Build: `npm install && npx playwright install chromium --with-deps`
- Start: `npm start`
- Set all environment variables

### Scheduled Scraping
Use cron-job.org to trigger `POST /api/scrape/run` every 2 hours.

## Local Development Notes

- Search takes 2-3 minutes on first query (crawls all pages)
- Each scrape takes 10-30 seconds depending on store response
- Run `npm run scrape:headed` to watch the scraper in action
- Check backend console for detailed logs
