import { env } from '../../config/env.js';

// OpenAI-compatible chat completions. Gemini's OpenAI endpoint is the default.
// Tests replace this function. The API key stays in the Authorization header.

export async function completeChat({ messages, tools, signal }) {
  if (!env.aiApiKey) {
    const error = new Error('AI is not configured');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(new URL('chat/completions', env.aiBaseUrl), {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${env.aiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.aiModel,
      temperature: 0.2,
      messages,
      ...(tools && tools.length ? { tools } : {}),
    }),
  });
  if (!response.ok) {
    const error = new Error(`AI provider returned ${response.status}`);
    error.code = 'AI_PROVIDER';
    throw error;
  }
  return response.json();
}

let completer = completeChat;

export function setAiCompleter(fn) {
  completer = fn;
}

export function resetAiCompleter() {
  completer = completeChat;
}

export function getAiCompleter() {
  return completer;
}

export async function completeWithinTimeout(input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.aiTimeoutMs);
  try {
    return await getAiCompleter()({ ...input, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'AI_TIMEOUT') {
      const timeout = new Error('The assistant took too long');
      timeout.code = 'AI_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
