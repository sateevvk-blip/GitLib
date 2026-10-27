export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Не найдено') {
    super(message, 404, 'not_found');
  }
}

export class DuplicateError extends AppError {
  constructor(message: string, repoId: string) {
    super(message, 409, 'duplicate', { repoId });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, extra?: Record<string, unknown>) {
    super(message, 400, 'validation', extra);
  }
}

export class GithubError extends AppError {
  constructor(message: string, code: string, statusCode = 502, extra?: Record<string, unknown>) {
    super(message, statusCode, code, extra);
  }
}

export class LlmError extends AppError {
  constructor(message: string, code = 'llm_error') {
    super(message, 502, code);
  }
}
