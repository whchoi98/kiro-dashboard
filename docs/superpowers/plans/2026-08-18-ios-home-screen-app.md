# 아이폰·아이패드 홈 화면 앱 (PWA-lite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면 추가 시 Kiro 아이콘·이름·standalone 전체화면으로 설치되게 한다 (아이콘 3종 + `app/manifest.ts` + apple 메타).

**Architecture:** 아이콘은 운영 단계에서 kiro-logo.svg를 #9046FF 플래튼 래스터화해 `public/`에 배치(Task 0, 컨트롤러). 코드는 `app/manifest.ts`(Next 네이티브 매니페스트)와 `layout.tsx` 메타 2곳뿐. 구조 테스트가 PNG 크기·시그니처와 매니페스트 필드를 고정한다.

**Tech Stack:** Next.js 14 Metadata API, jest.

**Spec:** `docs/superpowers/specs/2026-08-18-ios-home-screen-app-design.md`

## Global Constraints

- 서비스워커 금지 (스펙 §4). `theme_color`/`background_color`/viewport `themeColor`는 전부 `#000000`.
- NEVER run `npm install`/`npm ci`; NEVER touch `.claude/settings.json`.
- 검증: `npx jest` + `npm run build`. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 0 (운영, 컨트롤러 실행): 아이콘 3종 생성

- [ ] `public/kiro-logo.svg` → `#9046FF` 플래튼 + 리사이즈로 `public/apple-touch-icon.png`(180), `public/icon-192.png`, `public/icon-512.png` 생성 (npx sharp-cli, 실패 시 AgentCore 샌드백스 cairosvg)
- [ ] 확인: 파일 3개, PNG 시그니처, 정사각 크기

### Task 1: manifest + 메타 + 테스트 + 문서

**Files:**
- Create: `app/manifest.ts`, `tests/structure/pwa-assets.test.ts`
- Modify: `app/layout.tsx` (metadata 블록 + viewport export), `app/CLAUDE.md`
- Commit에 포함: Task 0의 PNG 3개

**Interfaces:**
- Consumes: Task 0의 PNG 3종 (`public/`)
- Produces: `/manifest.webmanifest` (Next 자동 서빙), apple-touch-icon 링크

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/structure/pwa-assets.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import manifest from '../../app/manifest';

const ROOT = path.resolve(__dirname, '../..');

function pngSize(file: string): { w: number; h: number } {
  const buf = fs.readFileSync(file);
  // 8-byte PNG signature, then IHDR: width @16, height @20 (big-endian).
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('PWA assets', () => {
  test.each([
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])('%s is a %dpx square PNG', (name, size) => {
    const { w, h } = pngSize(path.join(ROOT, 'public', name as string));
    expect(w).toBe(size);
    expect(h).toBe(size);
  });

  test('manifest declares the standalone home-screen app', () => {
    const m = manifest();
    expect(m.name).toBe('Kiro Dashboard');
    expect(m.short_name).toBe('Kiro');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.background_color).toBe('#000000');
    expect(m.theme_color).toBe('#000000');
    expect((m.icons ?? []).map((i) => i.src)).toEqual(['/icon-192.png', '/icon-512.png']);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest tests/structure/pwa-assets.test.ts` → FAIL (`Cannot find module '../../app/manifest'`; PNG 테스트는 Task 0이 선행됐으면 통과 상태여도 무방)

- [ ] **Step 3: `app/manifest.ts` 작성** — 스펙 §2의 코드 그대로:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kiro Dashboard',
    short_name: 'Kiro',
    description: 'Kiro IDE 사용자 분석 대시보드',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 4: `app/layout.tsx` 메타 수정**

`import type { Metadata } from 'next';` → `import type { Metadata, Viewport } from 'next';`

기존:
```ts
export const metadata: Metadata = {
  title: 'Kiro Analytics Dashboard',
  icons: { icon: '/kiro-logo.svg' },
};
```
교체:
```ts
export const metadata: Metadata = {
  title: 'Kiro Analytics Dashboard',
  icons: { icon: '/kiro-logo.svg', apple: '/apple-touch-icon.png' },
  // 'black' (opaque) keeps the iOS status bar off the content, so no
  // safe-area-inset work is needed (black-translucent would require it).
  appleWebApp: { capable: true, title: 'Kiro Dashboard', statusBarStyle: 'black' },
};

// Matches Next's injected default, made explicit to add themeColor (dark bg).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};
```

- [ ] **Step 5: 통과 확인** — `npx jest tests/structure/pwa-assets.test.ts` → PASS (4 tests)

- [ ] **Step 6: 전체 검증** — `npx jest` 전체 PASS (457 + 4 = 461) · `npm run build` 성공 후:
`grep -o '<link rel="manifest"[^>]*>' .next/server/app/subscription.html` 과 `grep -o '<link rel="apple-touch-icon"[^>]*>' .next/server/app/subscription.html` 각각 1건 확인 (denied면 보고만)

- [ ] **Step 7: `app/CLAUDE.md` 갱신** — Layout 절(`app/layout.tsx` wraps…)의 목록에 추가:

```
- PWA-lite home-screen support: `app/manifest.ts` (standalone, #000000 theme) + `apple-touch-icon.png`/`icon-192/512.png` in `public/` (rasterized from kiro-logo.svg, #9046FF flattened) + `appleWebApp` meta in layout — no service worker by design
```

- [ ] **Step 8: Commit**

```bash
git add public/apple-touch-icon.png public/icon-192.png public/icon-512.png app/manifest.ts app/layout.tsx tests/structure/pwa-assets.test.ts app/CLAUDE.md
git commit -m "feat(pwa): iOS home-screen app — icons, web manifest, apple meta

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
