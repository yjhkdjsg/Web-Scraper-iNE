import React, { useState } from 'react';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import ProductDetail from './pages/ProductDetail';
import styles from './App.module.css';

export default function App() {
  const [selectedProduct, setSelectedProduct] = useState(null);

  return (
    <div className={styles.app}>
      <Header onHome={() => setSelectedProduct(null)} />
      <main className={styles.main}>
        {selectedProduct ? (
          <ProductDetail
            product={selectedProduct}
            onBack={() => setSelectedProduct(null)}
          />
        ) : (
          <Dashboard onSelect={setSelectedProduct} />
        )}
      </main>
    </div>
  );
}
