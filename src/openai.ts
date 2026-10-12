import OpenAI from 'openai';

import { LlmError } from './errors.js';
import type {
  GenerationMetadata,
  LlmClient,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
} from './types.js';

export interface OpenAiLlmClientOptions {
  apiKey?: string;
  defaultModel: string;
  storeResponses?: boolean;
}

interface ResponsesApi {
  create(
    body: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<OpenAiResponse>;
}

interface OpenAiResponse {
  id: string;
  model: string;
  status?: string;
  output_text?: string;
  error?: { message?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null;
}

export class OpenAiLlmClient implements LlmClient {
  private readonly responses: ResponsesApi;
  private readonly defaultModel: string;
  private readonly storeResponses: boolean;

  constructor(options: OpenAiLlmClientOptions, responses?: ResponsesApi) {
    if (!options.defaultModel.trim()) {
      throw new LlmError('INVALID_REQUEST', 'A default OpenAI model is required');
    }
    this.defaultModel = options.defaultModel;
    this.storeResponses = options.storeResponses ?? false;
    this.responses = responses ?? new OpenAI({ apiKey: options.apiKey }).responses;
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    validateRequest(request);
    const model = request.model ?? this.defaultModel;
    try {
      const response = await this.responses.create(
        compact({
          model,
          input: request.input,
          instructions: request.instructions,
          max_output_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          store: this.storeResponses,
        }),
        request.signal ? { signal: request.signal } : undefined,
      );
      const text = requireOutputText(response);
      return { text, ...metadata(response, model) };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    validateRequest(request);
    if (!request.schemaName.trim()) {
      throw new LlmError('INVALID_REQUEST', 'A structured-output schema name is required');
    }
    const model = request.model ?? this.defaultModel;
    try {
      const response = await this.responses.create(
        compact({
          model,
          input: request.input,
          instructions: request.instructions,
          max_output_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          store: this.storeResponses,
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        }),
        request.signal ? { signal: request.signal } : undefined,
      );
      const text = requireOutputText(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new LlmError('INVALID_STRUCTURED_OUTPUT', 'Provider returned invalid JSON', {
          cause: error,
        });
      }
      let value: T;
      try {
        value = request.validate ? request.validate(parsed) : (parsed as T);
      } catch (error) {
        throw new LlmError(
          'INVALID_STRUCTURED_OUTPUT',
          'Provider output did not match the requested schema',
          { cause: error },
        );
      }
      return { value, ...metadata(response, model) };
    } catch (error) {
      throw normalizeError(error);
    }
  }
}

function validateRequest(request: { input: string; maxOutputTokens?: number }): void {
  if (!request.input.trim()) throw new LlmError('INVALID_REQUEST', 'LLM input must not be empty');
  if (request.maxOutputTokens !== undefined && request.maxOutputTokens < 1) {
    throw new LlmError('INVALID_REQUEST', 'maxOutputTokens must be positive');
  }
}

function requireOutputText(response: OpenAiResponse): string {
  if (response.status && response.status !== 'completed') {
    throw new LlmError(
      'INCOMPLETE_RESPONSE',
      response.error?.message ?? `Provider response ended with status ${response.status}`,
      { retryable: response.status !== 'failed' },
    );
  }
  const text = response.output_text?.trim();
  if (!text) throw new LlmError('INCOMPLETE_RESPONSE', 'Provider returned no output text');
  return text;
}

function metadata(response: OpenAiResponse, requestedModel: string): GenerationMetadata {
  const usage = response.usage
    ? {
        ...(response.usage.input_tokens === undefined
          ? {}
          : { inputTokens: response.usage.input_tokens }),
        ...(response.usage.output_tokens === undefined
          ? {}
          : { outputTokens: response.usage.output_tokens }),
        ...(response.usage.total_tokens === undefined
          ? {}
          : { totalTokens: response.usage.total_tokens }),
      }
    : undefined;
  return {
    provider: 'openai',
    model: response.model || requestedModel,
    requestId: response.id,
    ...(usage && Object.keys(usage).length > 0 ? { usage } : {}),
  };
}

function normalizeError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    error instanceof OpenAI.APIUserAbortError ||
    isAbortError(error)
  ) {
    return new LlmError('TIMEOUT', 'LLM request was aborted or timed out', {
      cause: error,
      retryable: true,
    });
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new LlmError('AUTHENTICATION_FAILED', 'OpenAI authentication failed', {
        cause: error,
      });
    }
    if (error.status === 429) {
      return new LlmError('RATE_LIMITED', 'OpenAI rate limit exceeded', {
        cause: error,
        retryable: true,
      });
    }
    if (error.status !== undefined && error.status >= 400 && error.status < 500) {
      return new LlmError('PROVIDER_REJECTED', 'OpenAI rejected the request', { cause: error });
    }
    return new LlmError('PROVIDER_FAILURE', 'OpenAI request failed', {
      cause: error,
      retryable: true,
    });
  }
  return new LlmError('PROVIDER_FAILURE', 'Unexpected LLM provider failure', {
    cause: error,
    retryable: true,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
