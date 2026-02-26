import configFile from './config/quota.config.json' with { type: 'json' };
import { QuotaDatabase } from './db.js';
import { appendFileSync } from "node:fs";
const DEFAULT_DATABASE = new URL('../quota.db', import.meta.url).pathname;
const CONFIG_DEFAULT_LIMIT = typeof configFile.defaultLimit === 'number' ? configFile.defaultLimit : 10;
const CONFIG_ADMINS = Array.isArray(configFile.admins) ? configFile.admins : [];
export class QuotaService {
    db;
    defaultLimit;
    admins;
    constructor(options = {}) {
        this.db = new QuotaDatabase({ path: options.storagePath ?? DEFAULT_DATABASE });
        this.defaultLimit = options.defaultLimit ?? CONFIG_DEFAULT_LIMIT;
        const combinedAdmins = options.admins ?? CONFIG_ADMINS;
        this.admins = new Set(combinedAdmins);
    }
    async check(userId) {
        const user = await this.getUser(userId);
        const remaining = Math.max(user.limit - user.used, 0);
        if (CONFIG_ADMINS.includes(userId)) {
            return { allow: true, remaining: this.defaultLimit };
        }
        if (remaining <= 0) {
            return {
                allow: false,
                remaining,
                message: '额度已用完，请联系管理员或完成任务以获取更多次数。'
            };
        }
        return { allow: true, remaining };
    }
    async recordUse(userId, amount = 1) {
        const user = await this.getUser(userId);
        user.used = Math.min(user.used + amount, user.limit);
        await this.db.updateUser(userId, user);
        await this.db.insertHistory(userId, {
            ts: new Date().toISOString(),
            action: 'use',
            delta: -amount
        });
    }
    async consume(userId) {
        appendFileSync(`/Users/maozhijian/.openclaw/quota-control1.log`, `[${new Date().toISOString()}] consume user=${userId}\n`);
        let result = await this.check(userId);
        if (result.allow) {
            await this.recordUse(userId);
            result.remaining -= 1;
        }
        return result;
    }
    async grant(actorId, targetUserId, amount, note) {
        this.assertAdmin(actorId);
        if (amount === 0)
            return;
        const user = await this.getUser(targetUserId);
        user.limit += amount;
        await this.db.updateUser(targetUserId, user);
        await this.db.insertHistory(targetUserId, {
            ts: new Date().toISOString(),
            action: 'grant',
            delta: amount,
            note
        });
    }
    async setLimit(actorId, targetUserId, limit, note) {
        this.assertAdmin(actorId);
        const user = await this.getUser(targetUserId);
        user.limit = limit;
        if (user.used > limit)
            user.used = limit;
        await this.db.updateUser(targetUserId, user);
        await this.db.insertHistory(targetUserId, {
            ts: new Date().toISOString(),
            action: 'set',
            delta: 0,
            note
        });
    }
    async status(userId) {
        return this.getUser(userId);
    }
    isAdmin(userId) {
        return this.admins.has(userId);
    }
    async getUser(userId) {
        return this.db.getUser(userId, this.defaultLimit);
    }
    assertAdmin(userId) {
        if (!this.isAdmin(userId)) {
            throw new Error('Not authorized to modify quota');
        }
    }
}
export * from './types.js';
