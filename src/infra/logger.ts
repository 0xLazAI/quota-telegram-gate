import { createLogger, format, transports } from 'winston';
const { prettyPrint, errors, combine, splat, timestamp, printf } = format;
import { randomBytes } from 'crypto';
import rTracer from 'cls-rtracer';

const instId = randomBytes(3).toString('hex');
const transportConsole = new transports.Console();

const myFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level} ${instId} ${rTracer.id() || ''} ${message}`;
});

export const logger = createLogger({
    level: 'debug',
    format: combine(
        errors({ stack: true }),
        prettyPrint(),
        splat(),
        timestamp(),
        myFormat
    ),
    transports: [transportConsole],
});


export async function withRequestId(requestId: string, func: any) {
    return rTracer.runWithId(func, requestId);
}

export async function rr(prefix: string, func: any) {
    return rTracer.runWithId(func, newRequestId(prefix));
}

export function newRequestId(prefix?: string, suffix?: string, splitter?: string) {
    let result = randomBytes(20).toString('hex');
    splitter = splitter || '-';

    if (prefix) {
        result = prefix + splitter + result;
    }

    if (suffix) {
        result = result + splitter + suffix;
    }

    return result;
}

export function currentRequestId() {
    const id = rTracer.id();
    return id ? new String(id).toString() : undefined;
}