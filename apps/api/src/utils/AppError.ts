export interface MessageObj {
  en: string;
  de: string;
}

export class AppError extends Error {
  readonly messageObj: MessageObj;
  readonly statusCode: number;
  readonly code?: string;
  readonly isOperational = true;

  constructor(
    messageObj: MessageObj,
    statusCode: number,
    code?: string
  ) {
    super(messageObj.en);
    this.name = 'AppError';
    this.messageObj = messageObj;
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
