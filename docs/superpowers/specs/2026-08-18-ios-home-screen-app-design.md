# 스펙: 아이폰·아이패드 홈 화면 앱 (PWA-lite)

- 날짜: 2026-08-18
- 상태: 설계 승인됨 ("실행" 지시)
- 배경: 뷰포트(`width=device-width, initial-scale=1`, Next 기본 주입)와 반응형
  레이아웃은 이미 정상 — Safari 브라우저 표시는 동작한다. 없는 것은 홈 화면
  앱 경험(아이콘·이름·standalone). 사용자 결정: PWA-lite (서비스워커/오프라인 비목표).

## 1. 아이콘 3종 (`public/`, 운영 단계에서 생성)

- `apple-touch-icon.png` 180×180 / `icon-192.png` / `icon-512.png`
- `public/kiro-logo.svg`(1200×1200, #9046FF 라운드 사각 rx=260 + 마스코트)를
  **#9046FF 불투명 정사각** 위에 플래튼 후 리사이즈 — 투명 모서리를 남기면
  iOS가 검게 채우므로 전면 보라 배경으로 만든다. 마스코트는 중앙 55×66%라
  maskable 안전 영역(80%)을 만족.
- 생성 도구는 운영 재량(npx sharp-cli 또는 AgentCore 샌드박스 cairosvg) —
  산출물 PNG는 커밋되므로 재현성은 테스트(크기·시그니처)로 보증한다.

## 2. `app/manifest.ts` (신규 — Next가 `/manifest.webmanifest` 자동 서빙·자동 링크)

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
배경·테마색은 다크 기본(`bg-black`)과 일치하는 `#000000`.

## 3. `app/layout.tsx` 메타 (수정)

```ts
export const metadata: Metadata = {
  title: 'Kiro Analytics Dashboard',
  icons: { icon: '/kiro-logo.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Kiro Dashboard', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};
```
- `statusBarStyle: 'black'`(불투명) — `black-translucent`가 요구하는 safe-area
  (노치) 대응 작업을 회피한다.
- `viewport` export는 기존 자동 주입을 명시화 + `themeColor` 추가.
  `import type { Metadata, Viewport } from 'next';`

## 4. 비목표 / 주의

- 서비스워커·오프라인 캐시 없음 (실시간 대시보드 + Lambda@Edge 인증과 충돌 소지)
- standalone 모드에서 Cognito 로그인 리다이렉트는 같은 웹뷰에서 정상 동작 (문서화만)
- 안드로이드는 manifest만으로 자동 수혜 (별도 작업 없음)

## 5. 테스트 / 검증 / 문서

- `tests/structure/pwa-assets.test.ts`: PNG 3개의 시그니처(89504E47…) + IHDR
  크기(180/192/512 정사각) 검증, `app/manifest.ts` 반환값 필드 검증
  (standalone·이름·아이콘 경로)
- `npm run build` 후 산출 HTML에 `<link rel="manifest">`와 apple-touch-icon
  링크가 주입됐는지 확인
- 문서: `app/CLAUDE.md` Layout 절에 PWA 메타 한 줄 추가
