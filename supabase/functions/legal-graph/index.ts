import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const kinds = ["contract", "money", "security", "dispute", "status", "notice", "other"];
const statuses = ["recognized", "alleged", "disputed", "procedural"];
const effects = ["own", "sale", "lien", "poss"];

const stringSchema = { type: "STRING" };
const nullableStringSchema = { type: "STRING", nullable: true };
const responseSchema = {
  type: "OBJECT",
  required: ["parties", "objects", "relations", "events"],
  properties: {
    parties: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "name"], properties: { id: stringSchema, name: stringSchema, role: nullableStringSchema } } },
    objects: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "name"], properties: { id: stringSchema, name: stringSchema } } },
    relations: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "from", "to", "label", "kind", "evidence", "status", "confidence"], properties: {
      id: stringSchema, from: stringSchema, to: stringSchema, label: stringSchema,
      kind: { type: "STRING", enum: kinds }, date: nullableStringSchema, objectId: nullableStringSchema,
      effect: { type: "STRING", enum: effects, nullable: true }, evidence: stringSchema,
      status: { type: "STRING", enum: statuses }, confidence: { type: "NUMBER", minimum: 0, maximum: 1 }
    } } },
    events: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "text", "evidence"], properties: { id: stringSchema, date: nullableStringSchema, text: stringSchema, evidence: stringSchema } } }
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
  const objects = rawObjects.slice(0, 20).map((item: Record<string, unknown>, index: number) => ({
    id: cleanString(item.id, 60) || `o${index + 1}`,
    name: cleanString(item.name, 120) || `목적물 ${index + 1}`
  }));
  const entityIds = new Set([...parties.map((item) => item.id), ...objects.map((item) => item.id)]);
  const partyIds = new Set(parties.map((item) => item.id));
  const relations = (Array.isArray(value.relations) ? value.relations : [])
    .slice(0, 80)
    .map((item: Record<string, unknown>, index: number) => ({
      id: cleanString(item.id, 60) || `r${index + 1}`,
      from: cleanString(item.from, 60), to: cleanString(item.to, 60), label: cleanString(item.label, 180),
      kind: kinds.includes(cleanString(item.kind)) ? cleanString(item.kind) : "other",
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
    ...(cleanString(item.date, 40) ? { date: cleanString(item.date, 40) } : {}),
    text: cleanString(item.text, 300), evidence: cleanString(item.evidence, 500)
  })).filter((item) => item.text && item.evidence);
  return { parties, objects, relations, events };
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
모든 relation과 event에는 판결문에서 그대로 가져온 짧은 evidence를 넣는다.
from과 to는 반드시 parties의 id를 사용하고 objectId는 objects의 id를 사용한다.

판결문:\n${caseText}`;
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema }
      })
    });
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
