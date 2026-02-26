import http from "node:http";
import { spawnSync } from "node:child_process";
import { QuotaService } from './quota/index.js';
import { TESXT_S } from "./config/constant.js";
function env(name, fallback) {
    const v = process.env[name] ?? fallback;
    if (v == null || v === "") {
        throw new Error(`Missing env ${name}`);
    }
    return v;
}
const QUOTA_CLI = env("QUOTA_CLI", "/Users/maozhijian/.openclaw/skills/quota-control/dist/cli.js");
const TG_BOT_TOKEN = env("TG_BOT_TOKEN", "8364053367:AAHN5zWuNy7AA4UJLfyxjWB5d37XnraRjUg");
const TG_WEBHOOK_SECRET = env("TG_WEBHOOK_SECRET", "b4d2c0a10c3f48d18a52f8b1dd85e6e5a0d6d8f4cbe6a13d0b79c5f7f4e3921f");
const OPENCLAW_LOCAL_WEBHOOK = env("OPENCLAW_LOCAL_WEBHOOK", "http://127.0.0.1:18787/telegram-webhook");
const GATE_HOST = process.env.GATE_HOST ?? "0.0.0.0";
const GATE_PORT = Number(process.env.GATE_PORT ?? "19080");
const GATE_PATH = process.env.GATE_PATH ?? "/tg/webhook";
const quota = new QuotaService();
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => (data += c.toString("utf-8")));
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}
function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function extractIds(update) {
    const from = update?.message?.from ??
        update?.edited_message?.from ??
        update?.callback_query?.from;
    const msg = update?.message ??
        update?.edited_message ??
        update?.callback_query?.message;
    const senderId = from?.id;
    const chatId = msg?.chat?.id;
    return { senderId, chatId };
}
async function consumeOrDenyLocal(senderId) {
    const consumeResult = await quota.consume(String(senderId));
    console.log("[env]test:", TESXT_S);
    return { denied: !consumeResult.allow, rawOut: consumeResult };
}
function consumeOrDeny(senderId) {
    const r = spawnSync(process.execPath, [
        QUOTA_CLI,
        "consume",
        "--user",
        String(senderId),
    ], {
        encoding: "utf-8",
    });
    const out = (r.stdout ?? "").trim();
    return { denied: out.startsWith("DENY"), rawOut: out };
}
async function tgSendMessage(chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text }),
        });
        const raw = await res.text();
        if (!res.ok) {
            console.error("Telegram API error:", res.status, raw);
        }
        else {
            console.log("Telegram success:", raw);
        }
    }
    catch (err) {
        console.error("Fetch failed:", err);
        // 把底层 cause 打印出来（你现在遇到的 ECONNRESET 就在这里）
        if (err?.cause) {
            console.error("Cause:", err.cause);
        }
    }
}
async function forwardToOpenClaw(rawBody, secretHeader) {
    const resp = await fetch(OPENCLAW_LOCAL_WEBHOOK, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-telegram-bot-api-secret-token": secretHeader,
        },
        body: rawBody,
    });
    return resp.status;
}
function ok(res) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
}
function forbidden(res) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("forbidden");
}
function notFound(res) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
}
const server = http.createServer(async (req, res) => {
    try {
        if (req.method !== "POST" || req.url !== GATE_PATH) {
            return notFound(res);
        }
        const secretHeaderRaw = req.headers["x-telegram-bot-api-secret-token"];
        const secretHeader = typeof secretHeaderRaw === "string" ? secretHeaderRaw : "";
        if (!secretHeader || secretHeader !== TG_WEBHOOK_SECRET) {
            return forbidden(res);
        }
        const raw = await readBody(req);
        const update = safeJsonParse(raw);
        if (!update) {
            return ok(res);
        }
        const { senderId, chatId } = extractIds(update);
        if (senderId && chatId) {
            const { denied } = await consumeOrDenyLocal(senderId);
            if (denied) {
                await tgSendMessage(chatId, "Your quota has been used up. Please contact the administrator or complete tasks to get more chances.");
                return ok(res);
            }
        }
        await forwardToOpenClaw(raw, secretHeader);
        return ok(res);
    }
    catch (err) {
        console.error("[quota-telegram-gate] error", err);
        return ok(res);
    }
});
server.listen(GATE_PORT, GATE_HOST, () => {
    console.log(`[quota-telegram-gate] listening http://${GATE_HOST}:${GATE_PORT}${GATE_PATH}`);
    console.log(`[quota-telegram-gate] forward -> ${OPENCLAW_LOCAL_WEBHOOK}`);
});
