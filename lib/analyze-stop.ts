/**
 * User-facing notice for an `/api/analyze` turn that ended abnormally.
 *
 * Lives in lib/ rather than in the route because Next.js only allows route
 * handlers and a fixed set of config symbols to be exported from a `route.ts`,
 * and Jest only collects `*.test.ts` — the same reason as analyze-prompt.ts.
 *
 * Sonnet 5.5 makes two endings likelier than Sonnet 4.6 did: thinking counts
 * toward maxTokens ('max_tokens'), and its safety classifiers can decline a
 * request outright. Without a notice the chat just goes quiet mid-answer.
 */

import type { StopReason } from '@aws-sdk/client-bedrock-runtime';
import type { AnalyzeLocale } from './analyze-prompt';

/** Normal endings: the answer finished, or the turn handed off to a tool. */
const SILENT_STOPS: ReadonlySet<string> = new Set(['end_turn', 'tool_use', 'stop_sequence']);

const SAFETY_DECLINE: Record<AnalyzeLocale, string> = {
  ko: '이 요청은 안전 정책에 따라 처리되지 않았습니다. 질문을 바꿔 다시 시도해 주세요.',
  en: 'This request was declined under the safety policy. Try rephrasing the question.',
};

const NOTICES: Partial<Record<StopReason, Record<AnalyzeLocale, string>>> = {
  max_tokens: {
    ko: '답변이 길이 한도에 도달해 중간에 끊겼습니다. 기간이나 범위를 좁혀 다시 질문해 주세요.',
    en: 'The answer reached the length limit and was cut off. Ask again with a narrower period or scope.',
  },
  model_context_window_exceeded: {
    ko: '대화가 너무 길어 이어서 처리할 수 없습니다. 새 대화를 시작해 다시 질문해 주세요.',
    en: 'The conversation is too long to continue. Start a new chat and ask again.',
  },
  content_filtered: SAFETY_DECLINE,
  guardrail_intervened: SAFETY_DECLINE,
};

/**
 * Returns null for a normal ending (or none reported), otherwise the notice to
 * show under the possibly partial answer. Reasons without a dedicated message —
 * malformed output, or a value added to the SDK later — get a generic one that
 * names the reason, so a new failure mode is visible rather than silent.
 */
export function stopReasonNotice(
  stopReason: StopReason | undefined,
  locale: AnalyzeLocale,
): string | null {
  if (stopReason === undefined || SILENT_STOPS.has(stopReason)) return null;
  const notice = NOTICES[stopReason];
  if (notice) return notice[locale];
  return locale === 'ko'
    ? `응답이 정상적으로 끝나지 않았습니다 (${stopReason}). 다시 시도해 주세요.`
    : `The response did not finish normally (${stopReason}). Please try again.`;
}
