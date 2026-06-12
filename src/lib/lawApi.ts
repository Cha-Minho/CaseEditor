import { supabase } from "./supabase";

export type LawCaseResult = {
  title: string;
  case_no: string;
  holding_html?: string;
  judgment_summary_html?: string;
  source_html?: string;
};

export async function fetchLawCase(caseNo: string): Promise<LawCaseResult> {
  if (!supabase) {
    throw new Error("Supabase Edge Function 설정이 필요합니다.");
  }

  const { data, error } = await supabase.functions.invoke<LawCaseResult>("law-case", {
    body: { caseNo }
  });

  if (error) throw error;
  if (!data) throw new Error("API 응답이 비어 있습니다.");
  return data;
}
