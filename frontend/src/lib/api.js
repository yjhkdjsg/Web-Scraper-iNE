const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export const api = {
  searchProducts: (q) => req(`/api/products/search?q=${encodeURIComponent(q)}`),
  getProducts: () => req('/api/products'),
  trackProduct: (product) =>
    req('/api/products', { method: 'POST', body: JSON.stringify(product) }),
  deleteProduct: (id) => req(`/api/products/${id}`, { method: 'DELETE' }),
  refreshCatalog: () => req('/api/catalog/refresh/manual', { method: 'POST' }),
  scrapeNow: (id) => req(`/api/scrape/${id}`, { method: 'POST' }),
  getPriceHistory: (id) => req(`/api/history/${id}/prices`),
  getScrapeLogs: (id) => req(`/api/history/${id}/logs`),
};
