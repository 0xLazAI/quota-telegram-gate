
import { isAddress } from 'ethers';
import { logger } from './logger.js';
import { taskPointGet } from '../services/task_point_client.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Request as ExpressRequest } from 'express';


export async function getUserFromToken(req) {
    const [bearer, token] = ((req.headers['authorization'] || req.headers['Authorization'] || '') as string).split(' ');
    console.log("token is %s", token);
    let user = null;
    if (bearer === 'Bearer' && token) {
        try {
            user = await auth(token);
        }
        catch (error) {
            console.error("get user info failed from token:%s" + token);
        }
    }
    return user;
}

export async function auth(token: string): Promise<UserInfo> {
    const userInfo = await getTokenUserInfo(token)

    // const userRecorded = await getCache(`user:${userInfo.ethAddress}`)
    // if (!userRecorded) {
    //     await userRepository.upsert({
    //         address: userInfo.ethAddress,
    //         taskPointUserId: userInfo.id,
    //     }, {
    //         conflictPaths: ['address'],
    //     })
    //     await setCache(`user:${userInfo.ethAddress}`, userInfo.ethAddress)
    // }

    return userInfo;
}

export async function getTokenUserInfo(token: string): Promise<UserInfo> {
    try {
        // 首先对 token 进行 Base64 解码
        // const decodedToken = Buffer.from(token, 'base64').toString('utf-8');
        // 使用 JWT 验证并解析 token
        const start = Date.now();
        const decodeData = await decodeToken(token);
        console.log("decodeToken time:", Date.now() - start, "ms");
        const obj = decodeData as { exp: number, userInfo: UserInfo };
        const { ethAddress } = obj.userInfo;

        return { ...obj.userInfo, ethAddress: ethAddress.toLowerCase(), token };
    } catch (error) {
        console.error('Token verification failed:', error);
        throw new Error('Invalid token');
    }
}

export async function decodeToken(token: string): Promise<{ exp: number, userInfo: UserInfo }> {
    try {
        return await taskPointGet('/user/decodeToken', { 'token': token }, null, true);
    } catch (error) {
        logger.error("decode token error", error);
        throw error;
    }
}

export type UserInfo = {
    name: string,
    ethAddress: string,
    id: string,
    token?: string,
}

export interface RequestContext {
    req: ExpressRequest;
    user?: UserInfo;
}
export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();