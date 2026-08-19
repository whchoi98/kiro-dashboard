# 인프라 상세 패널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /infra-cost 테이블 행 클릭 → 우측 슬라이드 패널에 상세(비용 계산식·관련 지표) 표시.

**Architecture:** 새 fetch 없음 — 라우트가 CostLine의 formula/kind를 InfraResource에 병합(옵셔널 필드), 새 표시 전용 컴포넌트가 UserDetailPanel 관용구(백드롭+translate-x+Escape)를 재사용.

**Spec:** `docs/superpowers/specs/2026-08-19-infra-detail-panel-design.md`

## Global Constraints

- 다크 우선만, `dark:`/`light:` 금지. i18n ko/en 페어. 새 fetch/API 호출 금지(표시 전용).
- NEVER npm install/ci; NEVER touch .claude/settings.json. If `npm run build` denied: report only.
- 검증: `npx jest`(480 무회귀) + `npm run build`. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 타입·라우트 병합 + 패널 + 배선 + i18n (단일 태스크)

**Files:**
- Modify: `types/dashboard.ts`, `app/api/infra/route.ts`, `app/infra-cost/page.tsx`, `lib/i18n.tsx`, `types/CLAUDE.md`, `app/api/CLAUDE.md`, `app/components/CLAUDE.md`
- Create: `app/components/ui/InfraDetailPanel.tsx`

- [ ] **Step 1: 타입** — `types/dashboard.ts`의 `InfraResource`에서 `monthlyUsd` 필드 아래 추가:

```ts
  /** Human-readable cost calculation from lib/infra-cost's CostLine; absent on rows without a cost line. */
  formula?: string | null;
  costKind?: 'fixed' | 'usage-excluded' | null;
```

- [ ] **Step 2: 라우트 병합** — `app/api/infra/route.ts`의 GET에서 기존:

```ts
  const cost = (resource: string): number | null =>
    lines.find((l) => l.resource === resource)?.monthlyUsd ?? null;
```
를 다음으로 교체:
```ts
  const costLine = (resource: string) => lines.find((l) => l.resource === resource) ?? null;
  // Attach the whole cost line (amount + human-readable formula + kind) so the
  // detail panel can show HOW an estimate was computed, not just the number.
  const withCost = (r: InfraResource, lineName: string): InfraResource => {
    const l = costLine(lineName);
    return { ...r, monthlyUsd: l?.monthlyUsd ?? null, formula: l?.formula ?? null, costKind: l?.kind ?? null };
  };
```
그리고 라이브 배열을:
```ts
  const live: InfraResource[] = [
    withCost(ecsInfo.resource, 'Fargate'),
    withCost(albInfo.resource, 'ALB'),
    withCost(cfInfo.resource, 'CloudFront'),
    withCost(ecrInfo.resource, 'ECR'),
  ];
```
정적 매핑을:
```ts
  const STATIC_LINE: Record<string, string> = {
    nat: 'NAT Gateway',
    secrets: 'Secrets Manager',
    athena: 'Athena',
    s3: 'S3',
    bedrock: 'Bedrock',
    logs: 'CloudWatch Logs',
  };
  const statics = staticResources().map((r) =>
    STATIC_LINE[r.id] ? withCost(r, STATIC_LINE[r.id]) : r,
  );
```
로 교체 (기존 nat/secrets 개별 분기 제거). 기존 `cost()` 참조가 남지 않게 정리.

- [ ] **Step 3: i18n** — ko 블록 `'infra.estimateNote'` 행 아래:
```ts
    'infra.panel.cost': '비용 계산식',
    'infra.panel.metrics': '관련 지표',
    'infra.panel.fixed': '고정',
```
en 블록 같은 위치:
```ts
    'infra.panel.cost': 'Cost formula',
    'infra.panel.metrics': 'Related metrics',
    'infra.panel.fixed': 'fixed',
```

- [ ] **Step 4: 패널 컴포넌트** — `app/components/ui/InfraDetailPanel.tsx`. 먼저 `app/components/ui/UserDetailPanel.tsx`를 읽고 **백드롭 블록과 슬라이드 컨테이너 클래스·닫기 버튼 마크업을 그대로 미러링**한다. 전체 코드:

```tsx
'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { InfraResource, InfraStatusData } from '@/types/dashboard';

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-400',
  degraded: 'bg-orange-500/10 text-orange-400',
  unknown: 'bg-gray-500/10 text-gray-400',
  static: 'bg-slate-500/10 text-slate-400',
};

interface InfraDetailPanelProps {
  resource: InfraResource | null;
  metrics: InfraStatusData['metrics'] | null;
  onClose: () => void;
}

// Display-only right slide-over (UserDetailPanel idiom, minus the fetch): the
// page already holds everything in InfraStatusData, so opening a row costs
// zero network calls.
export default function InfraDetailPanel({ resource, metrics, onClose }: InfraDetailPanelProps) {
  const { t } = useI18n();
  const isOpen = resource !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const related: Array<{ labelKey: string; value: string }> = [];
  if (resource && metrics) {
    if (resource.id === 'ecs') {
      related.push(
        { labelKey: 'infra.metric.cpu', value: metrics.ecsCpuPct === null ? '—' : `${metrics.ecsCpuPct.toFixed(1)}%` },
        { labelKey: 'infra.metric.mem', value: metrics.ecsMemPct === null ? '—' : `${metrics.ecsMemPct.toFixed(1)}%` },
      );
    } else if (resource.id === 'alb') {
      related.push(
        { labelKey: 'infra.albRequests', value: metrics.albRequests1h === null ? '—' : metrics.albRequests1h.toLocaleString() },
        { labelKey: 'infra.metric.latency', value: metrics.albP50LatencySec === null ? '—' : `${(metrics.albP50LatencySec * 1000).toFixed(0)} ms` },
      );
    } else if (resource.id === 'cloudfront') {
      related.push(
        { labelKey: 'infra.metric.cfRequests', value: metrics.cfRequests1h === null ? '—' : metrics.cfRequests1h.toLocaleString() },
      );
    }
  }

  return (
    <>
      {/* Backdrop — mirror UserDetailPanel's exact block */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[480px] z-50 flex flex-col bg-gray-950 border-l border-gray-800 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex flex-col gap-1 min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white leading-tight">{resource?.type ?? ''}</h2>
              {resource && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[resource.status]}`}>
                  {resource.status === 'static' ? t('infra.status.static') : resource.status}
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-gray-400 truncate">{resource?.name ?? ''}</span>
            <span className="text-xs font-mono text-gray-500">{resource?.region ?? ''}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none px-1"
            aria-label="close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Cost */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.col.monthly')}</span>
              {resource?.costKind && (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9046FF]">
                  {resource.costKind === 'fixed' ? t('infra.panel.fixed') : t('infra.usageBased')}
                </span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono text-white">
              {resource?.monthlyUsd === null || resource?.monthlyUsd === undefined
                ? t('infra.usageBased')
                : `$${resource.monthlyUsd.toFixed(2)}`}
            </span>
            {resource?.formula && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.panel.cost')}</span>
                <pre className="mt-1 bg-gray-900/80 border border-gray-800 rounded p-3 text-xs font-mono text-gray-300 whitespace-pre-wrap break-words">{resource.formula}</pre>
              </div>
            )}
          </div>

          {/* Related metrics */}
          {related.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.panel.metrics')}</span>
              <div className="grid grid-cols-2 gap-2">
                {related.map((item) => (
                  <div key={item.labelKey} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t(item.labelKey)}</span>
                    <span className="text-xl font-bold font-mono text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail + note */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.col.detail')}</span>
            <p className="text-sm text-gray-300">{resource?.detail ?? ''}</p>
          </div>
          <p className="text-xs text-gray-600">{t('infra.estimateNote')}</p>
        </div>
      </div>
    </>
  );
}
```
(UserDetailPanel의 실제 백드롭/컨테이너 클래스와 다르면 **그 파일 쪽을 기준으로** 맞춘다.)

- [ ] **Step 5: 페이지 배선** — `app/infra-cost/page.tsx`:
import 추가 `import InfraDetailPanel from '@/app/components/ui/InfraDetailPanel';`
state 추가 `const [selectedId, setSelectedId] = useState<string | null>(null);`
선택 계산 `const selected = data?.resources.find((r) => r.id === selectedId) ?? null;`
행 `<tr>`에: `onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}` + 클래스에 `cursor-pointer` 추가 + 선택 시 `bg-gray-800/40` (`${selectedId === r.id ? 'bg-gray-800/40' : ''}` 템플릿)
`</table>` 닫힌 뒤(각주 앞 아님, SkeletonGate 안 마지막):
```tsx
      <InfraDetailPanel resource={selected} metrics={data?.metrics ?? null} onClose={() => setSelectedId(null)} />
```

- [ ] **Step 6: 검증** — `npx jest`(480 무회귀) · `npm run build` 성공 (denied면 보고)

- [ ] **Step 7: 문서** — `app/components/CLAUDE.md` ui/ 목록에 `InfraDetailPanel.tsx   Display-only right slide-over for /infra-cost rows (cost formula + related CloudWatch metrics; no fetch)`; `app/api/CLAUDE.md` infra 행 끝에 `; exposes CostLine formula/kind per resource`; `types/CLAUDE.md` InfraResource 행에 formula/costKind 언급.

- [ ] **Step 8: Commit**

```bash
git add types/dashboard.ts app/api/infra/route.ts app/components/ui/InfraDetailPanel.tsx app/infra-cost/page.tsx lib/i18n.tsx types/CLAUDE.md app/api/CLAUDE.md app/components/CLAUDE.md
git commit -m "feat(ui): infra resource detail side panel with cost formula and metrics

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
