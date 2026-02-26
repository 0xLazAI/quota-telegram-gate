import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Minimal copies of the plugin SDK types we need. Using literals avoids bundling extra deps.
type ServiceCtx = {
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
};

type Service = {
  id: string;
  start: (ctx: ServiceCtx) => void | Promise<void>;
  stop?: (ctx: ServiceCtx) => void | Promise<void>;
};

type OpenClawPluginApi = {
  registerService(service: Service): void;
};

type SchemaResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } };

type PluginConfigSchema<T = unknown> = {
  safeParse(value: unknown): SchemaResult<T>;
  jsonSchema: unknown;
};

type Plugin = {
  id: string;
  name: string;
  description: string;
  configSchema: PluginConfigSchema;
  register(api: OpenClawPluginApi): void;
};

function emptyConfigSchema(): PluginConfigSchema {
  return {
    safeParse(value) {
      if (value === void 0) return { success: true, data: void 0 };
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
          success: false,
          error: { issues: [{ path: [], message: "expected config object" }] },
        };
      }
      if (Object.keys(value).length > 0) {
        return {
          success: false,
          error: { issues: [{ path: [], message: "config must be empty" }] },
        };
      }
      return { success: true, data: value };
    },
    jsonSchema: { type: "object", additionalProperties: false, properties: {} },
  };
}

function createQuotaGateService(): Service {
  let child: ReturnType<typeof spawn> | null = null;

  return {
    id: "quota-telegram-gate",
    start(ctx) {
      const nodeBin = process.execPath;
      const gateEntry = fileURLToPath(new URL("./gate.js", import.meta.url));

      child = spawn(nodeBin, [gateEntry], {
        stdio: "inherit",
        env: process.env,
      });

      ctx.logger.info(`[quota-telegram-gate] started pid=${child.pid ?? "?"}`);
    },
    stop(ctx) {
      if (child && !child.killed) {
        child.kill("SIGTERM");
        ctx.logger.info("[quota-telegram-gate] stopped");
      }
      child = null;
    },
  };
}

const plugin: Plugin = {
  id: "quota-telegram-gate",
  name: "Quota Telegram Gate",
  description: "Routes Telegram webhooks through a quota checker before OpenClaw",
  configSchema: emptyConfigSchema(),
  register(api) {
    api.registerService(createQuotaGateService());
  },
};

export default plugin;
