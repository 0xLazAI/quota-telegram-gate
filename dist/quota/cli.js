#!/usr/bin/env node
import { QuotaService } from './index.js';
const args = process.argv.slice(2);
const usage = `Usage:
  quota-cli check --user <id>
  quota-cli use --user <id> [--amount <n>]
  quota-cli consume --user <id>
  quota-cli grant --actor <adminId> --user <targetId> --amount <n> [--note text]
  quota-cli set --actor <adminId> --user <targetId> --limit <n> [--note text]
  quota-cli status --user <id>`;
function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token.startsWith('--')) {
            const key = token.slice(2);
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`Missing value for ${token}`);
            }
            result[key] = value;
            i++;
        }
        else if (!result._command) {
            result._command = token;
        }
    }
    return result;
}
async function main() {
    if (args.length === 0) {
        console.error(usage);
        process.exit(1);
    }
    const parsed = parseArgs(args);
    const quota = new QuotaService();
    const command = parsed._command;
    try {
        switch (command) {
            case 'check': {
                const user = parsed.user;
                if (!user)
                    throw new Error('Missing --user');
                const result = await quota.check(user);
                if (!result.allow) {
                    console.log(`DENY ${result.message ?? 'No quota remaining.'}`);
                    process.exit(2);
                }
                else {
                    console.log(`ALLOW ${result.remaining}`);
                }
                break;
            }
            case 'use': {
                const user = parsed.user;
                const amount = parsed.amount ? parseInt(parsed.amount, 10) : 1;
                if (!user || Number.isNaN(amount))
                    throw new Error('use requires --user and optional --amount');
                await quota.recordUse(user, amount);
                console.log('OK use');
                break;
            }
            case 'consume': {
                const user = parsed.user;
                if (!user)
                    throw new Error('Missing --user');
                const result = await quota.consume(user);
                if (!result.allow) {
                    console.log(`DENY ${result.message ?? 'No quota remaining.'}`);
                    process.exit(2);
                }
                else {
                    console.log(`ALLOW ${result.remaining}`);
                }
                break;
            }
            case 'grant': {
                const actor = parsed.actor;
                const user = parsed.user;
                const amount = parseInt(parsed.amount ?? '', 10);
                if (!actor || !user || Number.isNaN(amount))
                    throw new Error('grant requires --actor, --user, --amount');
                await quota.grant(actor, user, amount, parsed.note);
                console.log('OK grant');
                break;
            }
            case 'set': {
                const actor = parsed.actor;
                const user = parsed.user;
                const limit = parseInt(parsed.limit ?? '', 10);
                if (!actor || !user || Number.isNaN(limit))
                    throw new Error('set requires --actor, --user, --limit');
                await quota.setLimit(actor, user, limit, parsed.note);
                console.log('OK set');
                break;
            }
            case 'status': {
                const user = parsed.user;
                if (!user)
                    throw new Error('status requires --user');
                const state = await quota.status(user);
                console.log(JSON.stringify(state, null, 2));
                break;
            }
            default:
                console.error(usage);
                process.exit(1);
        }
    }
    catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}
main();
