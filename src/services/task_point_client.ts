import { asyncLocalStorage } from "../infra/auth.js";
import { currentRequestId, logger } from "../infra/logger.js";

const {
    TASK_POINT_URL = 'https://163ae2e1f39e.ngrok-free.app',
} = process.env;

export async function taskPointPost(uri: string, body: any, headers: any, needAuth: boolean) {
    logger.info("%s params: %s", uri, JSON.stringify(body));
    logger.info("url:" + TASK_POINT_URL);
    const traceId = currentRequestId();
    if (!headers) {
        headers = {};
    }
    headers['Content-Type'] = 'application/json';
    headers['x-server-call'] = 'true';
    if (traceId != null) {
        headers['traceId'] = traceId;
    }
    const store = asyncLocalStorage.getStore();
    if (needAuth && store?.req?.headers['authorization']) {
        headers['Authorization'] = store.req.headers['authorization'];
    }
    let response = null;
    try {
        response = await fetch(TASK_POINT_URL + uri, {
            method: 'POST', // or 'POST', 'PUT', etc.
            headers: headers,
            body: JSON.stringify(body)
        });
    } catch (error) {
        logger.error(error);
        throw new Error(`${uri} network error`);
    }
    const data = await response.json();
    logger.info("%s result: %s", uri, JSON.stringify(data));
    if (200 != data.code) {
        if (401 == data.code) {
            throw new Error('Invalid token');
        }
        throw new Error(`${uri} biz error`);
    }

    return data.data;
}

export async function taskPointGet(uri: string, params: any, headers: any, needAuth: boolean) {

    logger.info("%s params: %s", uri, JSON.stringify(params));
    logger.info("url:" + TASK_POINT_URL);

    const traceId = currentRequestId();
    if (!headers) {
        headers = {};
    }
    headers['Content-Type'] = 'application/json';
    headers['x-server-call'] = 'true';
    if (traceId != null) {
        headers['traceId'] = traceId;
    }
    const store = asyncLocalStorage.getStore();
    if (needAuth && store?.req?.headers['authorization']) {
        headers['Authorization'] = store.req.headers['authorization'];
    }
    let queryParams = objectToQueryParams(params);
    if (queryParams) {
        queryParams = "?" + queryParams;
    }
    const wholeUri = uri + queryParams;

    const response = await fetch(TASK_POINT_URL + wholeUri, {
        method: 'GET', // or 'POST', 'PUT', etc.
        headers: headers
    });
    const data = await response.json();
    logger.info("%s result: %s", uri, JSON.stringify(data));
    if (data.code != 200) {
        if (401 == data.code) {
            throw new Error('Invalid token');
        }
        throw new Error(`${uri} biz error`);
    }
    return data.data;
}

function objectToQueryParams(obj: Record<string, any>, keepNull = false): string {
    const params = new URLSearchParams();

    if (!obj || Object.keys(obj).length === 0) {
        return ""; // 空对象直接返回空字符串
    }

    for (const [key, value] of Object.entries(obj)) {
        if (value == null) {
            if (keepNull) {
                params.append(key, "");
            }
            continue;
        }

        if (Array.isArray(value)) {
            value.forEach(v => {
                if (v != null) {
                    params.append(key, String(v));
                } else if (keepNull) {
                    params.append(key, "");
                }
            });
        } else {
            params.append(key, String(value));
        }
    }

    return params.toString();
}