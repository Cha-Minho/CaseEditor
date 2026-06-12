# 배포 메모

이 앱은 웹앱/PWA로 먼저 배포하고, 같은 주소를 PC와 폰에서 로그인해서 쓰는 구조입니다.

## 1. Supabase 만들기

1. Supabase 프로젝트를 새로 만듭니다.
2. SQL Editor에서 `supabase/migrations/0001_initial_schema.sql` 내용을 실행합니다.
3. Authentication에서 Email 로그인을 켭니다.
4. Project Settings에서 `Project URL`과 `anon public key`를 복사합니다.

마이그레이션은 Realtime publication도 같이 설정합니다. 그래서 PC에서 저장한 내용이 폰 화면에 열려 있으면 자동으로 내려옵니다.

## 2. 국가법령정보 API 연결

Supabase Edge Function을 배포한 뒤 환경변수에 API 값을 넣습니다.

```bash
supabase functions deploy law-case
supabase secrets set LAW_API_OC=발급받은_OC값
```

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

앱의 왼쪽 도구막대에는 현재 상태가 표시됩니다. `계정`, `온라인`, `계정에 저장됨`이 보이면 PC와 폰 사이 동기화가 가능한 상태입니다.
더 자세한 확인은 도구막대의 `상태` 패널에서 볼 수 있습니다.

## 6. 기존 데이터 옮기기

1. 기존 HTML 앱에서 JSON을 저장합니다.
2. 새 앱에서 `JSON` 패널을 엽니다.
3. 파일을 선택하고 미리보기의 판례 수와 목차 수를 확인합니다.
4. 가져오기를 누르면 현재 계정 데이터로 추가됩니다.
