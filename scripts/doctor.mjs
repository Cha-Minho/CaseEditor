import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredFiles = [
  "index.html",
  "package.json",
  "vercel.json",
  "netlify.toml",
  "public/manifest.webmanifest",
  "public/sw.js",
  "src/main.tsx",
  "src/App.tsx",
  "src/lib/supabase.ts",
  "src/lib/sync.ts",
  "supabase/config.toml",
  "supabase/migrations/0001_initial_schema.sql",
  "supabase/functions/law-case/index.ts",
  ".env.example"
];

const requiredEnvKeys = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
const requiredSqlSnippets = [
  "create table if not exists public.topics",
  "create table if not exists public.cases",
  "create table if not exists public.case_notes",
  "create table if not exists public.user_ui_state",
  "enable row level security",
  "auth.uid() = user_id",
  "alter publication supabase_realtime add table"
];
const requiredEdgeSnippets = ["LAW_API_OC", "lawSearch.do", "caseNo"];

const failures = [];

function pathFor(file) {
  return join(root, file);
}

function read(file) {
  return readFileSync(pathFor(file), "utf8");
}

for (const file of requiredFiles) {
  if (!existsSync(pathFor(file))) failures.push(`필수 파일 없음: ${file}`);
}

if (existsSync(pathFor(".env.example"))) {
  const envExample = read(".env.example");
  for (const key of requiredEnvKeys) {
    if (!envExample.includes(key)) failures.push(`.env.example에 ${key} 없음`);
  }
}

if (existsSync(pathFor("supabase/migrations/0001_initial_schema.sql"))) {
  const sql = read("supabase/migrations/0001_initial_schema.sql").toLowerCase();
  for (const snippet of requiredSqlSnippets) {
    if (!sql.includes(snippet)) failures.push(`Supabase migration 점검 실패: ${snippet}`);
  }
}

if (existsSync(pathFor("supabase/functions/law-case/index.ts"))) {
  const edgeFunction = read("supabase/functions/law-case/index.ts");
  for (const snippet of requiredEdgeSnippets) {
    if (!edgeFunction.includes(snippet)) failures.push(`Edge Function 점검 실패: ${snippet}`);
  }
}

if (existsSync(pathFor("package.json"))) {
  const pkg = JSON.parse(read("package.json"));
  for (const script of ["dev", "typecheck", "build", "preview"]) {
    if (!pkg.scripts?.[script]) failures.push(`package.json scripts.${script} 없음`);
  }
}

if (failures.length > 0) {
  console.error("배포 전 점검 실패");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("배포 전 점검 통과");
