export type LlmErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'INCOMPLETE_RESPONSE'
  | 'INVALID_STRUCTURED_OUTPUT'
  | 'PROVIDER_FAILURE';

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    options?: ErrorOptions & { retryable?: boolean },
  ) {
    super(message, options);
    this.name = 'LlmError';
    this.retryable = options?.retryable ?? false;
  }

  readonly retryable: boolean;
}
