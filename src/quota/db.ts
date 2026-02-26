import sqlite3 from 'sqlite3'
import { QuotaHistoryEntry, QuotaState, UserQuotaState } from './types.js'

sqlite3.verbose()

export interface DatabaseOptions {
  path: string
}

export class QuotaDatabase {
  private db: sqlite3.Database
  private ready: Promise<void>

  constructor(options: DatabaseOptions) {
    this.db = new sqlite3.Database(options.path)
    this.ready = this.initialize()
  }

  private initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            quotaLimit INTEGER NOT NULL,
            used INTEGER NOT NULL
          )`,
          (err) => {
            if (err) return reject(err)
            this.db.run(
              `CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                ts TEXT NOT NULL,
                action TEXT NOT NULL,
                delta INTEGER NOT NULL,
                note TEXT
              )`,
              (error) => {
                if (error) return reject(error)
                resolve()
              }
            )
          }
        )
      })
    })
  }

  async getUser(userId: string, defaultLimit: number): Promise<UserQuotaState> {
    await this.ready
    const row = await this.get<{ quotaLimit: number; used: number }>(
      'SELECT quotaLimit, used FROM users WHERE userId = ?',
      [userId]
    )
    if (!row) {
      await this.run('INSERT INTO users (userId, quotaLimit, used) VALUES (?, ?, ?)', [userId, defaultLimit, 0])
      return { limit: defaultLimit, used: 0, history: [] }
    }
    return { limit: row.quotaLimit, used: row.used, history: await this.getHistory(userId) }
  }

  async updateUser(userId: string, state: UserQuotaState): Promise<void> {
    await this.ready
    await this.run('UPDATE users SET quotaLimit = ?, used = ? WHERE userId = ?', [state.limit, state.used, userId])
  }

  async insertHistory(userId: string, entry: QuotaHistoryEntry): Promise<void> {
    await this.ready
    await this.run(
      'INSERT INTO history (userId, ts, action, delta, note) VALUES (?, ?, ?, ?, ?)',
      [userId, entry.ts, entry.action, entry.delta, entry.note ?? null]
    )
  }

  private async getHistory(userId: string): Promise<QuotaHistoryEntry[]> {
    await this.ready
    const rows = await this.all<QuotaHistoryEntry & { note: string | null }>(
      'SELECT ts, action, delta, note FROM history WHERE userId = ? ORDER BY id DESC LIMIT 50',
      [userId]
    )
    return rows.map((row) => ({ ...row, note: row.note ?? undefined }))
  }

  async getState(): Promise<QuotaState> {
    await this.ready
    const rows = await this.all<{ userId: string; quotaLimit: number; used: number }>('SELECT userId, quotaLimit, used FROM users')
    const users: Record<string, UserQuotaState> = {}
    for (const row of rows) {
      users[row.userId] = {
        limit: row.quotaLimit,
        used: row.used,
        history: await this.getHistory(row.userId)
      }
    }
    return { users }
  }

  close(): void {
    this.db.close()
  }

  private run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row as T | undefined)
      })
    })
  }

  private all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows as T[])
      })
    })
  }
}
