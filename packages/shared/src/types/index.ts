export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  environment: string
  services: {
    postgres?: 'connected' | 'disconnected' | 'error'
    redis?: 'connected' | 'disconnected' | 'error'
    storage?: 'ready' | 'unavailable'
  }
  version: string
}

export type StorageProviderType = 'local' | 's3'

export interface StorageConfig {
  provider: StorageProviderType
  localBasePath?: string
  s3Bucket?: string
  s3Region?: string
}
