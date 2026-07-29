/**
 * The AI answer language is set by the Bedrock system prompt, NOT by i18n —
 * `t()` only translates strings we author. The prompt used to hardcode
 * "Use Korean for analysis reports", so switching the UI to English still
 * produced Korean answers. The locale now travels client → request body →
 * system prompt, and these tests pin every link of that chain.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildSystemPrompt, resolveLocale } from '../../lib/analyze-prompt';

const ROOT = path.resolve(__dirname, '../..');
const PROMPT_MODULE = 'lib/analyze-prompt.ts';
const ROUTE = 'app/api/analyze/route.ts';

describe('resolveLocale', () => {
  it("returns 'en' only for the exact string 'en'", () => {
    expect(resolveLocale('en')).toBe('en');
  });

  // Anything unrecognised falls back to Korean, the app's default UI language.
  it.each([['ko'], [undefined], [null], [''], ['EN'], ['en-US'], [{}], [42]])(
    'falls back to ko for %p',
    (value) => {
      expect(resolveLocale(value)).toBe('ko');
    }
  );
});

describe('buildSystemPrompt', () => {
  it('instructs Korean output for the ko locale', () => {
    const prompt = buildSystemPrompt('ko');
    expect(prompt).toMatch(/in Korean/);
    expect(prompt).not.toMatch(/in English/);
  });

  it('instructs English output for the en locale', () => {
    const prompt = buildSystemPrompt('en');
    expect(prompt).toMatch(/in English/);
    // The regression: any residual unconditional "Use Korean" would make the
    // model answer in Korean regardless of this locale.
    expect(prompt).not.toMatch(/entire analysis in Korean/);
  });

  it('keeps the shared SQL rules in both locales', () => {
    for (const locale of ['ko', 'en'] as const) {
      const prompt = buildSystemPrompt(locale);
      expect(prompt).toContain('user_report');
      expect(prompt).toContain('by_user_analytic');
      expect(prompt).toContain('REGEXP_REPLACE(userid');
    }
  });

  it('places the language rule last so it wins over earlier instructions', () => {
    // Recency matters to the model: tool results arrive in Korean, and an
    // early language line gets diluted by everything after it.
    const prompt = buildSystemPrompt('en');
    expect(prompt.trimEnd().split('\n').pop()).toMatch(/^LANGUAGE \(highest priority\):/);
  });

  it('never interpolates caller input into the prompt', () => {
    const src = fs.readFileSync(path.join(ROOT, PROMPT_MODULE), 'utf8');
    // The locale must be used to INDEX a literal table, never spliced in as
    // text — otherwise the request body becomes a prompt-injection channel.
    expect(src).toMatch(/LANGUAGE_RULE\[locale\]/);
    expect(src).not.toMatch(/\$\{\s*locale\s*\}/);
  });
});

describe('the prompt builder lives outside the route', () => {
  const src = fs.readFileSync(path.join(ROOT, ROUTE), 'utf8');

  it('route.ts imports it instead of defining it', () => {
    // Next.js type-checks generated route types against a fixed export list:
    // exporting buildSystemPrompt/resolveLocale from a route.ts fails the
    // build with "not assignable to type 'never'".
    expect(src).toMatch(/from '@\/lib\/analyze-prompt'/);
    expect(src).not.toMatch(/export function (buildSystemPrompt|resolveLocale)/);
    expect(src).not.toMatch(/export type AnalyzeLocale/);
  });

  it('route.ts exports only route handlers and Next config symbols', () => {
    const ALLOWED = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|dynamic|revalidate|runtime|maxDuration|fetchCache|preferredRegion|dynamicParams|generateStaticParams)$/;
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|type|interface)\s+(\w+)/gm)].map(
      (m) => m[1]
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(ALLOWED);
  });
});

describe('locale reaches the API from the chat client', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'lib/useChatStream.ts'), 'utf8');

  it('useChatStream posts the current locale', () => {
    expect(hook).toMatch(/locale:\s*localeRef\.current/);
  });

  it('reads the locale through a ref so send() keeps a stable identity', () => {
    // send is a dependency of caller effects; taking `locale` directly as a
    // useCallback dep would rebuild it on every language toggle.
    expect(hook).toMatch(/localeRef\.current = locale/);
    expect(hook).not.toMatch(/\[patchLastAssistant, update, locale\]/);
  });

  it('the route reads locale off the request body', () => {
    const src = fs.readFileSync(path.join(ROOT, ROUTE), 'utf8');
    expect(src).toMatch(/resolveLocale\(body\.locale\)/);
  });
});

describe('markdown export header follows the UI locale', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/export-report.ts'), 'utf8');

  it('has both locale label sets', () => {
    expect(src).toContain('Kiro AI 분석 리포트');
    expect(src).toContain('Kiro AI Analysis Report');
  });

  it('is called with the active locale', () => {
    const caller = fs.readFileSync(
      path.join(ROOT, 'app/components/chat/MessageList.tsx'),
      'utf8'
    );
    expect(caller).toMatch(/exportMarkdown\(msg\.content, questionFor\(idx\), locale\)/);
  });
});
