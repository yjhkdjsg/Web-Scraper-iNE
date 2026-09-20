import React from 'react';
import styles from './Header.module.css';

export default function Header({ onHome }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button className={styles.logo} onClick={onHome} aria-label="Home">
          <span className={styles.mark} aria-hidden="true"><span /></span>
          <span className={styles.wordmark}>INE Store</span>
        </button>
        <span className={styles.sub}>Everyday goods, honestly priced.</span>
      </div>
    </header>
  );
}
