import { UserInfo, auth } from './auth.js';

export async function authMiddleware(req, res, next) {
  try {
    const [bearer, token] = ((req.headers['authorization'] || req.headers['Authorization'] || '') as string).split(' ');
    const user = bearer === 'Bearer' && token ? await auth(token) : null;
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}