import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { caseNo } = await request.json();
    if (!caseNo || typeof caseNo !== "string") throw new Error("caseNo가 필요합니다.");

    const oc = Deno.env.get("LAW_API_OC");
    if (!oc) throw new Error("LAW_API_OC 환경변수가 설정되지 않았습니다.");

    const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
    url.searchParams.set("OC", oc);
    url.searchParams.set("target", "prec");
    url.searchParams.set("type", "JSON");
    url.searchParams.set("query", caseNo);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`국가법령정보 API 오류: ${response.status}`);
    const data = await response.json();
    const first = Array.isArray(data?.PrecSearch?.prec) ? data.PrecSearch.prec[0] : data?.PrecSearch?.prec;

    if (!first) {
      return Response.json(
        { title: caseNo, case_no: caseNo, holding_html: "", judgment_summary_html: "", source_html: "" },
        { headers: corsHeaders }
      );
    }

    return Response.json(
      {
        title: text(first.사건명) || text(first.판례일련번호) || caseNo,
        case_no: text(first.사건번호) || caseNo,
        holding_html: text(first.판시사항),
        judgment_summary_html: text(first.판결요지),
        source_html: text(first.판례내용)
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 400, headers: corsHeaders }
    );
  }
});
