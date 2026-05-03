export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class GameNotFoundError extends NotFoundError {
  constructor(message = "Game not found") {
    super(message);
    this.code = "GAME_NOT_FOUND";
  }
}

export class InvalidMoveError extends ValidationError {
  constructor(message = "Invalid move") {
    super(message);
    this.code = "INVALID_MOVE";
  }
}
