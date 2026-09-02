import styles from './Loading.module.scss'

export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <h1>Axie Community Treasury</h1>
      <p className={styles.message}>Loading treasury data…</p>
    </div>
  )
}
