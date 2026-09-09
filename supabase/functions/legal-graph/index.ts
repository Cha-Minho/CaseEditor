import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const kinds = ["contract", "money", "security", "dispute", "status", "notice", "other"];
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
    .map((item: Record<string, unknown>, index: number) => ({
      id: cleanString(item.id, 60) || `r${index + 1}`,
      from: cleanString(item.from, 60), to: cleanString(item.to, 60), label: cleanString(item.label, 180),
      kind: kinds.includes(cleanString(item.kind)) ? cleanString(item.kind) : "other",
      sequence: Math.max(1, Math.round(Number(item.sequence) || index + 1)),
      ...(cleanString(item.date, 40) ? { date: cleanString(item.date, 40) } : {}),
      ...(entityIds.has(cleanString(item.objectId)) ? { objectId: cleanString(item.objectId, 60) } : {}),
      ...(effects.includes(cleanString(item.effect)) ? { effect: cleanString(item.effect) } : {}),
      evidence: cleanString(item.evidence, 500),
      status: statuses.includes(cleanString(item.status)) ? cleanString(item.status) : "recognized",
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0))
    }))
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
date는 해당 사실이 발생한 날짜다. 판결 선고일이나 인용 판례의 날짜를 사실 발생일로 사용하지 말고, 원문에 알 수 있는 날짜만 YYYY.MM.DD, YYYY.MM, YYYY 형식으로 넣는다.
즉시, 그 후, 다음날, 제출하였다, 압수하였다 같은 서술상 인과관계는 날짜가 없어도 sequence에 반영한다. 예를 들어 범행으로 생성된 물건을 수사기관에 임의제출한 사실은 해당 범행들보다 뒤에 둔다.
관계에 시점이 표시되었다면 relation.date에도 같은 발생일을 넣는다. 사실관계 관계선이 하나도 없는 기관이나 소송관계인은 parties에서 뺀다.
모든 relation과 event에는 판결문에서 그대로 가져온 짧은 evidence를 넣는다.
from과 to는 반드시 parties의 id를 사용하고 objectId는 objects의 id를 사용한다.
목적물의 최초 소유자가 원문에 나오면 object.ownerId에, 최초 점유자가 별도로 나오면 object.possessorId에 parties의 id를 넣는다.
relation.effect의 own은 매매, 증여, 상속, 소유권이전등기처럼 소유권이 실제로 relation.to에게 이전되는 경우에만 쓴다.
"피고인 소유 휴대전화"처럼 기존 소유자를 설명하거나, 휴대전화를 임의제출·압수·보관·교부한 사실에는 own을 쓰지 않는다.
강제처분인 압수로 수사기관이 물건을 확보한 관계에는 effect를 seize로 쓴다. 임의제출·보관·교부 등 그 밖의 물리적 지배 이동에는 poss를 쓰며 relation.to는 새 점유자로 둔다.
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
