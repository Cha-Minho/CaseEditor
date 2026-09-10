import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const kinds = ["contract", "money", "security", "dispute", "status", "notice", "statement", "other"];
const statuses = ["recognized", "alleged", "disputed", "procedural"];
const effects = ["own", "sale", "lien", "poss", "seize"];

const stringSchema = { type: "STRING" };
const nullableStringSchema = { type: "STRING", nullable: true };
const responseSchema = {
  type: "OBJECT",
  required: ["parties", "objects", "relations", "events"],
  properties: {
    parties: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "name"], properties: { id: stringSchema, name: stringSchema, role: nullableStringSchema } } },
    objects: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "name"], properties: { id: stringSchema, name: stringSchema, ownerId: nullableStringSchema, possessorId: nullableStringSchema } } },
    relations: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "from", "to", "label", "kind", "sequence", "evidence", "status", "confidence"], properties: {
      id: stringSchema, from: stringSchema, to: stringSchema, label: stringSchema,
      kind: { type: "STRING", enum: kinds }, sequence: { type: "INTEGER", minimum: 1 }, date: nullableStringSchema, objectId: nullableStringSchema,
      effect: { type: "STRING", enum: effects, nullable: true }, evidence: stringSchema,
      status: { type: "STRING", enum: statuses }, confidence: { type: "NUMBER", minimum: 0, maximum: 1 }
    } } },
    events: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "sequence", "text", "evidence"], properties: { id: stringSchema, sequence: { type: "INTEGER", minimum: 1 }, date: nullableStringSchema, text: stringSchema, evidence: stringSchema } } }
  }
};

function cleanString(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAuthority(party?: { name: string; role?: string }) {
  return Boolean(party && /경찰|검사|검찰|수사기관|수사관/.test(`${party.name} ${party.role || ""}`));
}

async function hasSignedInUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anonKey) return false;
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return !error && Boolean(data.user);
}

function validateGraph(value: Record<string, unknown>) {
  const rawParties = Array.isArray(value.parties) ? value.parties : [];
  const rawObjects = Array.isArray(value.objects) ? value.objects : [];
  const parties = rawParties.slice(0, 30).map((item: Record<string, unknown>, index: number) => ({
    id: cleanString(item.id, 60) || `p${index + 1}`,
    name: cleanString(item.name, 100) || `당사자 ${index + 1}`,
    ...(cleanString(item.role, 100) ? { role: cleanString(item.role, 100) } : {})
  }));
  const partyIds = new Set(parties.map((item) => item.id));
  const objects = rawObjects.slice(0, 20).map((item: Record<string, unknown>, index: number) => ({
    id: cleanString(item.id, 60) || `o${index + 1}`,
    name: cleanString(item.name, 120) || `목적물 ${index + 1}`,
    ...(partyIds.has(cleanString(item.ownerId)) ? { ownerId: cleanString(item.ownerId, 60) } : {}),
    ...(partyIds.has(cleanString(item.possessorId)) ? { possessorId: cleanString(item.possessorId, 60) } : {})
  }));
  const entityIds = new Set([...parties.map((item) => item.id), ...objects.map((item) => item.id)]);
  const relations = (Array.isArray(value.relations) ? value.relations : [])
    .slice(0, 80)
    .map((item: Record<string, unknown>, index: number) => {
      let from = cleanString(item.from, 60);
      let to = cleanString(item.to, 60);
      const label = cleanString(item.label, 180);
      const evidence = cleanString(item.evidence, 500);
      const effect = effects.includes(cleanString(item.effect)) ? cleanString(item.effect) : "";
      const text = `${label} ${evidence}`;
      if (effect === "seize" || /압수/.test(label)) {
        const partyById = new Map(parties.map((party) => [party.id, party]));
        const authority = [from, to].find((id) => isAuthority(partyById.get(id)));
        const actor = [from, to].find((id) => {
          const name = partyById.get(id)?.name;
          return Boolean(name && new RegExp(`${escapeRegExp(name)}\\s*(?:이|가|은|는)[^.!?\\n]{0,100}압수(?:하|했|하여|한|함|받)`).test(text));
        });
        const recipient = authority || actor;
        if (recipient && recipient === from && recipient !== to) [from, to] = [to, from];
      }
      const rawKind = cleanString(item.kind);
      const kind = /자백|진술|증언|시인/.test(label) ? "statement" : kinds.includes(rawKind) ? rawKind : "other";
      return {
        id: cleanString(item.id, 60) || `r${index + 1}`,
        from, to, label, kind,
        sequence: Math.max(1, Math.round(Number(item.sequence) || index + 1)),
        ...(cleanString(item.date, 40) ? { date: cleanString(item.date, 40) } : {}),
        ...(entityIds.has(cleanString(item.objectId)) ? { objectId: cleanString(item.objectId, 60) } : {}),
        ...(effect ? { effect } : {}),
        evidence,
        status: statuses.includes(cleanString(item.status)) ? cleanString(item.status) : "recognized",
        confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0))
      };
    })
    .filter((item) => partyIds.has(item.from) && partyIds.has(item.to) && item.label && item.evidence);
  const events = (Array.isArray(value.events) ? value.events : []).slice(0, 80).map((item: Record<string, unknown>, index: number) => ({
    id: cleanString(item.id, 60) || `ev${index + 1}`,
    sequence: Math.max(1, Math.round(Number(item.sequence) || index + 1)),
    ...(cleanString(item.date, 40) ? { date: cleanString(item.date, 40) } : {}),
    text: cleanString(item.text, 300), evidence: cleanString(item.evidence, 500)
  })).filter((item) => item.text && item.evidence).sort((a, b) => a.sequence - b.sequence);
  const connectedParties = parties.filter((party) => relations.some((relation) => relation.from === party.id || relation.to === party.id));
  const connectedObjects = objects.filter((object) => relations.some((relation) => relation.objectId === object.id));
  return { parties: connectedParties.length ? connectedParties : parties, objects: connectedObjects, relations, events };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "POST 요청만 지원합니다." }, { status: 405, headers: corsHeaders });
  try {
    if (!await hasSignedInUser(request)) {
      return Response.json({ error: "로그인한 사용자만 AI 관계도를 만들 수 있습니다." }, { status: 401, headers: corsHeaders });
    }
    const body = await request.json();
    const caseText = cleanString(body.caseText, 300_000);
    if (!caseText) throw new Error("판례 원문이 필요합니다.");
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

    const prompt = `다음 공개 판결문에서 법률관계 그래프의 초안을 생성하라.
법원이 인정한 사실을 중심으로 하되 당사자의 주장, 원심 판단, 배척된 판단, 소송 경과를 status로 구분한다.
근거 없는 사실, 날짜, 관계를 추정하지 않는다. 동일 인물의 여러 호칭은 하나로 통합한다.
일반 법리 설명이나 인용 판례의 사실관계는 현재 사건의 사실관계에 넣지 않는다.
판결문에 써진 순서가 아니라 실제 발생 시간 순으로 events를 정렬하고 sequence를 1부터 부여한다. 각 relation에도 대응하는 사건 단계의 sequence를 반드시 넣는다.
두 명 이상의 당사자가 관련된 event는 반드시 같은 sequence의 relation으로도 만든다. 사건 목록에만 넣고 관계에서는 생략하지 않는다.
화살표 방향은 관계의 의미에 맞게 통일한다. 범행은 행위자에서 피해자로, 체포·신문·고지는 수사기관에서 상대방으로, 물건의 소유·점유 이전은 이전 보유자에서 새 보유자로 향하게 한다.
date는 해당 사실이 발생한 날짜다. 판결 선고일이나 인용 판례의 날짜를 사실 발생일로 사용하지 말고, 원문에 알 수 있는 날짜만 YYYY.MM.DD, YYYY.MM, YYYY 형식으로 넣는다.
즉시, 그 후, 다음날, 제출하였다, 압수하였다 같은 서술상 인과관계는 날짜가 없어도 sequence에 반영한다. 예를 들어 범행으로 생성된 물건을 수사기관에 임의제출한 사실은 해당 범행들보다 뒤에 둔다.
관계에 시점이 표시되었다면 relation.date에도 같은 발생일을 넣는다. 사실관계 관계선이 하나도 없는 기관이나 소송관계인은 parties에서 뺀다.
현재 사건에서 실제로 이루어진 조사, 진술, 자백, 시인, 증언, 진술거부권 고지는 증거 흐름을 이해하는 데 중요하므로 빠뜨리지 않는다. 단순한 일반 법리 설명 속 자백·진술·증언은 제외한다.
자백·진술·시인은 말한 사람에서 이를 들은 수사관·검사·법원으로 향하는 statement 관계로 만든다. 증언은 증인에서 법원으로 향하는 statement 관계로 만들고, 진술거부권 고지는 고지한 수사기관에서 고지받은 사람으로 향하는 notice 관계로 만든다.
익명 처리된 경찰관·검사·법원도 이러한 관계의 상대방이면 parties에 포함하고 role에 경찰관, 검사, 법원 등 원문에서 확인되는 역할을 적는다.
특히 이름이 공소외인 1, 공소외 2처럼 익명이어도 원문에서 경찰관, 수사관, 검사, 판사 등의 신분이 확인되면 name은 원문 이름을 유지하고 role에는 그 신분을 반드시 적는다.
모든 relation과 event에는 판결문에서 그대로 가져온 짧은 evidence를 넣는다.
from과 to는 반드시 parties의 id를 사용하고 objectId는 objects의 id를 사용한다.
목적물의 최초 소유자가 원문에 나오면 object.ownerId에, 최초 점유자가 별도로 나오면 object.possessorId에 parties의 id를 넣는다.
relation.effect의 own은 매매, 증여, 상속, 소유권이전등기처럼 소유권이 실제로 relation.to에게 이전되는 경우에만 쓴다.
"피고인 소유 휴대전화"처럼 기존 소유자를 설명하거나, 휴대전화를 임의제출·압수·보관·교부한 사실에는 own을 쓰지 않는다.
강제처분인 압수로 수사기관이 물건을 확보한 관계에는 effect를 seize로 쓴다. 압수 관계의 from은 압수당해 물건을 잃은 사람, to는 물건을 확보한 수사기관으로 두어 화살표가 피압수자에서 압수 주체로 향하게 한다.
임의제출·보관·교부 등 그 밖의 물리적 지배 이동에는 poss를 쓰며 relation.to는 새 점유자로 둔다. "임의제출받아 압수"처럼 최종적으로 압수 상태가 된 경우는 seize를 쓴다.
압수수색영장 자체는 소유·점유를 표시할 목적물이 아니다. 영장의 발부·제시·집행이 사실관계상 중요하면 relation으로만 표현하고 영장에 ownerId, possessorId 또는 재산상 effect를 붙이지 않는다.

판결문:\n${caseText}`;
    const requestBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema }
    });
    let geminiResponse: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: requestBody
      });
      if (![429, 503].includes(geminiResponse.status) || attempt === 2) break;
      await geminiResponse.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
    }
    if (!geminiResponse) throw new Error("Gemini API에 연결하지 못했습니다.");
    const geminiBody = await geminiResponse.json();
    if (!geminiResponse.ok) {
      const message = cleanString(geminiBody?.error?.message, 500) || `Gemini API 오류 (${geminiResponse.status})`;
      return Response.json({ error: message }, { status: geminiResponse.status, headers: corsHeaders });
    }
    const output = geminiBody?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
    if (!output) throw new Error("Gemini가 관계도 데이터를 반환하지 않았습니다.");
    return Response.json(validateGraph(JSON.parse(output)), { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "관계도 생성 중 오류가 발생했습니다." }, { status: 400, headers: corsHeaders });
  }
});
