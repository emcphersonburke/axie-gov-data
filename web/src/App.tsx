import ErrorBoundary from '~/components/ErrorBoundary/ErrorBoundary'
import LoadError from '~/components/LoadError/LoadError'
import Loading from '~/components/Loading/Loading'
import PageContent from '~/components/PageContent/PageContent'
import { SnapshotProvider } from '~/store/SnapshotProvider'
import { useSnapshot } from '~/store/useSnapshot'

function Dashboard() {
  const state = useSnapshot()
  switch (state.status) {
    case 'loading':
      return <Loading />
    case 'error':
      return (
        <LoadError
          title="Couldn’t load treasury data"
          message={state.message}
          onRetry={state.retry}
        />
      )
    case 'ready':
      return <PageContent snapshot={state.snapshot} />
  }
}

export default function App() {
  return (
    <ErrorBoundary
      fallback={
        <LoadError
          title="Something went wrong"
          message="The dashboard hit an unexpected error while rendering."
          onRetry={() => window.location.reload()}
          retryLabel="Reload"
        />
      }
    >
      <SnapshotProvider>
        <Dashboard />
      </SnapshotProvider>
    </ErrorBoundary>
  )
}
