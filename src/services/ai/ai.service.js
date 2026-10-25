import { z } from 'zod';
import { AppError } from '../../utils/AppError.js';
import { getPayslip } from '../payslip.service.js';
import {
  chatSystemPrompt,
  loadCompanyFacts,
  payslipSystemPrompt,
  policySystemPrompt,
  smartLeaveSystemPrompt,
  summarySystemPrompt,
} from './prompts.js';
import { completeWithinTimeout } from './provider.js';
import { omitFaceSecrets, runTool, summarizeToolResult, toolDefinitions } from './tools.js';

const leaveSchema = z.object({
  type: z.string().trim().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start must be YYYY-MM-DD'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end must be YYYY-MM-DD'),
  reason: z.string().trim().min(1).max(500),
}).refine((value) => value.end >= value.start, { message: 'end is before start' });

const bulletsSchema = z.object({
  bullets: z.array(z.string().trim().min(1)).min(3).max(5),
});

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function errorText(error) {
  if (error?.issues?.length) return error.issues.map((issue) => issue.message).join('; ');
  return error.message || 'Invalid JSON';
}

function isRealDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function clientMessages(input) {
  const rows = input.messages?.length
    ? input.messages
    : [{ role: 'user', content: input.message }];
  const messages = rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({ role: row.role, content: row.content }));
  if (!messages.some((row) => row.role === 'user')) {
    throw new AppError('Send a message', 400);
  }
  return messages;
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function assistantText(data) {
  return data?.choices?.[0]?.message || null;
}

export async function chat(user, input) {
  const facts = await loadCompanyFacts();
  const messages = [
    { role: 'system', content: chatSystemPrompt(facts) },
    ...clientMessages(input),
  ];
  const sources = [];

  for (let round = 0; round < 3; round += 1) {
    const data = await completeWithinTimeout({ messages, tools: toolDefinitions });
    const message = assistantText(data);
    if (!message) {
      const error = new Error('The assistant returned an empty response');
      error.code = 'AI_PROVIDER';
      throw error;
    }
    const calls = message.tool_calls || [];
    if (calls.length === 0) {
      return {
        answer: message.content || '',
        sources,
        tools: sources.map((source) => source.tool),
        logText: message.content || '',
      };
    }
    messages.push({ ...message, role: 'assistant' });
    for (const call of calls.slice(0, 4)) {
      const name = call.function?.name || '';
      const args = parseArgs(call.function?.arguments);
      let result;
      try {
        result = await runTool(user, name, args);
      } catch (error) {
        // AppError text is written for the user. Other errors can carry a
        // driver message or a stack, so the model and the client see neither.
        const message = error?.statusCode && error.statusCode < 500
          ? error.message
          : 'That request could not be completed.';
        result = { refused: true, message };
      }
      const safeArgs = omitFaceSecrets(args);
      const safeResult = omitFaceSecrets(result);
      sources.push({ tool: name, args: safeArgs, resultSummary: summarizeToolResult(safeResult) });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(safeResult),
      });
    }
  }

  const finalData = await completeWithinTimeout({ messages, tools: [] });
  const finalMessage = assistantText(finalData);
  const answer = finalMessage?.content || 'I could not finish that answer.';
  return {
    answer,
    sources,
    tools: sources.map((source) => source.tool),
    logText: answer,
  };
}

async function askJson({ system, userText, schema }) {
  const first = await completeWithinTimeout({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ],
  });
  const firstText = assistantText(first)?.content || '';
  try {
    return schema.parse(extractJson(firstText));
  } catch (error) {
    const second = await completeWithinTimeout({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
        { role: 'assistant', content: firstText },
        { role: 'user', content: `That was not valid. ${errorText(error)}. Return JSON only.` },
      ],
    });
    return schema.parse(extractJson(assistantText(second)?.content || ''));
  }
}

export async function summarizeKpis(user, input) {
  try {
    const parsed = await askJson({
      system: summarySystemPrompt(),
      userText: JSON.stringify({ kpis: input.kpis, filters: input.filters || null }),
      schema: bulletsSchema,
    });
    return { bullets: parsed.bullets, fallback: false, logText: parsed.bullets.join(' ') };
  } catch (error) {
    if (error.statusCode) throw error;
    const bullets = fallbackBullets(input.kpis);
    return { bullets, fallback: true, logText: bullets.join(' ') };
  }
}

function fallbackBullets(kpis) {
  const lines = [];
  const source = kpis && typeof kpis === 'object' ? kpis : { value: kpis };
  for (const [key, value] of Object.entries(source)) {
    if (lines.length >= 5) break;
    if (value != null && typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  while (lines.length < 3) lines.push('No further figures were provided.');
  return lines.slice(0, 5);
}

function emptyLeave(message) {
  return {
    fallback: true,
    type: null,
    start: null,
    end: null,
    reason: null,
    leaveTypeCode: null,
    startDate: null,
    endDate: null,
    message,
    logText: message || 'fallback',
  };
}

export async function smartLeave(user, input) {
  const facts = await loadCompanyFacts();
  const known = new Map(facts.types.map((row) => [row.code.toLowerCase(), row.code]));
  try {
    const parsed = await askJson({
      system: smartLeaveSystemPrompt(facts),
      userText: input.text,
      schema: leaveSchema,
    });
    const type = known.get(parsed.type.toLowerCase());
    if (!type || !isRealDate(parsed.start) || !isRealDate(parsed.end)) {
      return emptyLeave('The assistant could not match a leave type and dates.');
    }
    return {
      fallback: false,
      type,
      start: parsed.start,
      end: parsed.end,
      reason: parsed.reason,
      leaveTypeCode: type,
      startDate: parsed.start,
      endDate: parsed.end,
      logText: `${type} ${parsed.start} ${parsed.end}`,
    };
  } catch (error) {
    if (error.statusCode) throw error;
    // A down provider is not a bad sentence. guardedAi turns these into the friendly fallback.
    if (error.code === 'AI_NOT_CONFIGURED' || error.code === 'AI_PROVIDER' || error.code === 'AI_TIMEOUT') {
      throw error;
    }
    return emptyLeave('The assistant could not fill the leave form.');
  }
}

export async function explainPayslip(user, input) {
  const slip = await getPayslip(user, input.payslipId);
  const data = await completeWithinTimeout({
    messages: [
      { role: 'system', content: payslipSystemPrompt() },
      { role: 'user', content: JSON.stringify(slip) },
    ],
  });
  const explanation = assistantText(data)?.content || 'I could not explain this payslip.';
  return {
    payslipId: slip.id,
    month: slip.month,
    explanation,
    logText: explanation,
  };
}

export async function answerPolicy(user, input) {
  const facts = await loadCompanyFacts();
  const data = await completeWithinTimeout({
    messages: [
      { role: 'system', content: policySystemPrompt(facts) },
      { role: 'user', content: input.question },
    ],
  });
  const answer = assistantText(data)?.content || 'I do not know.';
  return { answer, logText: answer };
}
