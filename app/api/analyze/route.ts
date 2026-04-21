import { NextRequest } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ContentBlock,
  Message,
  Tool,
  ToolUseBlock,
  ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import { executeQuery } from '@/lib/athena';
import { resolveUserDetails } from '@/lib/identity';

const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });

const SYSTEM_PROMPT = `You are Kiro Analytics AI Assistant, an expert data analyst for Kiro IDE usage data.
You have access to two Athena tables in the 'titanlog' database:

1. user_report — Kiro credit and usage metrics (11 columns):
   date(YYYY-MM-DD), userid(UUID), client_type(KIRO_IDE/KIRO_CLI), chat_conversations(int),
   credits_used(double), overage_cap(double), overage_credits_used(double),
   overage_enabled(true/false), profileid(string), subscription_tier(POWER/PRO/PROPLUS),
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
- UserId may have prefix 'd-90663be888.', normalize with: REGEXP_REPLACE(userid, '^d-[a-z0-9]+\\.', '')
- Athena output: s3://whchoi01-titan-q-log/athena-results/
- Use Korean for analysis reports. Use markdown formatting.
- Always include data tables and key insights.`;

const tools: Tool[] = [
  {
    toolSpec: {
      name: 'query_athena',
      description:
        'Execute an Athena SQL query against the titanlog database. Returns query results as JSON array of rows.',
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
];

function sseEncode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
): Promise<{ result: string; rowCount?: number }> {
  if (name === 'query_athena') {
    const sql = input.sql as string;
    try {
      const rows = await executeQuery(sql);
      const truncated = rows.slice(0, 200);
      return {
        result: JSON.stringify(truncated),
        rowCount: rows.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: JSON.stringify({ error: message }), rowCount: 0 };
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
      return { result: JSON.stringify({ error: message }), rowCount: 0 };
    }
  }

  return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, history } = body as {
    prompt: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    sessionId: string;
    days: number;
  };

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
              modelId: 'global.anthropic.claude-sonnet-4-6',
              system: [{ text: SYSTEM_PROMPT }],
              messages,
              toolConfig: { tools },
              inferenceConfig: { maxTokens: 4096 },
            }),
          );

          let assistantText = '';
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
                    : 'User lookup',
              });
            }

            if (event.contentBlockDelta?.delta?.text) {
              const text = event.contentBlockDelta.delta.text;
              assistantText += text;
              send({ type: 'text', content: text });
            }

            if (event.contentBlockDelta?.delta?.toolUse) {
              currentToolInput +=
                event.contentBlockDelta.delta.toolUse.input ?? '';
            }

            if (event.contentBlockStop) {
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
          }

          if (toolUseBlocks.length === 0) {
            break;
          }

          // Build assistant message content blocks
          const assistantContent: ContentBlock[] = [];
          if (assistantText) {
            assistantContent.push({ text: assistantText });
          }
          for (const tb of toolUseBlocks) {
            assistantContent.push({
              toolUse: {
                toolUseId: tb.toolUseId,
                name: tb.name,
                input: tb.input as DocumentType,
              },
            });
          }

          messages.push({ role: 'assistant', content: assistantContent });

          // Execute tools and build toolResult blocks
          const toolResultBlocks: ContentBlock[] = [];
          for (const tb of toolUseBlocks) {
            const { result, rowCount } = await executeToolCall(
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
