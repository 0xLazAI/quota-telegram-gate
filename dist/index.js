import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
function emptyConfigSchema() {
    return {
        safeParse(value) {
            if (value === void 0)
                return { success: true, data: void 0 };
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
function createQuotaGateService() {
    let child = null;
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
const plugin = {
    id: "quota-telegram-gate",
    name: "Quota Telegram Gate",
    description: "Routes Telegram webhooks through a quota checker before OpenClaw",
    configSchema: emptyConfigSchema(),
    register(api) {
        api.registerService(createQuotaGateService());
    },
};
export default plugin;
