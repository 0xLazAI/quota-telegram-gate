import express, { Request, Response } from 'express';
import { CheckResult, QuotaService } from './quota/index.js';
import { GATE_PORT, TESXT_S } from "./config/constant.js";
import { authMiddleware } from './infra/authMiddleware.js';
import { errorHandler } from './infra/errorHandler.js';
import { currentRequestId, logger, withRequestId } from './infra/logger.js';
import { randomUUID } from 'crypto';
import { asyncLocalStorage } from './infra/auth.js';
import { HttpError } from './infra/HttpError.js';

type TelegramUpdate = any; // we only need a few fields, keep lightweight.

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === "") {
    throw new Error(`Missing env ${name}`);
  }
  return v;
}

const TG_BOT_TOKEN = env("TG_BOT_TOKEN","8364053367:AAHN5zWuNy7AA4UJLfyxjWB5d37XnraRjUg");
const TG_WEBHOOK_SECRET = env("TG_WEBHOOK_SECRET","b4d2c0a10c3f48d18a52f8b1dd85e6e5a0d6d8f4cbe6a13d0b79c5f7f4e3921f");
const OPENCLAW_LOCAL_WEBHOOK = env(
  "OPENCLAW_LOCAL_WEBHOOK",
  "http://127.0.0.1:18787/telegram-webhook",
);
const GATE_HOST = process.env.GATE_HOST ?? "0.0.0.0";
const GATE_PATH = process.env.GATE_PATH ?? "/tg/webhook";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const MAIN_BOT_USER_NAME = process.env.MAIN_BOT_USER_NAME ?? "";
const quota = new QuotaService();

function readBody(req: Request): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c.toString("utf-8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractIds(update: TelegramUpdate): { senderId?: number; chatId?: number ; messageText?:string; replyToMessageFrom?:any} {
  const from =
    update?.message?.from ??
    update?.edited_message?.from ??
    update?.callback_query?.from;
  const msg =
    update?.message ??
    update?.edited_message ??
    update?.callback_query?.message;
  console.log("[quota-telegram-gate] message =" + JSON.stringify(update));
  const senderId: number | undefined = from?.id;
  const chatId: number | undefined = msg?.chat?.id;
  const messageText : string = msg?.text;
  const replyToMessage = msg?.reply_to_message;
  const replyToMessageFrom = replyToMessage?.from;
  return { senderId, chatId, messageText, replyToMessageFrom};
}

async function consumeOrDenyLocal(senderId: number): Promise<{ denied: boolean; rawOut: CheckResult }> {
  const consumeResult = await quota.consume(String(senderId));
  return { denied: !consumeResult.allow, rawOut: consumeResult };
}

async function tgSendMessage(chatId: number, text: string): Promise<void> {
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
    } else {
      console.log("Telegram success:", raw);
    }
  } catch (err: any) {
    console.error("Fetch failed:", err);

    if (err?.cause) {
      console.error("Cause:", err.cause);
    }
  }
}

async function handleTelegramWebhook(req: Request, res: Response) {
  const secretHeaderRaw = req.headers['x-telegram-bot-api-secret-token'];
  const secretHeader = typeof secretHeaderRaw === 'string' ? secretHeaderRaw : '';

  if (!secretHeader || secretHeader !== TG_WEBHOOK_SECRET) {
    return forbidden(res);
  }

  const rawPayload = Buffer.isBuffer(req.body)
    ? req.body.toString('utf-8')
    : typeof req.body === 'string'
      ? req.body
      : await readBody(req);

  const update = safeJsonParse<TelegramUpdate>(rawPayload);

  if (!update) {
    return ok(res);
  }

  const { senderId, chatId , messageText, replyToMessageFrom} = extractIds(update);
  if(MAIN_BOT_USER_NAME == replyToMessageFrom?.username){
     const mentionRegex = /@[\p{L}\p{N}_\-\.]+/gu;
     const mentions = messageText?.match(mentionRegex) ?? [];
     const hasMention = mentions.length > 0;
     if(hasMention){
      return ok(res);
     }
  }
  if (senderId && chatId) {
    const { denied } = await consumeOrDenyLocal(senderId);
    if (denied) {
      await tgSendMessage(
        chatId,
        'Your quota has been used up. Please contact the administrator or complete tasks to get more chances.',
      );
      return ok(res);
    }
  }

  await forwardToOpenClaw(rawPayload, secretHeader);
  return ok(res);
}

async function forwardToOpenClaw(rawBody: string, secretHeader: string): Promise<number> {
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

function ok(res: Response) {
  res.status(200).type('text/plain').send('ok');
}

function forbidden(res: Response) {
  res.status(403).type('text/plain').send('forbidden');
}

function notFound(res: Response) {
  res.status(404).type('text/plain').send('not found');
}

const app = express();

app.post(
  GATE_PATH,
  express.raw({ type: '*/*' }),
  async (req, res) => {
    try {
      await handleTelegramWebhook(req, res);
    } catch (err) {
      console.error('[quota-telegram-gate] webhook error', err);
      return ok(res);
    }
  },
);


app.use(
  (req, res, next) => {
      const requestId = req.headers['x-request-id'] as string || randomUUID();
      res.setHeader('x-request-id', requestId);
      withRequestId(requestId, () => {
          const store = {
              req: req
          };
          asyncLocalStorage.run(store, next);
      });
  }
);
app.use(express.json());
app.use(async (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  const body = req.body && Object.keys(req.body).length ? req.body : undefined;
  
  logger.info(`[REQ] ${method} ${originalUrl}`, { body });
  
  // 监听响应完成，打印返回
  res.on('finish', () => {
  const duration = Date.now() - start;
  const status = res.statusCode;
  logger.info(`[RES] ${method} ${originalUrl} ${status} (${duration}ms)`);
  });
  
  next();
});
app.use(authMiddleware);

app.post(
  '/admin/addQuotaLimit',
  async (req, res, next) => {
    try {
      const adminToken = req.headers['at'];
      console.log("at" + adminToken);
      if(ADMIN_TOKEN != adminToken){
         throw new HttpError(403, 'not auth');
      }
      await quota.setLimit(null, req.body.targetUserId, req.body.limit);
      res.json({ data: "success", code: 200 , requestId: currentRequestId()}); 
    } catch (error) {
      next(error);
    }
  },
)

app.use((req, res) => {
  return notFound(res);
});
app.use(errorHandler);

app.listen(Number(GATE_PORT), GATE_HOST, () => {
  console.log(`[quota-telegram-gate] listening http://${GATE_HOST}:${GATE_PORT}${GATE_PATH}`);
  console.log(`[quota-telegram-gate] forward -> ${OPENCLAW_LOCAL_WEBHOOK}`);
});



