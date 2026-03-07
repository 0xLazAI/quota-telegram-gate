import dotenv from 'dotenv';
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
console.log("[env] loaded from", path.resolve(__dirname, "../../.env"));

export const {
    TG_WEBHOOK_SECRET,
    TG_BOT_TOKEN,
    OPENCLAW_LOCAL_WEBHOOK = "",
    TESXT_S,
    GATE_PORT='19080',
    IGNORE_REPLY_MENTION_BOT_NAMES,
} = process.env;

export const IGNORE_REPLY_MENTION_BOT_NAME_LIST = process.env.IGNORE_REPLY_MENTION_BOT_NAMES ? process.env.IGNORE_REPLY_MENTION_BOT_NAMES.split(',').map(String) : [];
