# `useChat()`

Allows you to easily create a conversational user interface for your chatbot application. It enables the streaming of chat messages from your AI provider, manages the chat state, and updates the UI automatically as new messages are received.

<Note>
  The `useChat` API has been significantly updated in AI SDK 5.0. It now uses a
  transport-based architecture and no longer manages input state internally. See
  the [migration
  guide](/docs/migration-guides/migration-guide-5-0#usechat-changes) for
  details.
</Note>

## Import

<Tabs items={['React', 'Svelte', 'Vue']}>
<Tab>
<Snippet
      text="import { useChat } from '@ai-sdk/react'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet text="import { Chat } from '@ai-sdk/svelte'" dark prompt={false} />
</Tab>
<Tab>
<Snippet text="import { Chat } from '@ai-sdk/vue'" dark prompt={false} />
</Tab>
</Tabs>

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'chat',
type: 'Chat<UIMessage>',
isOptional: true,
description:
'An existing Chat instance to use. If provided, other parameters are ignored.',
},
{
name: 'transport',
type: 'ChatTransport',
isOptional: true,
description:
'The transport to use for sending messages. Defaults to DefaultChatTransport with `/api/chat` endpoint.',
properties: [
{
type: 'DefaultChatTransport',
parameters: [
{
name: 'api',
type: "string = '/api/chat'",
isOptional: true,
description: 'The API endpoint for chat requests.',
},
{
name: 'credentials',
type: 'RequestCredentials',
isOptional: true,
description: 'The credentials mode for fetch requests.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
isOptional: true,
description: 'HTTP headers to send with requests.',
},
{
name: 'body',
type: 'object',
isOptional: true,
description: 'Extra body object to send with requests.',
},
{
name: 'prepareSendMessagesRequest',
type: 'PrepareSendMessagesRequest',
isOptional: true,
description:
'A function to customize the request before chat API calls.',
properties: [
{
type: 'PrepareSendMessagesRequest',
parameters: [
{
name: 'options',
type: 'PrepareSendMessageRequestOptions',
description: 'Options for preparing the request',
properties: [
{
type: 'PrepareSendMessageRequestOptions',
parameters: [
{
name: 'id',
type: 'string',
description: 'The chat ID',
},
{
name: 'messages',
type: 'UIMessage[]',
description: 'Current messages in the chat',
},
{
name: 'requestMetadata',
type: 'unknown',
description: 'The request metadata',
},
{
name: 'body',
type: 'Record<string, any> | undefined',
description: 'The request body',
},
{
name: 'credentials',
type: 'RequestCredentials | undefined',
description: 'The request credentials',
},
{
name: 'headers',
type: 'HeadersInit | undefined',
description: 'The request headers',
},
{
name: 'api',
type: 'string',
description: `The API endpoint to use for the request. If not specified, it defaults to the transport’s API endpoint: /api/chat.`,
},
{
name: 'trigger',
type: "'submit-message' | 'regenerate-message'",
description: 'The trigger for the request',
},
{
name: 'messageId',
type: 'string | undefined',
description: 'The message ID if applicable',
},
],
},
],
},
],
},
],
},
{
name: 'prepareReconnectToStreamRequest',
type: 'PrepareReconnectToStreamRequest',
isOptional: true,
description:
'A function to customize the request before reconnect API call.',
properties: [
{
type: 'PrepareReconnectToStreamRequest',
parameters: [
{
name: 'options',
type: 'PrepareReconnectToStreamRequestOptions',
description:
'Options for preparing the reconnect request',
properties: [
{
type: 'PrepareReconnectToStreamRequestOptions',
parameters: [
{
name: 'id',
type: 'string',
description: 'The chat ID',
},
{
name: 'requestMetadata',
type: 'unknown',
description: 'The request metadata',
},
{
name: 'body',
type: 'Record<string, any> | undefined',
description: 'The request body',
},
{
name: 'credentials',
type: 'RequestCredentials | undefined',
description: 'The request credentials',
},
{
name: 'headers',
type: 'HeadersInit | undefined',
description: 'The request headers',
},
{
name: 'api',
type: 'string',
description: `The API endpoint to use for the request. If not specified, it defaults to the transport’s API endpoint combined with the chat ID: /api/chat/{chatId}/stream.`,
},
],
},
],
},
],
},
],
},
],
},
],
},
{
name: 'id',
type: 'string',
isOptional: true,
description:
'A unique identifier for the chat. If not provided, a random one will be generated.',
},
{
name: 'messages',
type: 'UIMessage[]',
isOptional: true,
description: 'Initial chat messages to populate the conversation with.',
},
{
name: 'onToolCall',
type: '({toolCall: ToolCall}) => void | Promise<void>',
isOptional: true,
description:
'Optional callback function that is invoked when a tool call is received. You must call addToolOutput to provide the tool result.',
},
{
name: 'sendAutomaticallyWhen',
type: '(options: { messages: UIMessage[] }) => boolean | PromiseLike<boolean>',
isOptional: true,
description:
'When provided, this function will be called when the stream is finished or a tool call is added to determine if the current messages should be resubmitted. You can use the lastAssistantMessageIsCompleteWithToolCalls helper for common scenarios.',
},
{
name: 'onFinish',
type: '(options: OnFinishOptions) => void',
isOptional: true,
description: 'Called when the assistant response has finished streaming.',
properties: [
{
type: 'OnFinishOptions',
parameters: [
{
name: 'message',
type: 'UIMessage',
description: 'The response message.',
},
{
name: 'messages',
type: 'UIMessage[]',
description: 'All messages including the response message',
},
{
name: 'isAbort',
type: 'boolean',
description:
'True when the request has been aborted by the client.',
},
{
name: 'isDisconnect',
type: 'boolean',
description:
'True if the server has been disconnected, e.g. because of a network error.',
},
{
name: 'isError',
type: 'boolean',
description: `True if errors during streaming caused the response to stop early.`,
},
{
name: 'finishReason',
type: "'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'",
isOptional: true,
description:
'The reason why the model finished generating the response. Undefined if the finish reason was not provided by the model.',
},
],
},
],
},
{
name: 'onError',
type: '(error: Error) => void',
isOptional: true,
description:
'Callback function to be called when an error is encountered.',
},
{
name: 'onData',
type: '(dataPart: DataUIPart) => void',
isOptional: true,
description:
'Optional callback function that is called when a data part is received.',
},
{
name: 'experimental_throttle',
type: 'number',
isOptional: true,
description:
'Custom throttle wait in ms for the chat messages and data updates. Default is undefined, which disables throttling.',
},
{
name: 'resume',
type: 'boolean',
isOptional: true,
description:
'Whether to resume an ongoing chat generation stream. Defaults to false.',
},
]}
/>

### Returns

<PropertiesTable
content={[
{
name: 'id',
type: 'string',
description: 'The id of the chat.',
},
{
name: 'messages',
type: 'UIMessage[]',
description: 'The current array of chat messages.',
properties: [
{
type: 'UIMessage',
parameters: [
{
name: 'id',
type: 'string',
description: 'A unique identifier for the message.',
},
{
name: 'role',
type: "'system' | 'user' | 'assistant'",
description: 'The role of the message.',
},
{
name: 'parts',
type: 'UIMessagePart[]',
description:
'The parts of the message. Use this for rendering the message in the UI.',
},
{
name: 'metadata',
type: 'unknown',
isOptional: true,
description: 'The metadata of the message.',
},
],
},
],
},
{
name: 'status',
type: "'submitted' | 'streaming' | 'ready' | 'error'",
description:
'The current status of the chat: "ready" (idle), "submitted" (request sent), "streaming" (receiving response), or "error" (request failed).',
},
{
name: 'error',
type: 'Error | undefined',
description: 'The error object if an error occurred.',
},
{
name: 'sendMessage',
type: '(message: CreateUIMessage | string, options?: ChatRequestOptions) => void',
description:
'Function to send a new message to the chat. This will trigger an API call to generate the assistant response.',
properties: [
{
type: 'ChatRequestOptions',
parameters: [
{
name: 'headers',
type: 'Record<string, string> | Headers',
description:
'Additional headers that should be to be passed to the API endpoint.',
},
{
name: 'body',
type: 'object',
description:
'Additional body JSON properties that should be sent to the API endpoint.',
},
{
name: 'metadata',
type: 'JSONValue',
description: 'Additional data to be sent to the API endpoint.',
},
],
},
],
},
{
name: 'regenerate',
type: '(options?: { messageId?: string }) => void',
description:
'Function to regenerate the last assistant message or a specific message. If no messageId is provided, regenerates the last assistant message.',
},
{
name: 'stop',
type: '() => void',
description:
'Function to abort the current streaming response from the assistant.',
},
{
name: 'clearError',
type: '() => void',
description: 'Clears the error state.',
},
{
name: 'resumeStream',
type: '() => void',
description:
'Function to resume an interrupted streaming response. Useful when a network error occurs during streaming.',
},
{
name: 'addToolOutput',
type: '(options: { tool: string; toolCallId: string; output: unknown } | { tool: string; toolCallId: string; state: "output-error", errorText: string }) => void',
description:
'Function to add a tool result to the chat. This will update the chat messages with the tool result. If sendAutomaticallyWhen is configured, it may trigger an automatic submission.',
},
{
name: 'setMessages',
type: '(messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void',
description:
'Function to update the messages state locally without triggering an API call. Useful for optimistic updates.',
},
]}
/>

## Learn more

- [Chatbot](/docs/ai-sdk-ui/chatbot)
- [Chatbot with Tools](/docs/ai-sdk-ui/chatbot-with-tool-calling)
- [UIMessage](/docs/reference/ai-sdk-core/ui-message)

# `useCompletion()`

Allows you to create text completion based capabilities for your application. It enables the streaming of text completions from your AI provider, manages the state for chat input, and updates the UI automatically as new messages are received.

## Import

<Tabs items={['React', 'Svelte', 'Vue']}>
<Tab>
<Snippet
      text="import { useCompletion } from '@ai-sdk/react'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { Completion } from '@ai-sdk/svelte'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { useCompletion } from '@ai-sdk/vue'"
      dark
      prompt={false}
    />
</Tab>

</Tabs>

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'api',
type: "string = '/api/completion'",
description:
'The API endpoint that is called to generate text. It can be a relative path (starting with `/`) or an absolute URL.',
},
{
name: 'id',
type: 'string',
description:
'An unique identifier for the completion. If not provided, a random one will be generated. When provided, the `useCompletion` hook with the same `id` will have shared states across components. This is useful when you have multiple components showing the same chat stream',
},
{
name: 'initialInput',
type: 'string',
description: 'An optional string for the initial prompt input.',
},
{
name: 'initialCompletion',
type: 'string',
description: 'An optional string for the initial completion result.',
},
{
name: 'onFinish',
type: '(prompt: string, completion: string) => void',
description:
'An optional callback function that is called when the completion stream ends.',
},
{
name: 'onError',
type: '(error: Error) => void',
description:
'An optional callback that will be called when the chat stream encounters an error.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
description:
'An optional object of headers to be passed to the API endpoint.',
},
{
name: 'body',
type: 'any',
description:
'An optional, additional body object to be passed to the API endpoint.',
},
{
name: 'credentials',
type: "'omit' | 'same-origin' | 'include'",
description:
'An optional literal that sets the mode of credentials to be used on the request. Defaults to same-origin.',
},
{
name: 'streamProtocol',
type: "'text' | 'data'",
isOptional: true,
description:
'An optional literal that sets the type of stream to be used. Defaults to `data`. If set to `text`, the stream will be treated as a text stream.',
},
{
name: 'fetch',
type: 'FetchFunction',
isOptional: true,
description:
'Optional. A custom fetch function to be used for the API call. Defaults to the global fetch function.',
},
{
name: 'experimental_throttle',
type: 'number',
isOptional: true,
description:
'React only. Custom throttle wait time in milliseconds for the completion and data updates. When specified, throttles how often the UI updates during streaming. Default is undefined, which disables throttling.',
},

]}
/>

### Returns

<PropertiesTable
content={[
{
name: 'completion',
type: 'string',
description: 'The current text completion.',
},
{
name: 'complete',
type: '(prompt: string, options: { headers, body }) => void',
description:
'Function to execute text completion based on the provided prompt.',
},
{
name: 'error',
type: 'undefined | Error',
description: 'The error thrown during the completion process, if any.',
},
{
name: 'setCompletion',
type: '(completion: string) => void',
description: 'Function to update the `completion` state.',
},
{
name: 'stop',
type: '() => void',
description: 'Function to abort the current API request.',
},
{
name: 'input',
type: 'string',
description: 'The current value of the input field.',
},
{
name: 'setInput',
type: 'React.Dispatch<React.SetStateAction<string>>',
description: 'The current value of the input field.',
},
{
name: 'handleInputChange',
type: '(event: any) => void',
description:
"Handler for the `onChange` event of the input field to control the input's value.",
},
{
name: 'handleSubmit',
type: '(event?: { preventDefault?: () => void }) => void',
description:
'Form submission handler that automatically resets the input field and appends a user message.',
},
{
name: 'isLoading',
type: 'boolean',
description:
'Boolean flag indicating whether a fetch operation is currently in progress.',
},
]}
/>

# `experimental_useObject()`

<Note>
  `useObject` is an experimental feature and only available in React, Svelte,
  and Vue.
</Note>

Allows you to consume text streams that represent a JSON object and parse them into a complete object based on a schema.
You can use it together with [`streamText`](/docs/reference/ai-sdk-core/stream-text) and [`Output.object()`](/docs/reference/ai-sdk-core/output#output-object) in the backend.

```tsx
'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';

export default function Page() {
  const { object, submit } = useObject({
    api: '/api/use-object',
    schema: z.object({ content: z.string() }),
  });

  return (
    <div>
      <button onClick={() => submit('example input')}>Generate</button>
      {object?.content && <p>{object.content}</p>}
    </div>
  );
}
```

## Import

<Snippet
  text="import { experimental_useObject as useObject } from '@ai-sdk/react'"
  dark
  prompt={false}
/>

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'api',
type: 'string',
description:
'The API endpoint that is called to generate objects. It should stream JSON that matches the schema as chunked text. It can be a relative path (starting with `/`) or an absolute URL.',
},
{
name: 'schema',
type: 'Zod Schema | JSON Schema',
description:
'A schema that defines the shape of the complete object. You can either pass in a Zod schema or a JSON schema (using the `jsonSchema` function).',
},
{
name: 'id?',
type: 'string',
description:
'A unique identifier. If not provided, a random one will be generated. When provided, the `useObject` hook with the same `id` will have shared states across components.',
},
{
name: 'initialValue',
type: 'DeepPartial<RESULT> | undefined',
isOptional: true,
description: 'An value for the initial object. Optional.',
},
{
name: 'fetch',
type: 'FetchFunction',
isOptional: true,
description:
'A custom fetch function to be used for the API call. Defaults to the global fetch function. Optional.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
isOptional: true,
description:
'A headers object to be passed to the API endpoint. Optional.',
},
{
name: 'credentials',
type: 'RequestCredentials',
isOptional: true,
description:
'The credentials mode to be used for the fetch request. Possible values are: "omit", "same-origin", "include". Optional.',
},
{
name: 'onError',
type: '(error: Error) => void',
isOptional: true,
description:
'Callback function to be called when an error is encountered. Optional.',
},
{
name: 'onFinish',
type: '(result: OnFinishResult) => void',
isOptional: true,
description: 'Called when the streaming response has finished.',
properties: [
{
type: 'OnFinishResult',
parameters: [
{
name: 'object',
type: 'T | undefined',
description:
'The generated object (typed according to the schema). Can be undefined if the final object does not match the schema.',
},
{
name: 'error',
type: 'unknown | undefined',
description:
'Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.',
},
],
},
],
},
]}
/>

### Returns

<PropertiesTable
content={[
{
name: 'submit',
type: '(input: INPUT) => void',
description: 'Calls the API with the provided input as JSON body.',
},
{
name: 'object',
type: 'DeepPartial<RESULT> | undefined',
description:
'The current value for the generated object. Updated as the API streams JSON chunks.',
},
{
name: 'error',
type: 'Error | unknown',
description: 'The error object if the API call fails.',
},
{
name: 'isLoading',
type: 'boolean',
description:
'Boolean flag indicating whether a request is currently in progress.',
},
{
name: 'stop',
type: '() => void',
description: 'Function to abort the current API request.',
},
{
name: 'clear',
type: '() => void',
description: 'Function to clear the object state.',
},
]}
/>

## Examples

<ExampleLinks
examples={[
{
title: 'Streaming Object Generation with useObject',
link: '/examples/next-pages/basics/streaming-object-generation',
},
]}
/>

# `convertToModelMessages()`

The `convertToModelMessages` function is used to transform an array of UI messages from the `useChat` hook into an array of `ModelMessage` objects. These `ModelMessage` objects are compatible with AI core functions like `streamText`.

```ts filename="app/api/chat/route.ts"
import { convertToModelMessages, streamText } from 'ai';
__PROVIDER_IMPORT__;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: __MODEL__,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

## Import

<Snippet text={`import { convertToModelMessages } from "ai"`} prompt={false} />

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'messages',
type: 'Message[]',
description:
'An array of UI messages from the useChat hook to be converted',
},
{
name: 'options',
type: '{ tools?: ToolSet, convertDataPart?: (part: DataUIPart) => TextPart | FilePart | null }',
description:
'Optional configuration object. Provide tools to enable multi-modal tool responses, and convertDataPart to transform custom data parts into model-compatible content.',
},
]}
/>

### Returns

An array of [`ModelMessage`](/docs/reference/ai-sdk-core/model-message) objects.

<PropertiesTable
content={[
{
name: 'ModelMessage[]',
type: 'Array',
description: 'An array of ModelMessage objects',
},
]}
/>

## Multi-modal Tool Responses

The `convertToModelMessages` function supports tools that can return multi-modal content. This is useful when tools need to return non-text content like images.

```ts
import { tool } from 'ai';
__PROVIDER_IMPORT__;
import { z } from 'zod';

const screenshotTool = tool({
  inputSchema: z.object({}),
  execute: async () => 'imgbase64',
  toModelOutput: ({ output }) => [{ type: 'image', data: output }],
});

const result = streamText({
  model: __MODEL__,
  messages: convertToModelMessages(messages, {
    tools: {
      screenshot: screenshotTool,
    },
  }),
});
```

Tools can implement the optional `toModelOutput` method to transform their results into multi-modal content. The content is an array of content parts, where each part has a `type` (e.g., 'text', 'image') and corresponding data.

## Custom Data Part Conversion

The `convertToModelMessages` function supports converting custom data parts attached to user messages. This is useful when users need to include additional context (URLs, code files, JSON configs) with their messages.

### Basic Usage

By default, data parts in user messages are filtered out during conversion. To include them, provide a `convertDataPart` callback that transforms data parts into text or file parts that the model can understand:

```ts filename="app/api/chat/route.ts"
import { convertToModelMessages, streamText } from 'ai';

type CustomUIMessage = UIMessage<
  never,
  {
    url: { url: string; title: string; content: string };
    'code-file': { filename: string; code: string; language: string };
  }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: __MODEL__,
    messages: convertToModelMessages<CustomUIMessage>(messages, {
      convertDataPart: part => {
        // Convert URL attachments to text
        if (part.type === 'data-url') {
          return {
            type: 'text',
            text: `[Reference: ${part.data.title}](${part.data.url})\n\n${part.data.content}`,
          };
        }

        // Convert code file attachments
        if (part.type === 'data-code-file') {
          return {
            type: 'text',
            text: `\`\`\`${part.data.language}\n// ${part.data.filename}\n${part.data.code}\n\`\`\``,
          };
        }

        // Other data parts are ignored
      },
    }),
  });

  return result.toUIMessageStreamResponse();
}
```

### Use Cases

**Attaching URL Content**
Allow users to attach URLs to their messages, with the content fetched and formatted for the model:

```ts
// Client side
sendMessage({
  parts: [
    { type: 'text', text: 'Analyze this article' },
    {
      type: 'data-url',
      data: {
        url: 'https://example.com/article',
        title: 'Important Article',
        content: '...',
      },
    },
  ],
});
```

**Including Code Files as Context**
Let users reference code files in their conversations:

```ts
convertDataPart: part => {
  if (part.type === 'data-code-file') {
    return {
      type: 'text',
      text: `\`\`\`${part.data.language}\n${part.data.code}\n\`\`\``,
    };
  }
};
```

**Selective Inclusion**
Only data parts for which you return a text or file model message part are included,
all other data parts are ignored.

```ts
const result = convertToModelMessages<
  UIMessage<
    unknown,
    {
      url: { url: string; title: string };
      code: { code: string; language: string };
      note: { text: string };
    }
  >
>(messages, {
  convertDataPart: part => {
    if (part.type === 'data-url') {
      return {
        type: 'text',
        text: `[${part.data.title}](${part.data.url})`,
      };
    }

    // data-code and data-node are ignored
  },
});
```

### Type Safety

The generic parameter ensures full type safety for your custom data parts:

```ts
type MyUIMessage = UIMessage<
  unknown,
  {
    url: { url: string; content: string };
    config: { key: string; value: string };
  }
>;

// TypeScript knows the exact shape of part.data
convertToModelMessages<MyUIMessage>(messages, {
  convertDataPart: part => {
    if (part.type === 'data-url') {
      // part.data is typed as { url: string; content: string }
      return { type: 'text', text: part.data.url };
    }
    return null;
  },
});
```

# `pruneMessages()`

The `pruneMessages` function is used to prune or filter an array of `ModelMessage` objects. This is useful for reducing message context (to save tokens), removing intermediate reasoning, or trimming tool calls and empty messages before sending to an LLM.

```ts filename="app/api/chat/route.ts"
import { pruneMessages, streamText } from 'ai';
__PROVIDER_IMPORT__;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const prunedMessages = pruneMessages({
    messages,
    reasoning: 'before-last-message',
    toolCalls: 'before-last-2-messages',
    emptyMessages: 'remove',
  });

  const result = streamText({
    model: __MODEL__,
    messages: prunedMessages,
  });

  return result.toUIMessageStreamResponse();
}
```

## Import

<Snippet text={`import { pruneMessages } from "ai"`} prompt={false} />

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'messages',
type: 'ModelMessage[]',
description: 'An array of ModelMessage objects to prune.',
},
{
name: 'reasoning',
type: `'all' | 'before-last-message' | 'none'`,
description:
'How to remove reasoning content from assistant messages. Default: "none".',
},
{
name: 'toolCalls',
type: `'all' | 'before-last-message' | 'before-last-\${number}-messages\' | 'none' | PruneToolCallsOption[]`,
description:
'How to prune tool call/results/approval content. Can specify strategy or a list with tools.',
},
{
name: 'emptyMessages',
type: `'keep' | 'remove'`,
description:
'Whether to keep or remove messages whose content is empty after pruning. Default: "remove".',
},
]}
/>

### Returns

An array of [`ModelMessage`](/docs/reference/ai-sdk-core/model-message) objects, pruned according to the provided options.

<PropertiesTable
content={[
{
name: 'ModelMessage[]',
type: 'Array',
description: 'The pruned list of ModelMessage objects',
},
]}
/>

## Example Usage

```ts
import { pruneMessages } from 'ai';

const pruned = pruneMessages({
  messages,
  reasoning: 'all', // Remove all reasoning parts
  toolCalls: 'before-last-message', // Remove tool calls except those in the last message
});
```

## Pruning Options

- **reasoning:** Removes reasoning parts from assistant messages. Use `'all'` to remove all, `'before-last-message'` to keep reasoning in the last message, or `'none'` to retain all reasoning.
- **toolCalls:** Prune tool-call, tool-result, and tool-approval chunks from assistant/tool messages. Options include:
  - `'all'`: Prune all such content.
  - `'before-last-message'`: Prune except in the last message.
  - `before-last-N-messages`: Prune except in the last N messages.
  - `'none'`: Do not prune.
  - Or provide an array for per-tool fine control.
- **emptyMessages:** Set to `'remove'` (default) to exclude messages that have no content after pruning.

> **Tip**: `pruneMessages` is typically used prior to sending a context window to an LLM to reduce message/token count, especially after a series of tool-calls and approvals.

For advanced usage and the full list of possible message parts, see [`ModelMessage`](/docs/reference/ai-sdk-core/model-message) and [`pruneMessages` implementation](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-text/prune-messages.ts).

# `createUIMessageStream`

The `createUIMessageStream` function allows you to create a readable stream for UI messages with advanced features like message merging, error handling, and finish callbacks.

## Import

<Snippet text={`import { createUIMessageStream } from "ai"`} prompt={false} />

## Example

```tsx
const existingMessages: UIMessage[] = [
  /* ... */
];

const stream = createUIMessageStream({
  async execute({ writer }) {
    // Start a text message
    // Note: The id must be consistent across text-start, text-delta, and text-end steps
    // This allows the system to correctly identify they belong to the same text block
    writer.write({
      type: 'text-start',
      id: 'example-text',
    });

    // Write a message chunk
    writer.write({
      type: 'text-delta',
      id: 'example-text',
      delta: 'Hello',
    });

    // End the text message
    writer.write({
      type: 'text-end',
      id: 'example-text',
    });

    // Merge another stream from streamText
    const result = streamText({
      model: __MODEL__,
      prompt: 'Write a haiku about AI',
    });

    writer.merge(result.toUIMessageStream());
  },
  onError: error => `Custom error: ${error.message}`,
  originalMessages: existingMessages,
  onFinish: ({ messages, isContinuation, responseMessage }) => {
    console.log('Stream finished with messages:', messages);
  },
});
```

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'execute',
type: '(options: { writer: UIMessageStreamWriter }) => Promise<void> | void',
description:
'A function that receives a writer instance and can use it to write UI message chunks to the stream.',
properties: [
{
type: 'UIMessageStreamWriter',
parameters: [
{
name: 'write',
type: '(part: UIMessageChunk) => void',
description: 'Writes a UI message chunk to the stream.',
},
{
name: 'merge',
type: '(stream: ReadableStream<UIMessageChunk>) => void',
description:
'Merges the contents of another UI message stream into this stream.',
},
{
name: 'onError',
type: '(error: unknown) => string',
description:
'Error handler that is used by the stream writer for handling errors in merged streams.',
},
],
},
],
},
{
name: 'onError',
type: '(error: unknown) => string',
description:
'A function that handles errors and returns an error message string. By default, it returns the error message.',
},
{
name: 'originalMessages',
type: 'UIMessage[] | undefined',
description:
'The original messages. If provided, persistence mode is assumed and a message ID is provided for the response message.',
},
{
name: 'onFinish',
type: '(options: { messages: UIMessage[]; isContinuation: boolean; responseMessage: UIMessage }) => void | undefined',
description:
'A callback function that is called when the stream finishes.',
properties: [
{
type: 'FinishOptions',
parameters: [
{
name: 'messages',
type: 'UIMessage[]',
description: 'The updated list of UI messages.',
},
{
name: 'isContinuation',
type: 'boolean',
description:
'Indicates whether the response message is a continuation of the last original message, or if a new message was created.',
},
{
name: 'responseMessage',
type: 'UIMessage',
description:
'The message that was sent to the client as a response (including the original message if it was extended).',
},
],
},
],
},
{
name: 'generateId',
type: 'IdGenerator | undefined',
description:
'A function to generate unique IDs for messages. Uses the default ID generator if not provided.',
},
]}
/>

### Returns

`ReadableStream<UIMessageChunk>`

A readable stream that emits UI message chunks. The stream automatically handles error propagation, merging of multiple streams, and proper cleanup when all operations are complete.

# `createUIMessageStreamResponse`

The `createUIMessageStreamResponse` function creates a Response object that streams UI messages to the client.

## Import

<Snippet
text={`import { createUIMessageStreamResponse } from "ai"`}
prompt={false}
/>

## Example

```tsx
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
__PROVIDER_IMPORT__;

const response = createUIMessageStreamResponse({
  status: 200,
  statusText: 'OK',
  headers: {
    'Custom-Header': 'value',
  },
  stream: createUIMessageStream({
    execute({ writer }) {
      // Write custom data
      writer.write({
        type: 'data',
        value: { message: 'Hello' },
      });

      // Write text content
      writer.write({
        type: 'text',
        value: 'Hello, world!',
      });

      // Write source information
      writer.write({
        type: 'source-url',
        value: {
          type: 'source',
          id: 'source-1',
          url: 'https://example.com',
          title: 'Example Source',
        },
      });

      // Merge with LLM stream
      const result = streamText({
        model: __MODEL__,
        prompt: 'Say hello',
      });

      writer.merge(result.toUIMessageStream());
    },
  }),
});
```

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'stream',
type: 'ReadableStream<UIMessageChunk>',
description: 'The UI message stream to send to the client.',
},
{
name: 'status',
type: 'number',
isOptional: true,
description: 'The status code for the response. Defaults to 200.',
},
{
name: 'statusText',
type: 'string',
isOptional: true,
description: 'The status text for the response.',
},
{
name: 'headers',
type: 'Headers | Record<string, string>',
isOptional: true,
description: 'Additional headers for the response.',
},
{
name: 'consumeSseStream',
type: '(options: { stream: ReadableStream<string> }) => PromiseLike<void> | void',
isOptional: true,
description:
'Optional callback to consume the Server-Sent Events stream.',
},
]}
/>

### Returns

`Response`

A Response object that streams UI message chunks with the specified status, headers, and content.

# `pipeUIMessageStreamToResponse`

The `pipeUIMessageStreamToResponse` function pipes streaming data to a Node.js ServerResponse object (see [Streaming Data](/docs/ai-sdk-ui/streaming-data)).

## Import

<Snippet
text={`import { pipeUIMessageStreamToResponse } from "ai"`}
prompt={false}
/>

## Example

```tsx
pipeUIMessageStreamToResponse({
  response: serverResponse,
  status: 200,
  statusText: 'OK',
  headers: {
    'Custom-Header': 'value',
  },
  stream: myUIMessageStream,
  consumeSseStream: ({ stream }) => {
    // Optional: consume the SSE stream independently
    console.log('Consuming SSE stream:', stream);
  },
});
```

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'response',
type: 'ServerResponse',
description: 'The Node.js ServerResponse object to pipe the data to.',
},
{
name: 'stream',
type: 'ReadableStream<UIMessageChunk>',
description: 'The UI message stream to pipe to the response.',
},
{
name: 'status',
type: 'number',
description: 'The status code for the response.',
},
{
name: 'statusText',
type: 'string',
description: 'The status text for the response.',
},
{
name: 'headers',
type: 'Headers | Record<string, string>',
description: 'Additional headers for the response.',
},
{
name: 'consumeSseStream',
type: '({ stream }: { stream: ReadableStream }) => void',
description:
'Optional function to consume the SSE stream independently. The stream is teed and this function receives a copy.',
},
]}
/>

# readUIMessageStream

Transforms a stream of `UIMessageChunk`s into an `AsyncIterableStream` of `UIMessage`s.

UI message streams are useful outside of Chat use cases, e.g. for terminal UIs, custom stream consumption on the client, or RSC (React Server Components).

## Import

```tsx
import { readUIMessageStream } from 'ai';
```

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'message',
type: 'UIMessage',
isOptional: true,
description:
'The last assistant message to use as a starting point when the conversation is resumed. Otherwise undefined.',
},
{
name: 'stream',
type: 'ReadableStream<UIMessageChunk>',
description: 'The stream of UIMessageChunk objects to read.',
},
{
name: 'onError',
type: '(error: unknown) => void',
isOptional: true,
description:
'A function that is called when an error occurs during stream processing.',
},
{
name: 'terminateOnError',
type: 'boolean',
isOptional: true,
description:
'Whether to terminate the stream if an error occurs. Defaults to false.',
},
]}
/>

### Returns

An `AsyncIterableStream` of `UIMessage`s. Each stream part represents a different state of the same message as it is being completed.

For comprehensive examples and use cases, see [Reading UI Message Streams](/docs/ai-sdk-ui/reading-ui-message-streams).
