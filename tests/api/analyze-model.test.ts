/**
 * /api/analyze runs on Sonnet 5.5 through the Bedrock Converse API. Several
 * of the route's model-facing behaviours fail silently when they regress —
 * no request errors, the answers just get worse or cost more — so these tests
 * pin them at the source, the same way analyze-locale.test.ts pins the route.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildSystemPrompt } from '../../lib/analyze-prompt';

const ROOT = path.resolve(__dirname, '../..');
const route = fs.readFileSync(path.join(ROOT, 'app/api/analyze/route.ts'), 'utf8');
const hook = fs.readFileSync(path.join(ROOT, 'lib/useChatStream.ts'), 'utf8');
const messageList = fs.readFileSync(
  path.join(ROOT, 'app/components/chat/MessageList.tsx'),
  'utf8'
);

describe('model identity', () => {
  const routeModel = route.match(/const MODEL_ID = '([^']+)'/)?.[1];
  const uiLabel = hook.match(/export const CHAT_MODEL_ID = '([^']+)'/)?.[1];

  it('calls Sonnet 5.5 via the global inference profile', () => {
    expect(routeModel).toBe('global.anthropic.claude-sonnet-5-5');
    expect(route).toMatch(/modelId: MODEL_ID/);
  });

  it('labels the chat with the model the route actually calls', () => {
    // The label is client-side and the model id server-side; nothing else
    // keeps them in step, and a stale label misreports what answered.
    expect(uiLabel).toBeDefined();
    expect(routeModel?.endsWith(`anthropic.${uiLabel}`)).toBe(true);
  });
});

describe('tool loop replays the whole assistant turn', () => {
  it('captures reasoningContent deltas', () => {
    // Under the default display the reasoning text is empty, but the
    // signature carries the model's reasoning into the next tool-loop turn.
    // Dropping it fails no request, so only this test notices.
    expect(route).toMatch(/delta\?\.reasoningContent/);
    expect(route).toMatch(/signature: reasoning\.signature \?\? prev\?\.signature/);
  });

  it('rebuilds the turn from every block in contentBlockIndex order', () => {
    expect(route).toMatch(/\[\.\.\.turnBlocks\.entries\(\)\]\s*\.sort\(\(\[a\], \[b\]\) => a - b\)/);
    // The pre-5.5 rebuild (one text block, then tool calls) must not return.
    expect(route).not.toMatch(/assistantContent\.push\(\{ text: assistantText \}\)/);
  });
});

describe('request shape', () => {
  it('pins effort instead of inheriting the model default', () => {
    expect(route).toMatch(/additionalModelRequestFields: \{\s*output_config: \{ effort: EFFORT \}/);
    expect(route).toMatch(/const EFFORT = '(low|medium|high|xhigh|max)'/);
  });

  it('leaves maxTokens room for thinking', () => {
    const maxTokens = Number(route.match(/maxTokens: (\d+)/)?.[1]);
    expect(maxTokens).toBeGreaterThanOrEqual(16000);
  });

  it('caches the tools + system prefix', () => {
    expect(route).toMatch(/system: \[\{ text: systemPrompt \}, \{ cachePoint: \{ type: 'default' \} \}\]/);
  });

  it('sends no forced tool_choice (a 400 on Sonnet 5.5)', () => {
    expect(route).not.toMatch(/toolChoice/);
  });
});

describe('query_athena result contract', () => {
  it('tells the model the row cap and whether it was hit', () => {
    expect(route).toMatch(/at most the first \$\{MAX_RESULT_ROWS\} result rows/);
    expect(route).toMatch(/truncated: rows\.length > MAX_RESULT_ROWS/);
  });

  it('marks failed tool calls as errors', () => {
    expect(route).toMatch(/isError \? \{ status: 'error' as const \} : \{\}/);
  });
});

describe('progress updates', () => {
  it('requests display "updates" together with its beta', () => {
    // Without the beta Bedrock rejects 'updates' as an unknown display value.
    expect(route).toMatch(/thinking: \{ type: 'adaptive', display: 'updates' \}/);
    expect(route).toMatch(/anthropic_beta: \[PROGRESS_UPDATES_BETA\]/);
    expect(route).toMatch(/const PROGRESS_UPDATES_BETA = 'thinking-display-updates-2026-08-18'/);
  });

  it('forwards non-empty reasoning text as a progress event', () => {
    expect(route).toMatch(/send\(\{ type: 'progress', content: note \}\)/);
  });

  it('the hook keeps the latest note and clears it once answer text flows', () => {
    expect(hook).toMatch(/event\.type === 'progress'/);
    expect(hook).toMatch(/content: m\.content \+ text, progress: undefined/);
  });

  it('never sends progress notes back as conversation history', () => {
    expect(hook).toMatch(/\.map\(\(m\) => \(\{ role: m\.role, content: m\.content \}\)\)/);
  });

  it('shows the note only while that message is streaming', () => {
    expect(messageList).toMatch(/\{streamingThis && msg\.progress && \(/);
  });
});

describe('abnormal turn endings', () => {
  it('notifies the user and stops the tool loop', () => {
    expect(route).toMatch(/from '@\/lib\/analyze-stop'/);
    expect(route).toMatch(
      /if \(notice\) \{\s*send\(\{ type: 'error', content: notice \}\);\s*break;\s*\}/
    );
  });
});

describe('system prompt describes by_user_analytic accurately', () => {
  // Root CLAUDE.md: the legacy report is CLI/plugin-only with no Client_Type,
  // and 39 of its 44 metric columns are '0' in every row in this account.
  const prompt = buildSystemPrompt('en');

  it('does not call the legacy report IDE metrics', () => {
    expect(prompt).not.toMatch(/IDE productivity/);
    expect(prompt).toContain('CLI and plugin usage only');
  });

  it('names exactly the populated columns and none of the always-zero ones', () => {
    for (const col of [
      'chat_messagessent',
      'chat_aicodelines',
      'inline_suggestionscount',
      'inline_acceptancecount',
      'inline_aicodelines',
    ]) {
      expect(prompt).toContain(col);
    }
    expect(prompt).not.toMatch(/dev_acceptedlines|codereview_findingscount|testgeneration_generatedtests/);
    expect(prompt).toMatch(/not measured, not as zero usage/);
  });
});
