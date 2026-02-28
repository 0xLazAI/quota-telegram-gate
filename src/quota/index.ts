import configFile from './config/quota.config.json' with { type: 'json' }
import { QuotaOptions, UserQuotaState } from './types.js'
import { QuotaDatabase } from './db.js'
import { appendFileSync } from "node:fs";
import { join } from "path";
import { mkdirSync } from 'node:fs'

const dataDir =
  process.env.QUOTA_DATA_DIR ||
  join(process.env.HOME || '/tmp', '.openclaw', 'quota');

mkdirSync(dataDir, { recursive: true })

const DEFAULT_DATABASE = process.env.QUOTA_DB_PATH || join(dataDir, 'quota.db')

const CONFIG_DEFAULT_LIMIT = typeof configFile.defaultLimit === 'number' ? configFile.defaultLimit : 10
const CONFIG_ADMINS: string[] = Array.isArray(configFile.admins) ? configFile.admins : []
const logPath = join(
  process.env.HOME || "/tmp",
  ".openclaw",
  "quota-control1.log"
);
export interface CheckResult {
  allow: boolean
  remaining: number
  message?: string
}

export class QuotaService {
  private db: QuotaDatabase
  private defaultLimit: number
  private admins: Set<string>

  constructor(options: QuotaOptions = {}) {
    console.log("[quota-telegram-gate] DB_PATH =", DEFAULT_DATABASE);
    this.db = new QuotaDatabase({ path: options.storagePath ?? DEFAULT_DATABASE })
    this.defaultLimit = options.defaultLimit ?? CONFIG_DEFAULT_LIMIT
    const combinedAdmins = options.admins ?? CONFIG_ADMINS
    this.admins = new Set(combinedAdmins)
  }

  async check(userId: string): Promise<CheckResult> {
    const user = await this.getUser(userId)
    const remaining = Math.max(user.limit - user.used, 0)
    if(CONFIG_ADMINS.includes(userId)){
      return { allow: true, remaining:this.defaultLimit }
    }
    if (remaining <= 0) {
      return {
        allow: false,
        remaining,
        message: '额度已用完，请联系管理员或完成任务以获取更多次数。'
      }
    }
    return { allow: true, remaining }
  }

  async recordUse(userId: string, amount = 1): Promise<void> {
    const user = await this.getUser(userId)
    user.used = Math.min(user.used + amount, user.limit)
    await this.db.updateUser(userId, user)
    await this.db.insertHistory(userId, {
      ts: new Date().toISOString(),
      action: 'use',
      delta: -amount
    })
  }

  async consume(userId: string): Promise<CheckResult> {
    console.log(`[${new Date().toISOString()}] consume user=${userId}\n`)
    
    // appendFileSync(
    //   logPath,
    //   `[${new Date().toISOString()}] consume user=${userId}\n`
    // )    
    let result = await this.check(userId)
    if (result.allow) {
      await this.recordUse(userId)
      result.remaining -= 1
    }
    
    return result
  }

  async grant(actorId: string, targetUserId: string, amount: number, note?: string): Promise<void> {
    this.assertAdmin(actorId)
    if (amount === 0) return
    const user = await this.getUser(targetUserId)
    user.limit += amount
    await this.db.updateUser(targetUserId, user)
    await this.db.insertHistory(targetUserId, {
      ts: new Date().toISOString(),
      action: 'grant',
      delta: amount,
      note
    })
  }

  async setLimit(actorId: string, targetUserId: string, limit: number, note?: string): Promise<void> {
    this.assertAdmin(actorId)
    const user = await this.getUser(targetUserId)
    user.limit = limit
    if (user.used > limit) user.used = limit
    await this.db.updateUser(targetUserId, user)
    await this.db.insertHistory(targetUserId, {
      ts: new Date().toISOString(),
      action: 'set',
      delta: 0,
      note
    })
  }

  async status(userId: string): Promise<UserQuotaState> {
    return this.getUser(userId)
  }

  isAdmin(userId: string): boolean {
    return this.admins.has(userId)
  }

  private async getUser(userId: string): Promise<UserQuotaState> {
    return this.db.getUser(userId, this.defaultLimit)
  }

  private assertAdmin(userId: string): void {
    if (!this.isAdmin(userId)) {
      throw new Error('Not authorized to modify quota')
    }
  }
}

export * from './types.js'
