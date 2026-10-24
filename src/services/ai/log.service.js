import { env } from '../../config/env.js';
import { AiLog } from '../../models/AiLog.js';
import { AppError } from '../../utils/AppError.js';

const HOUR_MS = 60 * 60 * 1000;

export async function assertAiRateLimit(user) {
  const since = new Date(Date.now() - HOUR_MS);
  const count = await AiLog.countDocuments({ user: user.id, createdAt: { $gte: since } });
  if (count >= env.aiRateLimit) {
    throw new AppError('Too many AI requests. Try again in an hour.', 429);
  }
}

export async function writeAiLog({ user, feature, message, tools, response, latencyMs, status, error }) {
  await AiLog.create({
    user: user.id,
    role: user.role,
    feature,
    message: String(message || '').slice(0, 2000),
    tools: tools || [],
    response: String(response || '').slice(0, 4000),
    latencyMs,
    status,
    error: String(error || '').slice(0, 500),
  });
}

function friendlyAnswer(error) {
  if (error?.code === 'AI_TIMEOUT') return 'The assistant took too long. Please try again.';
  if (error?.code === 'AI_NOT_CONFIGURED') return 'The assistant is not configured yet.';
  return 'I could not reach the assistant. Please try again in a moment.';
}

// Runs one AI feature. Rate limit and the log happen here so every route shares them.
export async function guardedAi({ user, feature, message, run }) {
  const started = Date.now();
  try {
    await assertAiRateLimit(user);
  } catch (error) {
    await writeAiLog({
      user,
      feature,
      message,
      latencyMs: Date.now() - started,
      status: 'error',
      error: error.message,
      response: '',
    });
    throw error;
  }

  try {
    const result = await run();
    await writeAiLog({
      user,
      feature,
      message,
      tools: result.tools || [],
      response: result.logText || result.answer || result.explanation || JSON.stringify(result.bullets || ''),
      latencyMs: Date.now() - started,
      status: 'ok',
    });
    return result;
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error.statusCode) {
      await writeAiLog({
        user,
        feature,
        message,
        latencyMs,
        status: error.statusCode === 403 ? 'refused' : 'error',
        error: error.message,
      });
      throw error;
    }
    const answer = friendlyAnswer(error);
    await writeAiLog({
      user,
      feature,
      message,
      latencyMs,
      status: error.code === 'AI_TIMEOUT' ? 'timeout' : 'error',
      error: error.message,
      response: answer,
    });
    return {
      answer,
      fallback: true,
      sources: [],
      tools: [],
      logText: answer,
    };
  }
}
