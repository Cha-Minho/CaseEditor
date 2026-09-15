import { supabase } from "./supabase";

export type LawCaseResult = {
  title: string;
  case_no: string;
  found?: boolean;
  api_error?: string | null;
  holding_html?: string;
  judgment_summary_html?: string;
  source_html?: string;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function fetchLawCase(caseNo: string): Promise<LawCaseResult> {
  if (!supabase) {
    throw new Error("Supabase Edge Function 설정이 필요합니다.");
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke<LawCaseResult>("law-case", {
        body: { caseNo }
      });

      if (error) throw error;
      if (!data) throw new Error("API 응답이 비어 있습니다.");
      if (data.found === false) {
        const detailFailure = /원문|상세/.test(data.api_error || "");
        if (!detailFailure || attempt === 1) return data;
        lastError = new Error(data.api_error || "판례 원문을 불러오지 못했습니다.");
      } else if (data.source_html?.trim()) {
        return data;
      } else {
        lastError = new Error("판례 제목만 불러오고 원문이 비어 있어 다시 시도합니다.");
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("판례 API 호출 실패");
    }

    if (attempt === 0) await wait(700);
  }

  throw lastError || new Error("판례 API 호출 실패");
}
