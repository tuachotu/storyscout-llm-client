import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

import { LlmError, OpenAiLlmClient } from '../src/index.js';

describe('OpenAiLlmClient', () => {
  it('maps a text request and defaults to non-stored responses', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'resp_1',
      model: 'test-model',
      status: 'completed',
      output_text: ' edited text ',
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
    });
    const client = new OpenAiLlmClient({ defaultModel: 'test-model' }, { create });

    await expect(client.generateText({ input: 'draft', instructions: 'Edit it' })).resolves.toEqual(
      {
        text: 'edited text',
        provider: 'openai',
        model: 'test-model',
        requestId: 'resp_1',
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      },
    );
    expect(create).toHaveBeenCalledWith(
      {
        model: 'test-model',
        input: 'draft',
        instructions: 'Edit it',
        store: false,
      },
      undefined,
    );
  });

  it('maps strict structured output and a request model override', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'resp_2',
      model: 'override-model',
      status: 'completed',
      output_text: '{"answer":"yes"}',
    });
    const client = new OpenAiLlmClient({ defaultModel: 'default-model' }, { create });
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['answer'],
      properties: { answer: { type: 'string' } },
    };

    const result = await client.generateStructured({
      input: 'question',
      model: 'override-model',
      schemaName: 'answer',
      schema,
      validate: (value) => value as { answer: string },
    });

    expect(result.value).toEqual({ answer: 'yes' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'override-model',
        text: { format: { type: 'json_schema', name: 'answer', strict: true, schema } },
      }),
      undefined,
    );
  });

  it('normalizes invalid JSON', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'resp_3',
      model: 'test-model',
      status: 'completed',
      output_text: 'not json',
    });
    const client = new OpenAiLlmClient({ defaultModel: 'test-model' }, { create });

    await expect(
      client.generateStructured({ input: 'x', schemaName: 'x', schema: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_STRUCTURED_OUTPUT' } satisfies Partial<LlmError>);
  });

  it('rejects incomplete responses', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'resp_4',
      model: 'test-model',
      status: 'incomplete',
      output_text: '',
    });
    const client = new OpenAiLlmClient({ defaultModel: 'test-model' }, { create });

    await expect(client.generateText({ input: 'x' })).rejects.toMatchObject({
      code: 'INCOMPLETE_RESPONSE',
    } satisfies Partial<LlmError>);
  });

  it('normalizes provider timeouts', async () => {
    const create = vi.fn().mockRejectedValue(new OpenAI.APIConnectionTimeoutError());
    const client = new OpenAiLlmClient({ defaultModel: 'test-model' }, { create });
    await expect(client.generateText({ input: 'x' })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    } satisfies Partial<LlmError>);
  });
});
