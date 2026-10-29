import { NextRequest } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ContentBlock,
  Message,
  StopReason,
  Tool,
  ToolUseBlock,
  ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import { executeQuery } from '@/lib/athena';
import { resolveUserDetails } from '@/lib/identity';
import { buildSystemPrompt, resolveLocale } from '@/lib/analyze-prompt';
import { stopReasonNotice } from '@/lib/analyze-stop';
import { getIdcUsersPayload, filterIdcUsers, IdcFilter } from '@/lib/idc-users';
import { NEW_REGISTRANT_DAYS } from '@/lib/first-seen';

const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });

const ATHENA_DATABASE = process.env.ATHENA_DATABASE || 'titanlog';

const MODEL_ID = 'global.anthropic.claude-sonnet-5-5';
// Sonnet 5.5 thinks adaptively by default (Sonnet 4.6 never thought unless
// asked), so effort is pinned rather than left at the model's 'high'.
// 'medium' is the recommended start for multistep tool use; 'low' trims
// time-to-first-token for simple chat.
const EFFORT = 'medium';

// Beta that makes reasoning blocks carry the model's between-tool-call
// progress notes. Bedrock takes betas inside the request fields; without it
// display 'updates' is rejected as an unknown value.
const PROGRESS_UPDATES_BETA = 'thinking-display-updates-2026-08-18';

// Rows of a query_athena result that reach the model. The tool description
// states the cap and the result carries the full rowCount, so the model never
// mistakes a truncated result for the whole answer.
const MAX_RESULT_ROWS = 200;

const tools: Tool[] = [
  {
    toolSpec: {
      name: 'query_athena',
      description:
        `Execute an Athena SQL query against the '${ATHENA_DATABASE}' database. Returns {rowCount, truncated, rows}: rows holds at most the first ${MAX_RESULT_ROWS} result rows, so compute counts, sums, and rankings in SQL rather than over the returned rows.`,
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'The Athena SQL query to execute',
            },
            description: {
              type: 'string',
              description: 'Brief description of what this query does',
            },
          },
          required: ['sql', 'description'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'lookup_users',
      description:
        'Look up Identity Center user details (name, email, organization) for given user IDs.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            userIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of user ID UUIDs to look up',
            },
          },
          required: ['userIds'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'list_idc_users',
      description:
        'List IAM Identity Center directory users with activity status, dormancy grade, and new-registrant flag (registered <=7 days ago, no activity report yet). Names/emails are masked by policy. Use this — not SQL — for questions about the directory, registrations, or new registrants; that data is not in the Athena tables.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'active', 'inactive', 'new'],
              description: "Subset to return (default 'all'). 'new' = new registrants awaiting their first report.",
            },
            days: {
              type: 'number',
              description: 'Activity window in days for active/dormancy grading (default 90; clamped to at least 7 when filter is "new")',
            },
            limit: {
              type: 'number',
              description: 'Max users to return (default 50, max 200)',
            },
          },
          required: [],
        },
      },
    },
  },
];

function sseEncode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const TOOL_NAMES = tools.map((t) => t.toolSpec?.name ?? '');

async function executeToolCall(
  requestedName: string,
  input: Record<string, unknown>,
): Promise<{ result: string; rowCount?: number; isError?: boolean }> {
  // Sonnet 5.5 occasionally varies a tool name's letter case ('Query_Athena').
  // An unambiguous match is accepted rather than failed.
  const name =
    TOOL_NAMES.find((t) => t.toLowerCase() === requestedName.toLowerCase()) ?? requestedName;

  if (name === 'query_athena') {
    const sql = input.sql as string;
    try {
      const rows = await executeQuery(sql);
      return {
        result: JSON.stringify({
          rowCount: rows.length,
          truncated: rows.length > MAX_RESULT_ROWS,
          rows: rows.slice(0, MAX_RESULT_ROWS),
        }),
        rowCount: rows.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: JSON.stringify({ error: message }), rowCount: 0, isError: true };
    }
  }

  if (name === 'lookup_users') {
    const userIds = input.userIds as string[];
    try {
      const details = await resolveUserDetails(userIds);
      const obj: Record<string, unknown> = {};
      details.forEach((val, key) => {
        obj[key] = val;
      });
      return { result: JSON.stringify(obj), rowCount: userIds.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: JSON.stringify({ error: message }), rowCount: 0, isError: true };
    }
  }

  if (name === 'list_idc_users') {
    try {
      const filter: IdcFilter = (['all', 'active', 'inactive', 'new'] as IdcFilter[]).includes(
        input.filter as IdcFilter,
      )
        ? (input.filter as IdcFilter)
        : 'all';
      // 'new' is meaningless below the 7-day window (the isNewRegistrant gate
      // suppresses the flag there) — clamp so a model-chosen short window can't
      // produce a confident false "no new registrants".
      const rawDays = Math.max(1, Math.ceil(Number(input.days) || 90));
      const days = filter === 'new' ? Math.max(NEW_REGISTRANT_DAYS, rawDays) : rawDays;
      const limit = Number(input.limit) || 50;
      const payload = await getIdcUsersPayload(days);
      const { users, truncated } = filterIdcUsers(payload.users, filter, limit);
      return {
        result: JSON.stringify({
          total: payload.total,
          active: payload.active,
          inactive: payload.inactive,
          newRegistrants: payload.newRegistrants,
          windowDays: payload.windowDays,
          dormancy: payload.dormancy,
          filter,
          truncated,
          users,
        }),
        rowCount: users.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: JSON.stringify({ error: message }), rowCount: 0, isError: true };
    }
  }

  return {
    result: JSON.stringify({
      error: `Unknown tool: ${requestedName}. Available tools: ${TOOL_NAMES.join(', ')}`,
    }),
    isError: true,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, history } = body as {
    prompt: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    sessionId: string;
    days: number;
    locale?: string;
  };

  // Older clients (and any direct API caller) omit `locale` — default to
  // Korean, matching the app's default UI language.
  const locale = resolveLocale(body.locale);
  const systemPrompt = buildSystemPrompt(locale);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(sseEncode(data)));
      }

      try {
        // Build messages array: prepend conversation history, then add current prompt
        const priorMessages: Message[] = (history ?? [])
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({
            role: m.role,
            content: [{ text: m.content }],
          }));

        const messages: Message[] = [
          ...priorMessages,
          { role: 'user', content: [{ text: prompt }] },
        ];

        let iteration = 0;
        const maxIterations = 10;

        while (iteration < maxIterations) {
          iteration++;

          const response = await bedrockClient.send(
            new ConverseStreamCommand({
              modelId: MODEL_ID,
              // The cache point covers tools + system, which every loop
              // iteration and every request resends unchanged (per locale).
              // Measured on Sonnet 5.5: iterations after the first read the
              // whole prefix from cache instead of paying for it again.
              system: [{ text: systemPrompt }, { cachePoint: { type: 'default' } }],
              messages,
              toolConfig: { tools },
              // Thinking counts toward maxTokens, so 4096 would now truncate answers.
              inferenceConfig: { maxTokens: 16000 },
              additionalModelRequestFields: {
                output_config: { effort: EFFORT },
                thinking: { type: 'adaptive', display: 'updates' },
                anthropic_beta: [PROGRESS_UPDATES_BETA],
              },
            }),
          );

          // Every block of this turn keyed by contentBlockIndex, so the
          // assistant message is replayed in the order the model produced it.
          // That includes reasoning blocks: under display 'updates' the
          // reasoning itself comes back empty and only progress notes carry
          // text, but the signature lets Bedrock restore the model's
          // reasoning on the next tool-loop turn. Rebuilding the turn from
          // text + toolUse alone silently drops it.
          const turnBlocks = new Map<number, ContentBlock>();
          let stopReason: StopReason | undefined;
          const toolUseBlocks: ToolUseBlock[] = [];
          let currentToolUseId = '';
          let currentToolUseName = '';
          let currentToolInput = '';

          if (!response.stream) {
            send({ type: 'error', content: 'No stream returned from Bedrock' });
            break;
          }

          for await (const event of response.stream) {
            if (event.contentBlockStart?.start?.toolUse) {
              const toolUse = event.contentBlockStart.start.toolUse;
              currentToolUseId = toolUse.toolUseId ?? '';
              currentToolUseName = toolUse.name ?? '';
              currentToolInput = '';
              send({
                type: 'tool_start',
                tool: currentToolUseName,
                description:
                  currentToolUseName === 'query_athena'
                    ? 'Athena SQL query'
                    : currentToolUseName === 'lookup_users'
                    ? 'User lookup'
                    : 'Directory listing',
              });
            }

            if (event.contentBlockDelta?.delta?.text) {
              const text = event.contentBlockDelta.delta.text;
              const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
              turnBlocks.set(idx, { text: (turnBlocks.get(idx)?.text ?? '') + text });
              send({ type: 'text', content: text });
            }

            const reasoning = event.contentBlockDelta?.delta?.reasoningContent;
            if (reasoning) {
              const idx = event.contentBlockDelta?.contentBlockIndex ?? 0;
              if (reasoning.redactedContent) {
                turnBlocks.set(idx, {
                  reasoningContent: { redactedContent: reasoning.redactedContent },
                });
              } else {
                const prev = turnBlocks.get(idx)?.reasoningContent?.reasoningText;
                turnBlocks.set(idx, {
                  reasoningContent: {
                    reasoningText: {
                      text: (prev?.text ?? '') + (reasoning.text ?? ''),
                      signature: reasoning.signature ?? prev?.signature,
                    },
                  },
                });
              }
            }

            if (event.contentBlockDelta?.delta?.toolUse) {
              currentToolInput +=
                event.contentBlockDelta.delta.toolUse.input ?? '';
            }

            if (event.contentBlockStop) {
              // Under display 'updates', any reasoning block with text is a
              // progress note ("Checking the 7-day count next"). Sent whole at
              // block stop — notes are a sentence or two.
              const note = turnBlocks
                .get(event.contentBlockStop.contentBlockIndex ?? 0)
                ?.reasoningContent?.reasoningText?.text?.trim();
              if (note) {
                send({ type: 'progress', content: note });
              }

              if (currentToolUseId && currentToolUseName) {
                let parsedInput: Record<string, unknown> = {};
                try {
                  parsedInput = JSON.parse(currentToolInput);
                } catch {
                  parsedInput = {};
                }

                toolUseBlocks.push({
                  toolUseId: currentToolUseId,
                  name: currentToolUseName,
                  input: parsedInput,
                } as ToolUseBlock);
                turnBlocks.set(event.contentBlockStop.contentBlockIndex ?? 0, {
                  toolUse: {
                    toolUseId: currentToolUseId,
                    name: currentToolUseName,
                    input: parsedInput as DocumentType,
                  },
                });

                if (
                  currentToolUseName === 'query_athena' &&
                  parsedInput.description
                ) {
                  send({
                    type: 'tool_start',
                    tool: currentToolUseName,
                    description: parsedInput.description as string,
                  });
                }

                currentToolUseId = '';
                currentToolUseName = '';
                currentToolInput = '';
              }
            }

            if (event.messageStop) {
              stopReason = event.messageStop.stopReason;
            }
          }

          // An abnormal ending (cut off, declined, malformed) leaves the turn
          // incomplete: a truncated toolUse would run with partial input. Tell
          // the user why and stop the loop instead of carrying on.
          const notice = stopReasonNotice(stopReason, locale);
          if (notice) {
            send({ type: 'error', content: notice });
            break;
          }

          if (toolUseBlocks.length === 0) {
            break;
          }

          const assistantContent: ContentBlock[] = [...turnBlocks.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, block]) => block);

          messages.push({ role: 'assistant', content: assistantContent });

          // Execute tools and build toolResult blocks
          const toolResultBlocks: ContentBlock[] = [];
          for (const tb of toolUseBlocks) {
            const { result, rowCount, isError } = await executeToolCall(
              tb.name!,
              tb.input as Record<string, unknown>,
            );

            send({
              type: 'tool_result',
              tool: tb.name,
              rowCount: rowCount ?? 0,
            });

            toolResultBlocks.push({
              toolResult: {
                toolUseId: tb.toolUseId,
                content: [{ text: result }] as ToolResultContentBlock[],
                // Converse's is_error: the model reads it as "this call failed"
                // and retries (e.g. fixes the SQL) instead of reporting the error.
                ...(isError ? { status: 'error' as const } : {}),
              },
            });
          }

          messages.push({ role: 'user', content: toolResultBlocks });
        }

        send({ type: 'done' });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', content: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
