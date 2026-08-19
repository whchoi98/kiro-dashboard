# 스펙: /infra-cost 자원 상세 패널 (우측 슬라이드)

- 날짜: 2026-08-19
- 상태: 설계 승인됨
- 배경: 자원 테이블 행 클릭 시 우측 패널로 상세 표시. 저장소의 검증된 관용구
  `UserDetailPanel`(고정 우측 슬라이드, 백드롭/Escape 닫기)을 재사용하되,
  **새 fetch 없음** — 페이지가 이미 가진 `InfraStatusData`에서 표시만 한다.

## 1. API/타입 보강 (formula 노출)

- `types/dashboard.ts` `InfraResource`에 **옵셔널** 필드 2개:
  `formula?: string | null;` `costKind?: 'fixed' | 'usage-excluded' | null;`
  (옵셔널인 이유: 라우트 fetcher들의 기존 리소스 리터럴 10곳을 건드리지 않기 위해 —
  비용 병합 단계에서만 채워진다)
- `app/api/infra/route.ts`: `cost(name)` 헬퍼를 `costLine(name)`(CostLine 전체 반환)으로
  일반화하고, 병합 헬퍼 `withCost(resource, lineName)`가 `monthlyUsd`+`formula`+`costKind`를
  한 번에 붙인다. 라이브 4종(Fargate/ALB/CloudFront/ECR) + 정적 중 코스트 라인이 있는
  것(NAT Gateway/Secrets Manager/Athena/S3/Bedrock/CloudWatch Logs)에 적용.
  코스트 라인이 없는 정적 자원(VPC/Cognito/Lambda@Edge)은 그대로(필드 부재).

## 2. 컴포넌트 — `app/components/ui/InfraDetailPanel.tsx` (신규)

- props: `{ resource: InfraResource | null; metrics: InfraStatusData['metrics'] | null; onClose: () => void }`
  — `resource === null`이면 닫힘. fetch·loading 상태 없음(순수 표시).
- 구조는 `UserDetailPanel`과 동일 관용구: 백드롭(클릭 닫기) + `fixed top-0 right-0
  h-full w-full max-w-[480px] z-50 … translate-x` 슬라이드 + Escape 닫기 + 헤더 X 버튼.
- 내용(위→아래):
  1. 헤더: 유형 + 상태 배지(테이블과 동일 스타일 매핑), 이름(모노), 리전
  2. **월 비용 카드**: 금액(`$xx.xx`) 또는 "사용량 비례"; `formula`가 있으면 모노스페이스
     블록(`bg-gray-900/60 rounded p-3 text-xs font-mono`)으로 계산식 표시 +
     고정/사용량 뱃지(`costKind`)
  3. **관련 지표** (자원 id별 조건부): `ecs`→CPU%·메모리%, `alb`→요청(1h)·응답시간,
     `cloudfront`→요청(1h); 그 외 자원은 섹션 자체 생략. 값 포맷은 페이지와 동일
  4. 상세 텍스트(`detail`) + 추정치 각주(`infra.estimateNote` 재사용)
- 다크 우선만. 지표 라벨은 기존 `infra.metric.*` 키 재사용.

## 3. 페이지 배선 (`app/infra-cost/page.tsx`)

- `selectedId: string | null` state; 행 `onClick`으로 토글(같은 행 재클릭 시 해제)
- 행 스타일: `cursor-pointer` 추가, 선택 행 `bg-gray-800/40` 강조
- 테이블 뒤에 `<InfraDetailPanel resource={selected} metrics={data?.metrics ?? null} onClose={...} />`
  (`selected = data?.resources.find((r) => r.id === selectedId) ?? null`)

## 4. i18n (ko/en)

`infra.panel.cost` 비용 계산식/Cost formula · `infra.panel.metrics` 관련 지표/Related
metrics · `infra.panel.fixed` 고정/fixed. 사용량 뱃지는 기존 `infra.usageBased` 재사용.
계산식 문자열 자체는 수식이므로 번역하지 않는다.

## 5. 검증 / 문서

- 기존 jest 480 무회귀(+ `tests/lib/infra-cost.test.ts`가 formula 문자열을 이미 고정) +
  `npm run build`. 데이터 변경은 병합 2필드뿐이라 라우트 신규 테스트는 두지 않는다.
- 문서: `app/components/CLAUDE.md`(InfraDetailPanel), `app/api/CLAUDE.md`(infra 행에
  formula 노출 언급), `types/CLAUDE.md`(필드 추가) 각 1줄.
