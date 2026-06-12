# 판례 정리함

판례 원문, 판시사항, 주요 문구, 결론 요약, 다수의견/반대의견을 목차별로 정리하는 개인용 PWA 웹앱입니다.

## 현재 구조

- `Vite + React + TypeScript` 프론트엔드
- `IndexedDB` 로컬 우선 저장
- `Supabase Auth + Postgres` 계정 기반 동기화
- `Supabase Edge Function`을 통한 국가법령정보 API 호출
- 기존 단일 HTML 앱의 JSON 파일 가져오기 지원

## 실행

```bash
npm install
npm run dev
```

Supabase를 연결하려면 `.env`에 다음 값을 넣습니다.

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

설정값이 없으면 앱은 로컬 전용 모드로 실행됩니다.

## Supabase

1. `supabase/migrations/0001_initial_schema.sql`을 적용합니다.
2. `supabase/functions/law-case` Edge Function을 배포합니다.
3. Edge Function 환경변수 `LAW_API_OC`에 국가법령정보 API OC 값을 저장합니다.

## 기존 파일

`case-notes-organizer-api-v6.html`은 이전 단일 HTML 버전으로 보관되어 있습니다.
