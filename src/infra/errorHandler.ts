import { Request, Response, NextFunction } from 'express';
import { currentRequestId, logger } from "./logger.js";

export interface ApiErrorResponse {
    code: number;
    message: string;
    requestId: string;
    details?: any;
  }

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('❌ [ErrorHandler]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const requestId = currentRequestId() + "";
  const response: ApiErrorResponse = {
    code: statusCode,
    message,
    requestId,
    details: process.env.NODE_ENV === 'dev' ? err.stack : undefined,
  };

  res.status(200).json(response);
}