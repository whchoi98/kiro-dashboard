#!/usr/bin/env node
/**
 * Kiro hook event parser.
 *
 * Kiro CLI delivers the hook event as a single JSON document on STDIN
 * (features/hooks.md), unlike Claude Code which exported CLAUDE_TOOL_*
 * environment variables. This script flattens the fields the project's hooks
 * need into `KEY=<base64>` lines so the calling bash script can `eval` them
 * safely — base64 keeps multi-line file content intact and makes the eval
 * injection-proof (values are [A-Za-z0-9+/=] only).
 *
 * Emitted keys (always all of them, empty when absent):
 *   HOOK_EVENT_B64      hook_event_name  (agentSpawn|userPromptSubmit|preToolUse|postToolUse|stop)
 *   HOOK_CWD_B64        cwd
 *   HOOK_TOOL_B64       tool_name        (read|write|shell|... or @server/tool)
 *   HOOK_PATH_B64       tool_input.path  (write/read target)
 *   HOOK_CONTENT_B64    tool_input.content / newStr — every text the call introduces
 *   HOOK_PROMPT_B64     prompt             (userPromptSubmit)
 *   HOOK_RESPONSE_B64   assistant_response (stop)
 *   HOOK_SUCCESS_B64    tool_response.success (postToolUse)
 */

'use strict';

const KEYS = [
  'HOOK_EVENT',
  'HOOK_CWD',
  'HOOK_TOOL',
  'HOOK_PATH',
  'HOOK_CONTENT',
  'HOOK_PROMPT',
  'HOOK_RESPONSE',
  'HOOK_SUCCESS',
];

function emit(values) {
  for (const key of KEYS) {
    const raw = values[key] == null ? '' : String(values[key]);
    process.stdout.write(`${key}_B64=${Buffer.from(raw, 'utf8').toString('base64')}\n`);
  }
}

function str(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', () => {
  let event = {};
  try {
    event = JSON.parse(stdin) || {};
  } catch {
    // Malformed or empty payload: emit empty values so hooks fail open rather
    // than crashing the tool call they are attached to.
    emit({});
    return;
  }

  const input = event.tool_input && typeof event.tool_input === 'object' ? event.tool_input : {};

  // The write tool names its target `path`; legacy aliases use file_path.
  const path = input.path || input.file_path || input.filePath || '';

  // `create`/`insert` carry `content`; `strReplace` carries oldStr/newStr.
  // Scan every text the call would introduce.
  const contentParts = [input.content, input.newStr, input.new_str, input.file_text]
    .filter((part) => typeof part === 'string' && part.length > 0);

  emit({
    HOOK_EVENT: str(event.hook_event_name),
    HOOK_CWD: str(event.cwd),
    HOOK_TOOL: str(event.tool_name),
    HOOK_PATH: str(path),
    HOOK_CONTENT: contentParts.join('\n'),
    HOOK_PROMPT: str(event.prompt),
    HOOK_RESPONSE: str(event.assistant_response),
    HOOK_SUCCESS:
      event.tool_response && typeof event.tool_response === 'object'
        ? str(event.tool_response.success)
        : '',
  });
});
