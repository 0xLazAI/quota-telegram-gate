import sqlite3 from 'sqlite3';
sqlite3.verbose();
export class QuotaDatabase {
    db;
    ready;
    constructor(options) {
        this.db = new sqlite3.Database(options.path);
        this.ready = this.initialize();
    }
    initialize() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            quotaLimit INTEGER NOT NULL,
            used INTEGER NOT NULL
          )`, (err) => {
                    if (err)
                        return reject(err);
                    this.db.run(`CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                ts TEXT NOT NULL,
                action TEXT NOT NULL,
                delta INTEGER NOT NULL,
                note TEXT
              )`, (error) => {
                        if (error)
                            return reject(error);
                        resolve();
                    });
                });
            });
        });
    }
    async getUser(userId, defaultLimit) {
        await this.ready;
        const row = await this.get('SELECT quotaLimit, used FROM users WHERE userId = ?', [userId]);
        if (!row) {
            await this.run('INSERT INTO users (userId, quotaLimit, used) VALUES (?, ?, ?)', [userId, defaultLimit, 0]);
            return { limit: defaultLimit, used: 0, history: [] };
        }
        return { limit: row.quotaLimit, used: row.used, history: await this.getHistory(userId) };
    }
    async updateUser(userId, state) {
        await this.ready;
        await this.run('UPDATE users SET quotaLimit = ?, used = ? WHERE userId = ?', [state.limit, state.used, userId]);
    }
    async insertHistory(userId, entry) {
        await this.ready;
        await this.run('INSERT INTO history (userId, ts, action, delta, note) VALUES (?, ?, ?, ?, ?)', [userId, entry.ts, entry.action, entry.delta, entry.note ?? null]);
    }
    async getHistory(userId) {
        await this.ready;
        const rows = await this.all('SELECT ts, action, delta, note FROM history WHERE userId = ? ORDER BY id DESC LIMIT 50', [userId]);
        return rows.map((row) => ({ ...row, note: row.note ?? undefined }));
    }
    async getState() {
        await this.ready;
        const rows = await this.all('SELECT userId, quotaLimit, used FROM users');
        const users = {};
        for (const row of rows) {
            users[row.userId] = {
                limit: row.quotaLimit,
                used: row.used,
                history: await this.getHistory(row.userId)
            };
        }
        return { users };
    }
    close() {
        this.db.close();
    }
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err)
                    reject(err);
                else
                    resolve(row);
            });
        });
    }
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows);
            });
        });
    }
}
