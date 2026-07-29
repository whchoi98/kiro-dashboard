# Kiro User Activity Report 전체 스키마

> 출처: [Kiro 공식 문서 - Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/)
> S3 버킷: `s3://whchoi01-titan-q-log/q-user-log/`
> AWS 계정: 120443221648
> 최종 업데이트: 2026-07-29

> **문서 성격:** 이 문서의 컬럼 표는 **공식 문서의 스키마**와 **본 계정 S3 실데이터 관찰 결과**를 함께 담고 있습니다.
> 두 내용이 다를 경우 공식 문서가 기준이며, 관찰 결과는 "현재 계정에서는 이렇게 보인다"는 참고 정보입니다.
> 전체 레퍼런스 목록은 README의 "참고 문서" 섹션을 보세요.

---

## 리포트 생성 규칙 (공식 문서 기준)

| 항목 | 내용 |
|------|------|
| 생성 주기 | 매일 **02:00 UTC**에 클라이언트 타입별로 CSV 1개씩 생성 |
| 최초 생성 | 기능 활성화 후 **다음 02:00 UTC** — 최초 데이터까지 최대 약 24시간 |
| 전체 S3 경로 | `s3://<bucket>/<prefix>/AWSLogs/<accountId>/KiroLogs/user_report/<region>/<year>/<month>/<day>/00/<clientType>_<accountId>_user_report_<ts>.csv` |
| `00` 세그먼트 | 02:00 UTC 기록 시각을 나타내는 **고정 시간 파티션** (시간별 파티션이 아님) |
| 1,000명 초과 분할 | 하루 활동 사용자가 1,000명을 넘으면 CSV가 `part_1`, `part_2`, … 로 분할됨 |
| 크로스 계정 | **미지원.** 버킷은 사용자가 구독된 계정 + Kiro 프로필이 설치된 리전에 있어야 함 |
| 버킷 루트 | 사용 불가 — prefix(서브폴더) 필수 |
| 버킷 정책 | `q.amazonaws.com` 서비스 프린시펄에 `s3:PutObject` 허용, 조건은 `aws:SourceAccount` + `aws:SourceArn`(`arn:aws:codewhisperer:<region>:<account>:*`) |
| 보존 기간 | 공식 문서에 정의 없음 — S3 라이프사이클로 소비자가 직접 관리 |

> **`part_N` 분할 처리 상태:** `lib/uar-s3.ts`의 `listAllKeys()`는 `.csv`로 끝나는 모든 키를 수집하므로 분할 파일도 자동으로 포함됩니다.
> 단, Athena 경로(`user_report` Glue 테이블)도 프리픽스 전체를 스캔하므로 동일하게 안전합니다.

---

## 리포트 개요

| 구분 | 신규 `user_report` | 레거시 `by_user_analytic` |
|------|-------------------|--------------------------|
| 관점 | 비용/라이선스 관리 | 개발자 생산성 |
| 컬럼 수 | 11개 고정 + 동적 모델 컬럼 | 46개 |
| S3 경로 | `.../KiroLogs/user_report/us-east-1/` | `.../KiroLogs/by_user_analytic/us-east-1/` |
| 파일명 | `{CLIENT_TYPE}_120443221648_user_report_{ts}.csv` | `120443221648_by_user_analytic_{ts}_report.csv` |
| 파일 분리 | 클라이언트별 분리 (KIRO_CLI, KIRO_IDE) | 통합 파일 |
| 날짜 형식 | `YYYY-MM-DD` | `MM-DD-YYYY` |
| 데이터 기간 | 2026-02-10 ~ 현재 | 2025-12-01 ~ 현재 |
| 파일 수 | 214개 | 202개 (§B-0 / §B-0b 참고) |
| JOIN 키 | `UserId` + `Date` — **부분 조인만 가능** (아래 주의) ||

> **⚠️ JOIN 커버리지 (2026-07-29 실측):** 두 리포트는 `UserId` + `Date`로 조인되지만 **일치율이 낮습니다.**
> `user_report`의 257개 (사용자, 날짜) 쌍 중 238개는 `by_user_analytic`에 존재하지만,
> 반대로 `by_user_analytic`의 541개 쌍 중 **303개는 `user_report`에 없습니다.**
> `by_user_analytic`에만 등장하는 사용자도 13명 있고, 데이터 시작일도 다릅니다(2025-12-01 vs 2026-02-10).
> 따라서 두 테이블을 INNER JOIN하는 기능은 레거시 데이터의 절반 이상을 조용히 버립니다 — 크레딧을 생산성 지표에 귀속시키려면 조인 대신 **동일 기간에 대한 각각의 집계**를 쓰는 편이 안전합니다.
>
> **`by_user_analytic`에는 `Client_Type` 컬럼이 없습니다** (전체 46개 헤더에 없음). 즉 레거시 행은 IDE/CLI로 귀속시킬 수 없습니다.
> 반면 `user_report`는 같은 사용자·같은 날짜를 클라이언트별로 최대 2행으로 분리하므로(257쌍 중 66쌍이 다중 클라이언트), 크레딧을 레거시 행에 클라이언트 단위로 배분하는 것도 불가능합니다.

> **참고:** `PLUGIN` 클라이언트 타입은 공식 문서에 정의되어 있으나, 현재 S3 데이터에는 존재하지 않음 (CLI/IDE만 확인).

---

## A. 신규 리포트: `user_report` — 크레딧/구독 관리 (11개 고정 + 동적 모델 컬럼)

### A-1. 고정 컬럼 (11개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 1 | `Date` | string | 리포트 활동 날짜 (YYYY-MM-DD) |
| 2 | `UserId` | string | 활동이 기록된 사용자 ID |
| 3 | `Client_Type` | string | `KIRO_IDE`, `KIRO_CLI`, `PLUGIN` |
| 4 | `Chat_Conversations` | integer | 해당 날짜의 대화 수 |
| 5 | `Credits_Used` | double | 구독 플랜에서 소비된 크레딧 |
| 6 | `Overage_Cap` | double | **이중 의미 컬럼.** `Overage_Enabled` = true → 관리자가 설정한 초과 한도. `Overage_Enabled` = false → **해당 구독 플랜에 포함된 최대 크레딧(사전 설정값)**. 즉 초과 미사용 사용자 행에서 티어별 "포함 크레딧 할당량"을 데이터로 역산할 수 있습니다 (공식 문서 원문: *"If overage is not enabled, this field shows the maximum credits included for a subscription plan as a preset value"*). **단, 본 계정에서는 `Overage_Enabled = false` 행이 0건이므로 이 역산은 현재 불가능합니다 — §B-0b 참고** |
| 7 | `Overage_Credits_Used` | double | 사용자가 사용한 총 초과 크레딧 (`Overage_Enabled` = true일 때). ⚠️ 공식 문서의 "Total number of..."라는 표현은 **일별 증분인지 누적 총계인지 모호**합니다. IDE 문서는 "Total number of overage credits used by the user", CLI 문서는 "Daily overage credit usage"로 서로 다르게 기술합니다. 현재 모든 라우트는 날짜 구간에 대해 `SUM()`하므로, 누적값이라면 중복 합산 위험이 있습니다. **검증 결과: 이 계정의 323개 행 전부가 `0.0`이므로 두 해석 모두 0을 내며 — 즉 이 모호성은 현재 데이터로는 해소할 수 없습니다.** 이 컬럼을 `SUM()`하는 신규 기능은 보류해야 합니다 |
| 8 | `Overage_Enabled` | string | 초과 사용 활성화 여부 (`true`/`false`). `Overage_Cap`의 의미를 결정하는 게이트 컬럼 |
| 9 | `ProfileId` | string | 사용자 활동과 연결된 프로필 |
| 10 | `Subscription_Tier` | string | Kiro 구독 플랜. **공식 문서 두 곳의 표기가 다릅니다** — 활동 리포트 문서는 `Pro` / `ProPlus` / `ProMax` / `Power`, 콘솔 대시보드 문서는 `Pro` / `Pro+` / `Pro Max` / `Power`. 리포트 CSV에 실제로 들어오는 값은 앞쪽(공백·`+` 없는) 표기이므로, 문자열 비교 시 뒤쪽 표기로 매칭하면 전부 실패합니다. 본 계정 실데이터는 `POWER` **대문자** 100% (§B-0b) |
| 11 | `Total_Messages` | integer | Kiro와 주고받은 총 메시지 수 (사용자 프롬프트 + 툴 콜 + Kiro 응답 포함) |

### A-1b. 후속 추가 컬럼 (2개)

공식 문서의 현행 리포트 메트릭 표에는 아래 2개 컬럼이 함께 정의되어 있습니다(총 13개). 위 11개보다 **나중에 추가되어 파일마다 위치가 다르므로**, Glue `OpenCSVSerDe`(위치 기반 매핑)로는 안전하게 읽을 수 없습니다 — ADR-0004 참고.

| # | 컬럼 | 타입 | 설명 | 소비 위치 |
|---|------|------|------|-----------|
| 12 | `New_User` | boolean | **구독이 새로 활성화되었는지** 여부. 공식 문서 원문: *"If the user activated their Kiro subscription on the report date, this metric will be true"* — 즉 "그날 처음 사용" 이 아니라 **"그날 구독을 개시"** 입니다. 리포트 행 자체가 활동이 있는 날에만 생성되므로, `true`인 날은 정의상 이미 활동한 날입니다 (→ 최초 가치 도달 시간(TTFV) 측정 불가) | `/api/adoption` (S3 헤더명 파싱) |
| 13 | `User_Email` | string | 사용자 이메일 주소 (평문) | **의도적으로 미사용.** 신원 정보는 IAM Identity Center(`lib/identity.ts`)에서 마스킹 후 조회 — ADR-0004 참고 |

> **주의:** `User_Email`은 리포트에 평문으로 적재됩니다. 공식 문서에는 마스킹/익명화 언급이 없으므로 버킷 암호화와 접근 제어가 유일한 보호 수단입니다.

### A-2. 동적 모델 컬럼 (2026-03-12~)

| 컬럼 패턴 | 타입 | 설명 |
|-----------|------|------|
| `{model_name}_messages` | integer | 특정 모델이 사용자에게 처리한 메시지 수. Auto 포함, 실제 사용 모델에 따라 동적 생성, 알파벳순 정렬 |

**확인된 모델 컬럼 (S3 실데이터 기준, 2026-07-29 재검증 — 전체 214개 파일):**

| 컬럼명 | 출현 파일 수 | 설명 |
|--------|------------|------|
| `claude_opus_4.8_messages` | 80 | Claude Opus 4.8 |
| `auto_messages` | 51 | Auto 모드로 처리된 메시지 수 |
| `claude_opus_4.7_messages` | 36 | Claude Opus 4.7 |
| `claude_opus_4.6_messages` | 21 | Claude Opus 4.6 |
| `gpt_5.6_sol_messages` | 11 | 서드파티 모델 (GPT) |
| `claude_opus_5_messages` | 3 | Claude Opus 5 |
| `claude_sonnet_4_messages` | 1 | Claude Sonnet 4 |
| `claude_sonnet_4.6_messages` | 1 | Claude Sonnet 4.6 |
| `qwen3_coder_next_messages` | 1 | 서드파티 모델 (Qwen) |
| `glm_5_messages` | 1 | 서드파티 모델 (GLM) |

> **참고:**
> - 동적 컬럼은 해당 기간에 실제 사용된 모델에 따라 CSV 파일마다 순서와 개수가 다름
> - **모델 컬럼은 계속 늘어납니다.** 2026-04 기준 3종에서 2026-07 기준 10종으로 증가했고, Anthropic 외 서드파티 모델(GPT/Qwen/GLM)도 등장했습니다. 따라서 **모델명을 하드코딩하는 코드는 반드시 깨집니다** — `/api/model-usage`처럼 `endsWith('_messages')` 패턴 매칭으로만 처리해야 합니다
> - ⚠️ **`Total_Messages`도 `_messages`로 끝납니다.** 따라서 `endsWith('_messages')` 만으로 모델 컬럼을 골라내면 전체 메시지 수가 모델 하나로 잡혀 합계가 약 2배가 됩니다. `app/api/model-usage/route.ts:25`는 `col.endsWith('_messages') && col !== 'total_messages'` 로 이를 배제합니다 — 새 코드도 반드시 이 제외 조건을 함께 써야 합니다
> - Glue `OpenCSVSerDe`는 위치 기반 매핑이므로, 대시보드에서는 S3 직접 읽기 + 헤더 기반 파싱으로 처리
> - `auto_messages`는 Auto 모드 선택 시 기록되며, 별도 모델 선택 시 해당 모델 컬럼에 기록

---

## B. 레거시 리포트: `by_user_analytic` — 개발 생산성 메트릭 (46개 컬럼)

> **⚠️ 데이터 범위 주의 (공식 문서 기준):** 공식 문서는 이 레거시 리포트를 두 곳에서 명시적으로
> *"contains data for CLI and plugin usage only"* — 즉 **CLI/플러그인 사용량만 포함하며 IDE 데이터는 포함하지 않는다**고 기술합니다.
> 반면 개별 컬럼 설명에는 `Chat_AICodeLines`의 "IDE에 삽입된 코드만 포함"처럼 IDE를 전제한 문구가 남아 있어 공식 문서 내부에도 불일치가 있습니다.
>
> 본 저장소는 이 데이터를 `/productivity` 페이지에서 "IDE 생산성 메트릭"으로 표기해 왔습니다.
> 공식 문서 기준으로는 **"IDE"라는 한정어가 부정확할 수 있으므로**, 이 리포트 기반 수치를 IDE 지표로 해석하기 전에
> 자체 계정 데이터에서 `user_report`의 `Client_Type`과 교차 검증(`UserId` + `Date` JOIN)하는 것을 권장합니다.
> 신규 리포트(`user_report`)만이 `Client_Type`으로 IDE/CLI를 확실히 구분합니다.

### B-1. 기본 식별 (2개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 1 | `UserId` | string | 사용자 ID (UUID) |
| 2 | `Date` | string | 활동 날짜 (MM-DD-YYYY 형식) |

### B-2. Chat (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 3 | `Chat_AICodeLines` | bigint | Chat에서 Kiro가 제안하고 사용자가 수락한 코드 라인 수. IDE에 삽입된 코드만 포함 (인라인 챗 제외) |
| 4 | `Chat_MessagesInteracted` | bigint | 사용자가 긍정적으로 상호작용한 메시지 수 (링크 클릭, 제안 삽입, 추천 등). 인라인 챗 제외 |
| 5 | `Chat_MessagesSent` | bigint | Kiro Chat에서 보낸/받은 메시지 수 (사용자 프롬프트 + Kiro 응답). 인라인 챗 제외 |

### B-3. Inline Completion (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 6 | `Inline_SuggestionsCount` | bigint | 사용자에게 표시된 인라인 제안 수 |
| 7 | `Inline_AcceptanceCount` | bigint | 사용자가 수락한 인라인 제안 수 |
| 8 | `Inline_AICodeLines` | bigint | 인라인 제안으로 수락된 코드 라인 수 |

### B-4. Inline Chat (10개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 9 | `InlineChat_TotalEventCount` | bigint | 인라인 챗 세션 총 수 (Kiro Chat 제외) |
| 10 | `InlineChat_AcceptanceEventCount` | bigint | 사용자가 수락한 인라인 챗 제안 수 |
| 11 | `InlineChat_AcceptedLineAdditions` | bigint | 수락된 코드 추가 라인 수 (인라인 챗) |
| 12 | `InlineChat_AcceptedLineDeletions` | bigint | 수락된 코드 삭제 라인 수 (인라인 챗) |
| 13 | `InlineChat_RejectionEventCount` | bigint | 사용자가 거부한 인라인 챗 제안 수 |
| 14 | `InlineChat_RejectedLineAdditions` | bigint | 거부된 코드 추가 라인 수 (인라인 챗) |
| 15 | `InlineChat_RejectedLineDeletions` | bigint | 거부된 코드 삭제 라인 수 (인라인 챗) |
| 16 | `InlineChat_DismissalEventCount` | bigint | 무시(방치)된 인라인 챗 제안 수. 제안이 표시되었으나 수락/거부 없이 다른 작업 수행 |
| 17 | `InlineChat_DismissedLineAdditions` | bigint | 무시된 코드 추가 라인 수 (인라인 챗) |
| 18 | `InlineChat_DismissedLineDeletions` | bigint | 무시된 코드 삭제 라인 수 (인라인 챗) |

### B-5. Dev Agent — `/dev` 명령 (4개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 19 | `Dev_GenerationEventCount` | bigint | `/dev` 명령으로 코드 생성 제안 이벤트 수 |
| 20 | `Dev_GeneratedLines` | bigint | `/dev` 명령으로 Kiro가 제안한 코드 라인 수 |
| 21 | `Dev_AcceptanceEventCount` | bigint | `/dev` 명령으로 생성된 코드 중 수락 이벤트 수 |
| 22 | `Dev_AcceptedLines` | bigint | `/dev` 명령으로 생성된 코드 중 수락된 라인 수 |

### B-6. Code Fix — 코드 리뷰 기반 수정 (4개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 23 | `CodeFix_GenerationEventCount` | bigint | 코드 리뷰에서 Kiro가 수정을 제안한 이벤트 수 |
| 24 | `CodeFix_GeneratedLines` | bigint | 코드 리뷰에서 Kiro가 제안한 수정 라인 수 |
| 25 | `CodeFix_AcceptanceEventCount` | bigint | 코드 리뷰 수정 중 수락 이벤트 수 |
| 26 | `CodeFix_AcceptedLines` | bigint | 코드 리뷰를 통해 제안 후 수락된 코드 라인 수 |

### B-7. Code Review (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 27 | `CodeReview_SucceededEventCount` | bigint | 이슈 발견 후 수정 제안 생성 성공 수 |
| 28 | `CodeReview_FailedEventCount` | bigint | 이슈 발견했으나 수정 제안 생성 실패 수 |
| 29 | `CodeReview_FindingsCount` | bigint | Kiro 코드 리뷰로 발견된 이슈 총 수 |

### B-8. Test Generation — `/test` 명령 (5개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 30 | `TestGeneration_EventCount` | bigint | `/test` 명령 사용 이벤트 수 |
| 31 | `TestGeneration_GeneratedTests` | bigint | Kiro가 `/test` 명령으로 제안한 단위 테스트 수 |
| 32 | `TestGeneration_GeneratedLines` | bigint | Kiro가 `/test` 명령으로 제안한 테스트 코드 라인 수 |
| 33 | `TestGeneration_AcceptedTests` | bigint | `/test` 명령으로 제안 후 수락된 단위 테스트 수 |
| 34 | `TestGeneration_AcceptedLines` | bigint | `/test` 명령으로 제안 후 수락된 테스트 코드 라인 수 |

### B-9. Doc Generation — `/doc` 명령 (9개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 35 | `DocGeneration_EventCount` | bigint | `/doc` 명령 사용 이벤트 수 |
| 36 | `DocGeneration_AcceptedFilesCreations` | bigint | `/doc` 명령으로 제안 후 수락된 파일 생성 수 |
| 37 | `DocGeneration_AcceptedFileUpdates` | bigint | `/doc` 명령으로 제안 후 수락된 파일 업데이트 수 |
| 38 | `DocGeneration_AcceptedLineAdditions` | bigint | `/doc` 명령으로 제안 후 수락된 문서 추가 라인 수 |
| 39 | `DocGeneration_AcceptedLineUpdates` | bigint | `/doc` 명령으로 제안 후 수락된 문서 업데이트 라인 수 |
| 40 | `DocGeneration_RejectedFileCreations` | bigint | `/doc` 명령으로 제안 후 거부된 파일 생성 수 |
| 41 | `DocGeneration_RejectedFileUpdates` | bigint | `/doc` 명령으로 제안 후 거부된 파일 업데이트 수 |
| 42 | `DocGeneration_RejectedLineAdditions` | bigint | `/doc` 명령으로 제안 후 거부된 문서 추가 라인 수 |
| 43 | `DocGeneration_RejectedLineUpdates` | bigint | `/doc` 명령으로 제안 후 거부된 문서 업데이트 라인 수 |

### B-10. Transformation — `/transform` 명령 (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 44 | `Transformation_EventCount` | bigint | `/transform` 명령 사용 이벤트 수 (CLI 제외) |
| 45 | `Transformation_LinesGenerated` | bigint | Kiro가 `/transform` 명령으로 제안한 코드 라인 수 (CLI 제외) |
| 46 | `Transformation_LinesIngested` | bigint | 변환을 위해 Kiro에 제공된 코드 라인 수 (CLI, SQL 변환 제외) |

---

## B-0. ⚠️ 실데이터 검증 결과 — 레거시 리포트 컬럼 중 39개가 항상 0

**2026-07-29, 계정 120443221648의 `by_user_analytic` CSV 202개(541행, 2025-12-01~2026-07-27) 전수 파싱 결과:**
전체 46개 컬럼 = 식별 컬럼 2개(`UserId`, `Date`) + **메트릭 컬럼 44개**.
이 **메트릭 44개 중 5개만 값이 존재하고, 나머지 39개는 전 기간 모든 행에서 문자열 `0`** 입니다.
(파일 수·행 수는 S3 객체 목록으로 재확인했습니다: `.csv` 객체 정확히 202개.)

| 값이 존재하는 컬럼 | 0이 아닌 행 수 |
|-------------------|--------------|
| `Inline_SuggestionsCount` | 333 |
| `Chat_MessagesSent` | 325 |
| `Inline_AICodeLines` | 307 |
| `Inline_AcceptanceCount` | 307 |
| `Chat_AICodeLines` | 49 |

즉 `InlineChat_*`(10개), `Dev_*`(4개), `CodeFix_*`(4개), `CodeReview_*`(3개), `TestGeneration_*`(5개), `DocGeneration_*`(9개), `Transformation_*`(3개), `Chat_MessagesInteracted` 는 **현재 이 계정에서 전부 0**입니다.

**이것이 §C-1 "미사용 컬럼" 목록의 실제 의미입니다:** 해당 컬럼들이 구현되지 않은 이유는 단순 누락이 아니라, **표시할 값이 없기 때문**일 가능성이 높습니다.
따라서 이 컬럼들을 쓰는 신규 기능(Dev Agent 수락률, 코드 리뷰 루프, 인라인 챗 거부/방치 분석 등)은
**착수 전에 반드시 아래 쿼리로 값 존재를 먼저 확인**해야 합니다. 그렇지 않으면 0만 렌더링하는 페이지가 됩니다.

```sql
-- 신규 기능 착수 전 필수 확인: 대상 컬럼에 값이 있는가?
SELECT SUM(CAST(dev_generatedlines AS BIGINT))      AS dev_lines,
       SUM(CAST(codereview_findingscount AS BIGINT)) AS cr_findings,
       SUM(CAST(inlinechat_totaleventcount AS BIGINT)) AS ic_events,
       COUNT(*) AS rows
FROM by_user_analytic;
```

> **0인 이유(추정):** 공식 문서가 이 리포트를 "CLI and plugin usage only"로 규정하는 점과 일치합니다.
> `/dev`, `/doc`, `/transform`, 코드 리뷰, 테스트 생성은 IDE 기능이므로, CLI 전용 리포트에서 0으로 나오는 것이 설명됩니다.
> 값이 있는 5개 컬럼은 모두 CLI에서도 발생하는 채팅·인라인 계열입니다.

### B-0b. `user_report` 컬럼 카디널리티 (동일 검증, 214개 파일 / 323행 / 11명)

| 컬럼 | 실측값 | 신규 기능 설계에 주는 함의 |
|------|--------|------------------------|
| `Subscription_Tier` | `POWER` 100% | **티어 비교·티어별 분석 기능은 이 계정에서 무의미** (카디널리티 1) |
| `Overage_Enabled` | `true` 321 / `TRUE` 2 (`false` 0건) | 대소문자 혼재 → 반드시 `LOWER()` 필요. `false` 행이 없어 §A-1의 "플랜 포함 크레딧" 역산은 **현재 불가** |
| `Overage_Cap` | `10000.0` 100% | 관리자 설정 한도이며 플랜 포함량이 아님 |
| `Overage_Credits_Used` | `0.0` 100% | 초과 크레딧 관련 신규 기능은 **전부 0으로 렌더링됨** |
| `ProfileId` | 단일 ARN 100% | 프로필별 분리·차지백 기능은 1행 테이블이 됨 |
| `New_User` | `true` **1건** / `false` 186 / 컬럼 없음 136 | **코호트 분석 불가** — 전체 기간에 활성화 이벤트가 단 1건(2026-06-12, KIRO_CLI)이므로 코호트 표는 100% 셀 하나가 됩니다. 헤더 자체도 214개 파일 중 118개에만 존재 |
| `User_Email` | 값 있음 129행 / **컬럼 자체가 없는 행 194** (빈 문자열은 0건) | 후행 추가 컬럼이라 과거 파일에는 헤더가 없음. 값이 있는 행은 모두 채워져 있으나, 60%의 행에서 조회 불가하므로 정책이 바뀌어도 **신원 대체 수단으로는 부적합** |
| `Client_Type` | `KIRO_CLI` 229 / `KIRO_IDE` 94 (`PLUGIN` 0) | **유일하게 의미 있는 세그먼트 축** |

---

## C. 컬럼 → 소비 라우트 역참조

| 컬럼 그룹 | 소비 API 라우트 |
|-----------|----------------|
| §A-1 고정 컬럼 | `/api/metrics`, `/api/trends`, `/api/users`, `/api/user-detail`, `/api/credits`, `/api/subscription`, `/api/engagement`, `/api/client-dist` (Athena) |
| §A-1b `New_User` | `/api/adoption` (S3 직접 읽기) |
| §A-1b `User_Email` | 없음 (의도적 미사용 — ADR-0004) |
| §A-2 동적 모델 컬럼 | `/api/model-usage` (S3 직접 읽기, `endsWith('_messages')` 헤더 매칭) |
| §B 레거시 컬럼 | `/api/productivity`, `/api/dev-activity` (Athena) |

### C-1. 문서화되었으나 현재 미사용인 컬럼

아래 컬럼들은 리포트에 존재하지만 어떤 페이지/API도 조회하지 않습니다.
**단, §B-0에서 확인했듯 이 중 `by_user_analytic` 컬럼은 현재 계정에서 전부 값이 0입니다** — "바로 쓸 수 있는 재고"가 아니라 "값이 채워지면 쓸 수 있는 후보"로 읽어야 합니다.

| 컬럼 | 미사용 사유 / 활용 가능성 |
|------|------------------------|
| `ProfileId` (§A-1) | `/api/analyze` 시스템 프롬프트에만 언급. 다중 프로필 환경에서 프로필별 분리 분석에 사용 가능 |
| `Chat_MessagesInteracted` (§B-2) | Kiro의 유일한 **긍정적 상호작용** 신호인데 어디에도 노출되지 않음 — 품질 지표로 가치 높음 |
| `Dev_GeneratedLines`, `Dev_AcceptanceEventCount` (§B-5) | 미사용으로 인해 **Dev Agent 수락률을 계산할 수 없음** |
| `CodeFix_AcceptanceEventCount` (§B-6) | CodeFix는 라인 수만 사용, 이벤트 기준 수락률 없음 |
| `CodeReview_SucceededEventCount`, `CodeReview_FailedEventCount` (§B-7) | `findingscount`만 노출 — 코드 리뷰 **성공/실패율 전체가 미보고** |
| `InlineChat_RejectionEventCount`, `InlineChat_DismissalEventCount` (§B-4) | 수락률을 라인 수로만 산출 — 거부/무시 이벤트 기반 분석 불가 |
| `InlineChat_*LineDeletions` 3개 (§B-4) | 라인 **삭제** 카운터 전체 미사용 (추가 라인만 집계) |
| `DocGeneration_*File*` 4개, `*LineUpdates` 2개 (§B-9) | DocGen은 라인 추가만 집계 — 파일 단위 및 **업데이트 라인이 총계에서 누락** |
| `Transformation_LinesIngested` (§B-10) | 미사용으로 인해 변환 **증폭률(생성/투입)** 계산 불가 |

---

## 참고

- 출처: [Kiro 공식 문서 - User activity report metrics](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/#user-activity-report-metrics)
- 관련 공식 문서 4종 전체 목록은 README의 "참고 문서" / "Reference Documentation" 섹션 참고
- `user_report`는 공식 문서에서 "User activity report metrics"로 분류
- `by_user_analytic`는 공식 문서에서 "Old user activity report metrics"로 분류
- 두 리포트는 `UserId` + `Date`로 JOIN하여 통합 분석 가능
- 공식 문서의 논리적 타입(Integer, Boolean)과 실제 CSV/Glue 타입(string, double)은 상이할 수 있음
- 공식 문서의 메트릭 표에는 **타입 컬럼이 없습니다** (`Metric name` / `Description` 2열). 이 문서의 타입은 실제 CSV/Glue 관찰값 기반 주석입니다
- 공식 문서 자체의 결함 3건(파서 요구사항): 프롬프트 로깅 문서는 `records`를 Object로 기술하면서 예시는 배열로 보여주고, 리스트인 `followupPrompts`를 `String`으로 타이핑하며, 활동 리포트 문서는 레거시 컬럼의 표 제목을 "Old user activity report metrics"와 "User activity report metrics" 로 엇갈리게 씁니다. 파서는 이 불일치를 허용해야 합니다

---

## D. 프롬프트 로깅 — 이미 활성화되어 있음 (미소비)

**프롬프트 로깅**(`https://kiro.dev/docs/cli/enterprise/monitor-and-track/prompt-logging/`)은 위 CSV 리포트와 **완전히 별개인 옵트인 기능**입니다.
**중요: "대시보드가 사용하지 않는다"는 것과 "데이터가 없다"는 것은 다릅니다 — 본 계정에서는 이미 적재되고 있습니다.**

| 항목 | 실측값 (2026-07-29) |
|------|--------------------|
| 버킷 / 프리픽스 | `s3://whchoi01-titan-q-prompt/q-prompt-logging/` (UAR 버킷과 분리 — 바람직) |
| 객체 수 | **188,427개** |
| 적재 기간 | 2025-07-24 ~ 2026-07-29 (계속 적재 중) |
| 이벤트 타입 | `GenerateAssistantResponse` 89,565 / `GenerateCompletions` 98,856 |
| 파일 형식 | `.json.gz` (객체당 레코드 1개가 대부분) |
| 소비 코드 | **없음** — 저장소 전체에서 이 버킷을 읽는 코드가 없습니다 |

관측된 키 구조 (공식 문서는 키 구조·주기·보존을 **전혀 정의하지 않음**):

```
q-prompt-logging/AWSLogs/<account>/<logGroup>/<EventType>/<region>/YYYY/MM/DD/HH/<account>_<EventType>_<ts>_<rand>.json.gz
```

> **⚠️ `<logGroup>` 세그먼트가 도중에 바뀌었습니다.** UAR과 달리 이 값은 `KiroLogs` 고정이 아닙니다:
> - `QDeveloperLogs` — 75,759개, 2025-07-24 ~ **2025-12-10** (구 경로, 종료됨)
> - `KiroLogs` — 112,662개, 2025-11-25 ~ 2026-07-28 (현행)
>
> 리브랜딩 시점에 경로가 전환되며 약 2주간 병존했습니다. **`KiroLogs`만 하드코딩하면 2025-12-10 이전 이력 40%를 놓칩니다.**
> 또한 `HH`는 UAR의 고정 `00`과 달리 **실제 시각 파티션**이며, `KiroLogs/` 루트에 `.json.gz`가 아닌 접근 검증용 객체 6개가 섞여 있으므로 확장자 필터가 필요합니다.

레코드 필드 (표본 검증):

- `generateAssistantResponseEventRequest`: `prompt`, `chatTriggerType`, `userId`, `timeStamp`, **`modelId`**
- `generateAssistantResponseEventResponse`: `assistantResponse`
- `modelId`는 **공식 문서에 없는 필드**이지만 관측 표본 전체에 존재하며(`auto`, `claude-opus-4.8`, `claude-opus-4.6/4.7`, `simple-task`, `gpt-5.6-sol`, `qwen3-coder-next`, `claude-sonnet-4` 등 9종 이상), UAR의 `{model}_messages` 컬럼보다 촘촘한 모델 사용 신호입니다
- ⚠️ `prompt`가 **빈 값인 레코드가 약 76%** 입니다 (전 기간 균등 표본 230건 중 비어 있지 않은 것 55건 = 23.9%). 에이전트 연속 턴은 `prompt` 없이 `assistantResponse`만 담기 때문입니다. **프롬프트 텍스트 기반 분석은 전체 활동의 약 1/4만 대표하므로 이 커버리지를 화면에 명시해야 합니다**
- `messageMetadata.conversationId`는 관측 표본에서 **0건** 채워졌고 `chatTriggerType`은 100% `MANUAL` 입니다 — 즉 **대화 단위(멀티턴) 분석과 수동/인라인 구분은 성립하지 않습니다.** 공식 문서에 나오는 `followupPrompts` / `codeReferenceEvents` / `supplementaryWebLinksEvent` / `customizationArn` 도 모두 미채움

> **🔒 개인정보 주의:** 이 버킷에는 **사용자 프롬프트 원문과 코드 컨텍스트가 평문(gzip)으로** 들어 있습니다.
> UAR의 `lib/mask.ts` 마스킹은 여기에 적용되지 않으며, 보존 기간 라이프사이클 규칙도 설정되어 있지 않습니다.
> 이 데이터를 대시보드에 노출하는 기능은 라우트 단위 접근 통제를 먼저 설계해야 합니다.
