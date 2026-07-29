/**
 * System prompt for the Bedrock analysis agent (`/api/analyze`).
 *
 * Lives in lib/ rather than in the route because Next.js only allows route
 * handlers and a fixed set of config symbols to be exported from a `route.ts`
 * — anything else fails the generated route type check. Keeping it here also
 * makes it reachable from Jest.
 */

const ATHENA_DATABASE = process.env.ATHENA_DATABASE || 'titanlog';
const ATHENA_OUTPUT_BUCKET = process.env.ATHENA_OUTPUT_BUCKET || '';

/**
 * The locale is supplied per request by the client (lib/useChatStream.ts) and
 * only ever used to pick one of the two literals below — never interpolated
 * into the prompt, so a hostile body cannot inject instructions.
 */
export type AnalyzeLocale = 'ko' | 'en';

const LANGUAGE_RULE: Record<AnalyzeLocale, string> = {
  ko: 'Write the entire analysis in Korean (한국어), including headings and table labels.',
  en: 'Write the entire analysis in English, including headings and table labels. Never answer in Korean, even when the underlying data or the question contains Korean text.',
};

export function resolveLocale(value: unknown): AnalyzeLocale {
  return value === 'en' ? 'en' : 'ko';
}

const SYSTEM_PROMPT_BASE = `You are Kiro Analytics AI Assistant, an expert data analyst for Kiro IDE usage data.
You have access to two Athena tables in the '${ATHENA_DATABASE}' database:

1. user_report — Kiro credit and usage metrics (11 columns):
   date(YYYY-MM-DD), userid(UUID), client_type(KIRO_IDE/KIRO_CLI), chat_conversations(int),
   credits_used(double), overage_cap(double), overage_credits_used(double),
   overage_enabled(true/false), profileid(string), subscription_tier(POWER/PRO/PROPLUS/PROMAX),
   total_messages(int)

2. by_user_analytic — IDE productivity metrics (46 columns):
   userid(UUID), date(MM-DD-YYYY format!), chat_aicodelines, chat_messagesinteracted,
   chat_messagessent, inline_suggestionscount, inline_acceptancecount, inline_aicodelines,
   inlinechat_totaleventcount, inlinechat_acceptanceeventcount, dev_generationeventcount,
   dev_acceptedlines, codereview_findingscount, testgeneration_generatedtests, etc.

IMPORTANT SQL RULES:
- user_report dates: WHERE date >= 'YYYY-MM-DD' (string comparison)
- by_user_analytic dates: WHERE DATE_PARSE(date, '%m-%d-%Y') >= DATE_ADD('day', -N, CURRENT_DATE)
- All numeric columns are strings (OpenCSVSerde), use CAST(col AS INTEGER) or CAST(col AS DOUBLE)
- UserIds may carry an IAM Identity Center prefix 'd-xxxxxxxxxxxx.' — normalize with: REGEXP_REPLACE(userid, '^d-[a-z0-9]+\\.', '')
${ATHENA_OUTPUT_BUCKET ? `- Athena output: ${ATHENA_OUTPUT_BUCKET}` : ''}
- Use markdown formatting.
- Always include data tables and key insights.`;

/**
 * The language rule goes LAST on purpose: the model weights the closing
 * instruction most heavily, so an English answer survives Korean tool output
 * and Korean column labels. This used to be a hardcoded "Use Korean", which
 * made the answer Korean even with the UI switched to EN.
 */
export function buildSystemPrompt(locale: AnalyzeLocale): string {
  return `${SYSTEM_PROMPT_BASE}\n\nLANGUAGE (highest priority): ${LANGUAGE_RULE[locale]}`;
}
