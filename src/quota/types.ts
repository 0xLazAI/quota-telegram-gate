export interface QuotaHistoryEntry {
  ts: string
  action: 'use' | 'grant' | 'set'
  delta: number
  note?: string
}

export interface UserQuotaState {
  limit: number
  used: number
  history: QuotaHistoryEntry[]
}

export interface QuotaState {
  users: Record<string, UserQuotaState>
}

export interface QuotaOptions {
  storagePath?: string
  defaultLimit?: number
  admins?: string[]
}
