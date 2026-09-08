import { supabase } from "./supabase";
import type { LegalGraph } from "../types";

function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.innerText || doc.body.textContent || "")
    .replace(/\u200B/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function generateLegalGraph(sourceHtml: string) {
  const caseText = htmlToText(sourceHtml);
  if (!caseText) throw new Error("판례 원문이 비어 있습니다.");
  if (!supabase) throw new Error("Supabase 연결 설정이 필요합니다.");
  const { data, error } = await supabase.functions.invoke<LegalGraph>("legal-graph", {
    body: { caseText }
  });
  if (error) {
    let message = error.message || "관계도 초안을 만들지 못했습니다.";
    const response = (error as { context?: Response }).context;
    if (response) {
      try {
        const detail = await response.clone().json();
        if (typeof detail?.error === "string") message = detail.error;
      } catch {}
    }
    throw new Error(message);
  }
  if (!data?.parties || !data.relations || !data.events) throw new Error("Gemini 응답 형식이 올바르지 않습니다.");
  return data;
}
