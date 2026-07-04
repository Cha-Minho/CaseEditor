# 배포 메모

이 앱은 웹앱/PWA로 먼저 배포하고, 같은 주소를 PC와 폰에서 로그인해서 쓰는 구조입니다.

## 1. Supabase 만들기

배포 전에 로컬에서 한 번 점검합니다.

```bash
npm run doctor
npm run build
```

1. Supabase 프로젝트를 새로 만듭니다.
2. SQL Editor에서 `supabase/migrations/0001_initial_schema.sql` 내용을 실행합니다.
3. Authentication에서 Email 로그인을 켭니다.
4. Project Settings에서 `Project URL`과 `anon public key`를 복사합니다.

마이그레이션은 Realtime publication도 같이 설정합니다. 그래서 PC에서 저장한 내용이 폰 화면에 열려 있으면 자동으로 내려옵니다.

## 2. 국가법령정보 API 연결

Edge Function은 앱과 국가법령정보 API 사이에 두는 작은 서버 함수입니다. 브라우저에 국가법령정보 API 키를 직접 넣으면 누구나 키를 볼 수 있으므로, 프론트엔드는 사건번호만 보내고 Edge Function이 `LAW_API_OC` 비밀값으로 law.go.kr에 요청합니다.

이 함수가 없더라도 로그인, 저장, PC/폰 동기화, 빈 판례 작성은 동작합니다. 다만 사건번호로 판례를 불러오는 기능은 실패합니다.

### OC 값 발급받기

1. [국가법령정보 공동활용](https://open.law.go.kr) 사이트에 회원가입합니다.
2. `OPEN API 신청`에서 판례 목록/본문 조회 API 활용을 신청합니다.
3. OC 값은 가입한 이메일의 @ 앞부분(아이디)입니다. 예: `ckalsgh56@gmail.com`이면 `ckalsgh56`.

### Edge Function 배포와 키 설정

[Supabase CLI](https://supabase.com/docs/guides/cli)로 함수를 배포하고 비밀값을 넣습니다.

```bash
supabase login
supabase link --project-ref 프로젝트_REF
supabase functions deploy law-case
supabase secrets set LAW_API_OC=발급받은_OC값
```

CLI 없이 하려면 Supabase 대시보드에서:

1. `Edge Functions` 메뉴에서 `law-case` 함수를 만들고 `supabase/functions/law-case/index.ts` 내용을 붙여넣어 배포합니다.
2. `Edge Functions` → `Secrets`(또는 Project Settings → Edge Functions)에서 `LAW_API_OC` 키에 OC 값을 넣습니다.

함수 코드를 수정했다면 다시 배포해야 반영됩니다.

## 3. Vercel 배포

1. Vercel에서 GitHub 저장소 `Cha-Minho/CaseEditor`를 Import합니다.
2. Framework Preset은 Vite로 둡니다.
3. Environment Variables에 아래 값을 넣습니다.

```bash
VITE_SUPABASE_URL=Supabase Project URL
VITE_SUPABASE_ANON_KEY=Supabase anon public key
```

4. Deploy를 누릅니다.
5. 배포 주소를 Supabase Authentication의 Site URL과 Redirect URL에 추가합니다.
   - 예: `https://내앱주소.vercel.app`
   - 회원가입 확인 메일을 누르면 이 주소로 돌아옵니다.

## 4. Netlify 배포

Netlify를 쓴다면 저장소를 연결하고 같은 환경변수 두 개를 넣으면 됩니다. `netlify.toml`이 SPA 라우팅을 처리합니다.

## 5. 폰에서 쓰기

1. 폰 브라우저에서 배포 주소를 엽니다.
2. 같은 이메일 계정으로 로그인합니다.
3. 브라우저 메뉴에서 홈 화면에 추가하면 앱처럼 열립니다.

처음에는 Supabase 설정 없이 로컬 모드로 쓰다가 나중에 로그인해도 됩니다. 계정에 아직 데이터가 없으면 로컬에 있던 판례와 목차가 자동으로 현재 계정 데이터로 복사되고, 온라인 상태가 되면 Supabase로 동기화됩니다.

로그인하면 사이드바 하단에 계정 이메일이 표시되고, 저장 내용은 자동으로 계정과 동기화됩니다.

## 6. 기존 데이터 옮기기

1. 기존 HTML 앱에서 JSON을 저장합니다.
2. 새 앱 사이드바 하단의 `JSON 가져오기`를 누릅니다.
3. 파일을 선택하고 확인창의 판례 수와 목차 수를 확인합니다.
4. 확인을 누르면 현재 계정 데이터로 추가됩니다.
