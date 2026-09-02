/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute or same-origin URL of the indexer's dashboard.json. Defaults to /data/dashboard.json. */
  readonly VITE_DATA_URL?: string
}

declare module '*.module.scss' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
