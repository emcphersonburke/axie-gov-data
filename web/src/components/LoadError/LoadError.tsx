import styles from './LoadError.module.scss'

interface LoadErrorProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}

export default function LoadError({
  title = 'Couldn’t load treasury data',
  message,
  onRetry,
  retryLabel = 'Retry',
}: LoadErrorProps) {
  return (
    <div className={styles.page}>
      <h1>Axie Community Treasury</h1>
      <div className={styles.panel} role="alert">
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        {onRetry && (
          <button type="button" className={styles.retry} onClick={onRetry}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
