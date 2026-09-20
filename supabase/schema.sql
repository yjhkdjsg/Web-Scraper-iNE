CREATE TABLE IF NOT EXISTS product_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  sku         TEXT,
  brand       TEXT,
  category    TEXT,
  url         TEXT NOT NULL UNIQUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_name ON product_catalog(name);
CREATE INDEX IF NOT EXISTS idx_product_catalog_brand ON product_catalog(brand);
CREATE INDEX IF NOT EXISTS idx_product_catalog_sku ON product_catalog(sku);

CREATE TABLE IF NOT EXISTS tracked_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  sku             TEXT,
  brand           TEXT,
  category        TEXT,
  url             TEXT NOT NULL UNIQUE,
  last_price      NUMERIC(10, 2),
  last_stock      TEXT,
  last_scraped_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  price       NUMERIC(10, 2) NOT NULL,
  stock       TEXT,
  scraped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, scraped_at);

CREATE TABLE IF NOT EXISTS scrape_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL CHECK (status IN ('success', 'retried', 'failed')),
  price        NUMERIC(10, 2),
  stock        TEXT,
  attempts     INT DEFAULT 1,
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_product ON scrape_logs(product_id, attempted_at);

ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

