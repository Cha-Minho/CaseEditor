import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJsonWithRetry(url: URL, label: string, attempts = 3) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`${label} API 오류: ${response.status}`);
        if (!retryableStatuses.has(response.status)) throw error;
        lastError = error;
      } else {
        try {
          return await response.json();
        } catch {
          lastError = new Error(`${label} API 응답을 해석하지 못했습니다.`);
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`${label} API 호출 실패`);
    }

    if (attempt < attempts - 1) await wait(350 * (2 ** attempt));
  }

  throw lastError || new Error(`${label} API 호출 실패`);
}

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

type LawApiKind = "precedent" | "constitutional";

type LawApiConfig = {
  kind: LawApiKind;
  target: "prec" | "detc";
  label: string;
  searchRootKeys: string[];
  searchItemKeys: string[];
  detailRootKeys: string[];
  serialKeys: string[];
  holdingKeys: string[];
  summaryKeys: string[];
  sourceKeys: string[];
  detailFallbackParam?: "MST";
};

const precedentConfig: LawApiConfig = {
  kind: "precedent",
  target: "prec",
  label: "판례",
  searchRootKeys: ["PrecSearch", "precSearch"],
  searchItemKeys: ["prec", "Prec"],
  detailRootKeys: ["PrecService", "precService"],
  serialKeys: ["판례일련번호"],
  holdingKeys: ["판시사항", "판시요지"],
  summaryKeys: ["판결요지", "판결요약"],
  sourceKeys: ["판례내용", "판결문", "본문"],
  detailFallbackParam: "MST"
};

const constitutionalConfig: LawApiConfig = {
  kind: "constitutional",
  target: "detc",
  label: "헌재결정례",
  searchRootKeys: ["DetcSearch", "detcSearch"],
  searchItemKeys: ["Detc", "detc"],
  detailRootKeys: ["DetcService", "detcService"],
  serialKeys: ["헌재결정례일련번호"],
  holdingKeys: ["판시사항", "판시요지"],
  summaryKeys: ["결정요지", "결정요약"],
  sourceKeys: ["전문", "결정문", "본문"]
};

function isConstitutionalCase(caseNo: string) {
  return /^\d{2,4}헌[가-힣]*\d/i.test(normalizedCaseNo(caseNo));
}

function apiConfigFor(caseNo: string) {
  return isConstitutionalCase(caseNo) ? constitutionalConfig : precedentConfig;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function firstObject(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = objectValue(record[key]);
    if (value) return value;
  }
  return null;
}

function searchCandidates(data: unknown, config: LawApiConfig) {
  const root = firstObject(objectValue(data) || {}, config.searchRootKeys);
  if (!root) return [];

  for (const key of config.searchItemKeys) {
    const value = root[key];
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(objectValue(item)));
    const item = objectValue(value);
    if (item) return [item];
  }
  return [];
}

function detailRecord(data: unknown, config: LawApiConfig) {
  return firstObject(objectValue(data) || {}, config.detailRootKeys);
}

function serialNumber(item: Record<string, unknown>, config: LawApiConfig) {
  return detailText(item, ...config.serialKeys);
}

async function fetchDetailWithRetry(url: URL, config: LawApiConfig, attempts = 3) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const data = await fetchJsonWithRetry(url, "국가법령정보 상세", 1);
      const detail = detailRecord(data, config);
      if (detail && detailText(detail, ...config.sourceKeys)) return detail;
      lastError = new Error(`국가법령정보 상세 응답에 ${config.label} 원문이 없습니다.`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("국가법령정보 상세조회 실패");
    }

    if (attempt < attempts - 1) await wait(350 * (2 ** attempt));
  }

  throw lastError || new Error("국가법령정보 상세조회 실패");
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
    const apiConfig = apiConfigFor(searchableCaseNo);

    const oc = Deno.env.get("LAW_API_OC");
    if (!oc) throw new Error("LAW_API_OC 환경변수가 설정되지 않았습니다.");

    // 1단계: 사건번호(nb)로 판례일련번호를 찾는다. query는 판례명 검색이라
    // 비슷한 사건번호의 다른 판례를 돌려줄 수 있다.
    const searchUrl = new URL("https://www.law.go.kr/DRF/lawSearch.do");
    searchUrl.searchParams.set("OC", oc);
    searchUrl.searchParams.set("target", apiConfig.target);
    searchUrl.searchParams.set("type", "JSON");
    searchUrl.searchParams.set("nb", searchableCaseNo);
    searchUrl.searchParams.set("display", "100");
    if (courtName && apiConfig.kind === "precedent") {
      searchUrl.searchParams.set("curt", courtName);
      if (courtName !== "대법원") searchUrl.searchParams.set("org", "400202");
    }

    const searchData = await fetchJsonWithRetry(searchUrl, "국가법령정보 검색");
    let candidates = searchCandidates(searchData, apiConfig);
    // 검색 API는 비슷한 사건번호를 함께 돌려준다. 첫 결과를 쓰면 다른 판례가
    // 열리므로, 입력한 사건번호와 정확히 일치하는 결과만 상세조회한다.
    let first = candidates.find((item: Record<string, unknown>) =>
      normalizedCaseNo(text(item.사건번호)) === normalizedCaseNo(searchableCaseNo)
    );

    // 법원명 표기가 데이터와 조금 다를 때는 사건번호만으로도 한 번 더 찾는다.
    if (!first && courtName && apiConfig.kind === "precedent") {
      const fallbackUrl = new URL(searchUrl);
      fallbackUrl.searchParams.delete("curt");
      fallbackUrl.searchParams.delete("org");
      const fallbackData = await fetchJsonWithRetry(fallbackUrl, "국가법령정보 검색");
      candidates = searchCandidates(fallbackData, apiConfig);
      first = candidates.find((item: Record<string, unknown>) =>
        normalizedCaseNo(text(item.사건번호)) === normalizedCaseNo(searchableCaseNo)
      );
    }

    if (!first) {
      return Response.json(
        {
          found: false,
          api_error: `국가법령정보 API에서 일치하는 ${apiConfig.label}를 찾지 못했습니다.`,
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

    // 2단계: 유형별 일련번호로 상세조회해서 공통 편집 필드에 맞춰 넣는다.
    const serial = serialNumber(first, apiConfig);
    const detailErrors: string[] = [];
    if (serial) {
      const detailUrl = new URL("https://www.law.go.kr/DRF/lawService.do");
      detailUrl.searchParams.set("OC", oc);
      detailUrl.searchParams.set("target", apiConfig.target);
      detailUrl.searchParams.set("type", "JSON");
      // 검색 응답의 판례상세링크도 ID를 쓰는 것처럼, 판례일련번호는 ID로 조회한다.
      detailUrl.searchParams.set("ID", serial);

      try {
        const detail = await fetchDetailWithRetry(detailUrl, apiConfig);
        result.title = detailText(detail, "사건명") || result.title;
        result.case_no = detailText(detail, "사건번호") || result.case_no;
        result.holding_html = detailText(detail, ...apiConfig.holdingKeys);
        result.judgment_summary_html = detailText(detail, ...apiConfig.summaryKeys);
        result.source_html = detailText(detail, ...apiConfig.sourceKeys);
      } catch (error) {
        detailErrors.push(error instanceof Error ? error.message : "ID 상세조회 실패");
      }

      if (!result.source_html && apiConfig.detailFallbackParam) {
        detailUrl.searchParams.delete("ID");
        detailUrl.searchParams.set(apiConfig.detailFallbackParam, serial);
        try {
          const detail = await fetchDetailWithRetry(detailUrl, apiConfig);
          result.title = detailText(detail, "사건명") || result.title;
          result.case_no = detailText(detail, "사건번호") || result.case_no;
          result.holding_html = detailText(detail, ...apiConfig.holdingKeys) || result.holding_html;
          result.judgment_summary_html = detailText(detail, ...apiConfig.summaryKeys) || result.judgment_summary_html;
          result.source_html = detailText(detail, ...apiConfig.sourceKeys) || result.source_html;
        } catch (error) {
          detailErrors.push(error instanceof Error ? error.message : `${apiConfig.detailFallbackParam} 상세조회 실패`);
        }
      }
    } else {
      detailErrors.push(`검색 결과에 ${apiConfig.label} 일련번호가 없습니다.`);
    }

    // 검색 결과의 제목만 저장되고 참고자료가 비는 상태를 성공으로 확정하지 않는다.
    if (!result.source_html) {
      return Response.json(
        {
          ...result,
          found: false,
          api_error: `${apiConfig.label} 제목은 찾았지만 원문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.${detailErrors.length ? ` (${detailErrors.join(" ")})` : ""}`
        },
        { headers: corsHeaders }
      );
    }

    return Response.json(result, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 400, headers: corsHeaders }
    );
  }
});
