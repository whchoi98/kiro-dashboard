# Kiro User Activity Report 전체 스키마

> 출처: [Kiro 공식 문서 - Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/)
> S3 버킷: `s3://whchoi01-titan-q-log/q-user-log/`
> AWS 계정: 120443221648

---

## 리포트 개요

| 구분 | 신규 `user_report` | 레거시 `by_user_analytic` |
|------|-------------------|--------------------------|
| 관점 | 비용/라이선스 관리 | 개발자 생산성 |
| 컬럼 수 | 11개 | 46개 |
| S3 경로 | `.../KiroLogs/user_report/us-east-1/` | `.../KiroLogs/by_user_analytic/us-east-1/` |
| 파일명 | `{CLIENT_TYPE}_120443221648_user_report_{ts}.csv` | `120443221648_by_user_analytic_{ts}_report.csv` |
| 파일 분리 | 클라이언트별 분리 (KIRO_CLI, KIRO_IDE) | 통합 파일 |
| 날짜 형식 | `YYYY-MM-DD` | `MM-DD-YYYY` |
| 데이터 기간 | 2026-02 ~ | 2025-12 ~ |
| JOIN 키 | `UserId` + `Date` 로 양쪽 조인 가능 ||

---

## A. 신규 리포트: `user_report` — 크레딧/구독 관리 (11개 컬럼)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 1 | `Date` | string | 활동 날짜 (YYYY-MM-DD) |
| 2 | `UserId` | string | 사용자 ID (UUID) |
| 3 | `Client_Type` | string | `KIRO_IDE`, `KIRO_CLI`, `PLUGIN` |
| 4 | `Chat_Conversations` | integer | 당일 대화 수 |
| 5 | `Credits_Used` | double | 당일 소비 크레딧 |
| 6 | `Overage_Cap` | double | 관리자 설정 초과 한도 (미설정 시 플랜 최대값) |
| 7 | `Overage_Credits_Used` | double | 초과 사용 크레딧 |
| 8 | `Overage_Enabled` | string | 초과 사용 활성화 여부 (true/false) |
| 9 | `ProfileId` | string | Kiro 프로필 ARN |
| 10 | `Subscription_Tier` | string | `Pro`, `ProPlus`, `Power` |
| 11 | `Total_Messages` | integer | 총 메시지 수 (프롬프트 + 툴콜 + 응답) |

---

## B. 레거시 리포트: `by_user_analytic` — IDE 생산성 메트릭 (46개 컬럼)

### B-1. 기본 식별 (2개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 1 | `UserId` | string | 사용자 ID (UUID) |
| 2 | `Date` | string | 활동 날짜 (MM-DD-YYYY 형식) |

### B-2. Chat (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 3 | `Chat_AICodeLines` | bigint | Chat에서 생성되어 사용자가 수락한 코드 라인 수. IDE에 삽입된 코드만 포함 (인라인 챗 제외) |
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
| 20 | `Dev_GeneratedLines` | bigint | `/dev` 명령으로 생성된 코드 라인 수 |
| 21 | `Dev_AcceptanceEventCount` | bigint | `/dev` 명령으로 생성된 코드 중 수락 이벤트 수 |
| 22 | `Dev_AcceptedLines` | bigint | `/dev` 명령으로 생성된 코드 중 수락된 라인 수 |

### B-6. Code Fix — 코드 리뷰 기반 수정 (4개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 23 | `CodeFix_GenerationEventCount` | bigint | 코드 리뷰에서 수정 제안 이벤트 수 |
| 24 | `CodeFix_GeneratedLines` | bigint | 코드 리뷰에서 생성된 수정 라인 수 |
| 25 | `CodeFix_AcceptanceEventCount` | bigint | 코드 리뷰 수정 중 수락 이벤트 수 |
| 26 | `CodeFix_AcceptedLines` | bigint | 코드 리뷰 수정 중 수락된 라인 수 |

### B-7. Code Review (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 27 | `CodeReview_SucceededEventCount` | bigint | 이슈 발견 후 수정 제안 성공 수 |
| 28 | `CodeReview_FailedEventCount` | bigint | 이슈 발견했으나 수정 제안 실패 수 |
| 29 | `CodeReview_FindingsCount` | bigint | 코드 리뷰로 발견된 이슈 총 수 |

### B-8. Test Generation — `/test` 명령 (5개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 30 | `TestGeneration_EventCount` | bigint | `/test` 명령 사용 이벤트 수 |
| 31 | `TestGeneration_GeneratedTests` | bigint | 생성된 단위 테스트 수 |
| 32 | `TestGeneration_GeneratedLines` | bigint | 생성된 테스트 코드 라인 수 |
| 33 | `TestGeneration_AcceptedTests` | bigint | 수락된 단위 테스트 수 |
| 34 | `TestGeneration_AcceptedLines` | bigint | 수락된 테스트 코드 라인 수 |

### B-9. Doc Generation — `/doc` 명령 (9개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 35 | `DocGeneration_EventCount` | bigint | `/doc` 명령 사용 이벤트 수 |
| 36 | `DocGeneration_AcceptedFilesCreations` | bigint | 수락된 파일 생성 수 |
| 37 | `DocGeneration_AcceptedFileUpdates` | bigint | 수락된 파일 업데이트 수 |
| 38 | `DocGeneration_AcceptedLineAdditions` | bigint | 수락된 문서 추가 라인 수 |
| 39 | `DocGeneration_AcceptedLineUpdates` | bigint | 수락된 문서 업데이트 라인 수 |
| 40 | `DocGeneration_RejectedFileCreations` | bigint | 거부된 파일 생성 수 |
| 41 | `DocGeneration_RejectedFileUpdates` | bigint | 거부된 파일 업데이트 수 |
| 42 | `DocGeneration_RejectedLineAdditions` | bigint | 거부된 문서 추가 라인 수 |
| 43 | `DocGeneration_RejectedLineUpdates` | bigint | 거부된 문서 업데이트 라인 수 |

### B-10. Transformation — `/transform` 명령 (3개)

| # | 컬럼 | 타입 | 설명 |
|---|------|------|------|
| 44 | `Transformation_EventCount` | bigint | `/transform` 명령 사용 이벤트 수 (CLI 제외) |
| 45 | `Transformation_LinesGenerated` | bigint | 변환으로 생성된 코드 라인 수 (CLI 제외) |
| 46 | `Transformation_LinesIngested` | bigint | 변환을 위해 입력된 코드 라인 수 (CLI, SQL 변환 제외) |

---

## 참고

- 출처: [Kiro 공식 문서 - Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/)
- `user_report`는 공식 문서에서 "User activity report metrics"로 분류
- `by_user_analytic`는 공식 문서에서 "Old user activity report metrics"로 분류
- 두 리포트는 `UserId` + `Date`로 JOIN하여 통합 분석 가능
