# StoryScout LLM Client

Provider-neutral TypeScript interfaces for text and structured LLM generation, with an OpenAI
Responses API adapter.

## Usage

```ts
import { OpenAiLlmClient, type LlmClient } from '@storyscout/llm-client';

const client: LlmClient = new OpenAiLlmClient({
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'your-model-id',
});

const result = await client.generateText({
  instructions: 'Correct grammar without changing the voice.',
  input: 'Manuscript text',
});
```

Use `generateStructured` with a JSON Schema and an optional runtime validator for typed JSON.
Application code should depend on `LlmClient`; a future provider only needs to implement that
interface. OpenAI responses are not stored unless `storeResponses: true` is explicitly selected.

## Development

```sh
npm install
npm run check
```

## Checkout layout

The Editor currently depends on `file:../LLMCient`. Keep these repositories as
siblings and preserve the local directory name `LLMCient` (including its spelling):

```sh
git clone -b feature/initial-import git@github.com:tuachotu/storyscout-llm-client.git LLMCient
git clone -b feature/initial-import git@github.com:tuachotu/storyscout-editor-service.git editor
cd LLMCient
npm ci
npm run check
cd ../editor
npm ci
npm run check
```

Build the library before checking or running the Editor. Neither package is published
to npm; the library's generated `dist` directory is built locally and excluded from Git.
