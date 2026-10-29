/**
 * stopReasonNotice decides what the analyze chat says when a turn ends
 * abnormally. A silent ending used to leave a half-written answer with no
 * explanation; these tests pin which endings speak up and in which language.
 */

import { StopReason } from '@aws-sdk/client-bedrock-runtime';
import { stopReasonNotice } from '../../lib/analyze-stop';

const LOCALES = ['ko', 'en'] as const;

describe('stopReasonNotice', () => {
  it.each([['end_turn'], ['tool_use'], ['stop_sequence']] as const)(
    'stays silent for the normal ending %s',
    (reason) => {
      for (const locale of LOCALES) expect(stopReasonNotice(reason, locale)).toBeNull();
    }
  );

  it('stays silent when the stream reported no stop reason', () => {
    expect(stopReasonNotice(undefined, 'ko')).toBeNull();
  });

  it('tells the user a cut-off answer needs a narrower question', () => {
    expect(stopReasonNotice('max_tokens', 'ko')).toMatch(/길이 한도/);
    expect(stopReasonNotice('max_tokens', 'en')).toMatch(/length limit/);
  });

  it('gives both safety endings the same decline message', () => {
    for (const locale of LOCALES) {
      expect(stopReasonNotice('content_filtered', locale)).toBe(
        stopReasonNotice('guardrail_intervened', locale)
      );
    }
    expect(stopReasonNotice('content_filtered', 'en')).toMatch(/safety policy/);
  });

  it('names the reason for endings without a dedicated message', () => {
    expect(stopReasonNotice('malformed_tool_use', 'en')).toContain('malformed_tool_use');
    // A value a future SDK adds must surface, not vanish.
    expect(stopReasonNotice('brand_new_reason' as StopReason, 'ko')).toContain('brand_new_reason');
  });

  it('covers every StopReason the installed SDK defines, in both locales', () => {
    const silent = new Set(['end_turn', 'tool_use', 'stop_sequence']);
    for (const reason of Object.values(StopReason)) {
      for (const locale of LOCALES) {
        const notice = stopReasonNotice(reason, locale);
        if (silent.has(reason)) expect(notice).toBeNull();
        else expect(notice).toEqual(expect.any(String));
      }
    }
  });

  it('answers in the requested language', () => {
    expect(stopReasonNotice('max_tokens', 'ko')).toMatch(/[가-힣]/);
    expect(stopReasonNotice('max_tokens', 'en')).not.toMatch(/[가-힣]/);
  });
});
