export type JsonSchema = Readonly<Record<string, unknown>>;

export interface GenerationOptions {
  model?: string;
  instructions?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface TextGenerationRequest extends GenerationOptions {
  input: string;
}

export interface StructuredGenerationRequest<T> extends GenerationOptions {
  input: string;
  schema: JsonSchema;
  schemaName: string;
  validate?: (value: unknown) => T;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface GenerationMetadata {
  provider: string;
  model: string;
  requestId?: string;
  usage?: TokenUsage;
}

export interface TextGenerationResult extends GenerationMetadata {
  text: string;
}

export interface StructuredGenerationResult<T> extends GenerationMetadata {
  value: T;
}

export interface LlmClient {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>>;
}
