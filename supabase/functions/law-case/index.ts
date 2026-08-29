import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizedCaseNo(value: string) {
  return value.replace(/[\s\-]/g, "").toLowerCase();
}

function detailText(detail: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = text(detail[key]);
    if (value) return value;
  }
  return "";
}

function parseCaseInput(value: string) {
  const caseNoMatch = value.match(/\d{2,4}\s*[가-힣A-Za-z]+\s*\d+/);
  const caseNo = caseNoMatch?.[0].replace(/\s/g, "") || value;
  const courtName = caseNoMatch ? value.replace(caseNoMatch[0], "").trim() : "";
  return { caseNo, courtName };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { caseNo } = await request.json();
    if (!caseNo || typeof caseNo !== "string") throw new Error("caseNo가 필요합니다.");
    const requestedCaseNo = caseNo.trim();
    const { caseNo: searchableCaseNo, courtName } = parseCaseInput(requestedCaseNo);

    const oc = Deno.env.get("LAW_API_OC");
    if (!oc) throw new Error("LAW_API_OC 환경변수가 설정되지 않았습니다.");

    // 1단계: 사건번호(nb)로 판례일련번호를 찾는다. query는 판례명 검색이라
    // 비슷한 사건번호의 다른 판례를 돌려줄 수 있다.
    const searchUrl = new URL("https://www.law.go.kr/DRF/lawSearch.do");
    searchUrl.searchParams.set("OC", oc);
    searchUrl.searchParams.set("target", "prec");
    searchUrl.searchParams.set("type", "JSON");
    searchUrl.searchParams.set("nb", searchableCaseNo);
    searchUrl.searchParams.set("display", "100");
    if (courtName) {
      searchUrl.searchParams.set("curt", courtName);
      if (courtName !== "대법원") searchUrl.searchParams.set("org", "400202");
    }

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) throw new Error(`국가법령정보 검색 API 오류: ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    let candidates = Array.isArray(searchData?.PrecSearch?.prec)
      ? searchData.PrecSearch.prec
      : searchData?.PrecSearch?.prec ? [searchData.PrecSearch.prec] : [];
    // 검색 API는 비슷한 사건번호를 함께 돌려준다. 첫 결과를 쓰면 다른 판례가
    // 열리므로, 입력한 사건번호와 정확히 일치하는 결과만 상세조회한다.
    let first = candidates.find((item: Record<string, unknown>) =>
      normalizedCaseNo(text(item.사건번호)) === normalizedCaseNo(searchableCaseNo)
    );

    // 법원명 표기가 데이터와 조금 다를 때는 사건번호만으로도 한 번 더 찾는다.
    if (!first && courtName) {
      const fallbackUrl = new URL(searchUrl);
      fallbackUrl.searchParams.delete("curt");
      fallbackUrl.searchParams.delete("org");
      const fallbackResponse = await fetch(fallbackUrl);
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        candidates = Array.isArray(fallbackData?.PrecSearch?.prec)
          ? fallbackData.PrecSearch.prec
          : fallbackData?.PrecSearch?.prec ? [fallbackData.PrecSearch.prec] : [];
        first = candidates.find((item: Record<string, unknown>) =>
          normalizedCaseNo(text(item.사건번호)) === normalizedCaseNo(searchableCaseNo)
        );
      }
    }

    if (!first) {
      return Response.json(
        {
          found: false,
          api_error: "국가법령정보 API에서 일치하는 판례를 찾지 못했습니다.",
          title: requestedCaseNo,
          case_no: searchableCaseNo,
          holding_html: "",
          judgment_summary_html: "",
          source_html: ""
        },
        { headers: corsHeaders }
      );
    }

    const result = {
      found: true,
      api_error: null,
      title: text(first.사건명) || requestedCaseNo,
      case_no: text(first.사건번호) || searchableCaseNo,
      holding_html: "",
      judgment_summary_html: "",
      source_html: ""
    };

    // 2단계: 판례일련번호로 상세조회해서 판시사항/판결요지/판례내용을 채운다
    const serial = text(first.판례일련번호);
    if (serial) {
      const detailUrl = new URL("https://www.law.go.kr/DRF/lawService.do");
      detailUrl.searchParams.set("OC", oc);
      detailUrl.searchParams.set("target", "prec");
      detailUrl.searchParams.set("type", "JSON");
      // 검색 응답의 판례상세링크도 ID를 쓰는 것처럼, 판례일련번호는 ID로 조회한다.
      detailUrl.searchParams.set("ID", serial);

      const detailResponse = await fetch(detailUrl);
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        const detail = detailData?.PrecService || detailData?.precService;
        if (detail) {
          result.title = detailText(detail, "사건명") || result.title;
          result.case_no = detailText(detail, "사건번호") || result.case_no;
          result.holding_html = detailText(detail, "판시사항", "판시요지");
          result.judgment_summary_html = detailText(detail, "판결요지", "판결요약");
          result.source_html = detailText(detail, "판례내용", "판결문", "본문");
        }
      }

      if (!result.source_html) {
        detailUrl.searchParams.delete("ID");
        detailUrl.searchParams.set("MST", serial);
        const fallbackResponse = await fetch(detailUrl);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const detail = fallbackData?.PrecService || fallbackData?.precService;
          if (detail) {
            result.title = detailText(detail, "사건명") || result.title;
            result.case_no = detailText(detail, "사건번호") || result.case_no;
            result.holding_html = detailText(detail, "판시사항", "판시요지") || result.holding_html;
            result.judgment_summary_html = detailText(detail, "판결요지", "판결요약") || result.judgment_summary_html;
            result.source_html = detailText(detail, "판례내용", "판결문", "본문") || result.source_html;
          }
        }
      }
    }

    return Response.json(result, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 400, headers: corsHeaders }
    );
  }
});
