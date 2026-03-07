export class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  
  export class ValidationError extends HttpError {
    constructor(message: string) {
      super(400, message);
    }
  }
  
  export class UnauthorizedError extends HttpError {
    constructor(message = 'Unauthorized') {
      super(401, message);
    }
  }