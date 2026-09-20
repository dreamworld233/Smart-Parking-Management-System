/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
