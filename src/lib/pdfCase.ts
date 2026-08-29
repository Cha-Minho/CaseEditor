import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfCaseImport = {
  title: string;
  caseNo: string;
  sourceHtml: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type TextChunk = {
  str: string;
  transform: number[];
  width: number;
  hasEOL: boolean;
};

function normalizeFragment(value: string) {
  const compact = cleanLine(value);
  // PDF가 한글 한 글자씩 내보낸 경우에만 자간을 제거한다.
  return /^(?:[가-힣]\s+){2,}[가-힣]$/.test(compact) ? compact.replace(/\s/g, "") : compact;
}

function isSingleWordCharacter(value: string) {
  return /^[가-힣0-9]$/.test(value);
}

function shouldSeparate(previous: TextChunk, next: TextChunk) {
  const previousText = normalizeFragment(previous.str);
  const nextText = normalizeFragment(next.str);
  if (!previousText || !nextText) return false;
  if (isSingleWordCharacter(previousText) && /^[가-힣0-9]/.test(nextText)) return false;
  if (/^[가-힣]/.test(previousText) && isSingleWordCharacter(nextText)) return false;
  const previousEnd = previous.transform[4] + previous.width;
  const gap = next.transform[4] - previousEnd;
  return gap > Math.max(4, Math.abs(previous.transform[0]) * 0.35);
}

function readableLine(value: string) {
  const cleaned = cleanLine(value);
  if (/^-\s*\d+\s*-$/.test(cleaned)) return "";
  const readable = (cleaned.match(/[가-힣A-Za-z0-9]/g) || []).length;
  return cleaned.length > 10 && readable / cleaned.length < 0.3 ? "" : cleaned;
}

function textFromPage(items: unknown[]) {
  const lines: string[] = [];
  let line = "";
  let previous: TextChunk | null = null;

  const commitLine = () => {
    const next = readableLine(line);
    if (next) lines.push(next);
    line = "";
    previous = null;
  };

  items.forEach((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item) || !("width" in item) || !("hasEOL" in item)) return;
    const chunk = item as TextChunk;
    if (chunk.str.trim()) {
      if (previous && shouldSeparate(previous, chunk)) line += " ";
      line += normalizeFragment(chunk.str);
      previous = chunk;
    }
    if (chunk.hasEOL) commitLine();
  });
  commitLine();
  return lines.join("\n");
}

function caseNumberFrom(text: string) {
  return text.match(/\d{2,4}\s*[가-힣A-Za-z]+\s*\d+(?:\s*,\s*\d{2,4}\s*[가-힣A-Za-z]+\s*\d+)*/)?.[0].replace(/\s/g, "") || "";
}

function titleFrom(lines: string[], caseNo: string, fileName: string) {
  const caseLineIndex = lines.findIndex((line) => /^사\s*건/.test(line));
  const caseLine = caseLineIndex >= 0 ? lines[caseLineIndex].replace(/^사\s*건\s*/, "") : "";
  const nextLine = caseLineIndex >= 0 ? lines.slice(caseLineIndex + 1).find(Boolean) || "" : "";
  const rawTitle = caseLine.replace(caseNo, "").trim() || nextLine.replace(caseNo, "").trim();
  return rawTitle || caseNo || fileName.replace(/\.pdf$/i, "") || "PDF 판례";
}

export async function readCasePdf(file: File): Promise<PdfCaseImport> {
  if (file.type && file.type !== "application/pdf") throw new Error("PDF 파일만 가져올 수 있습니다.");
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts: string[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pageTexts.push(textFromPage(content.items));
  }

  const sourceText = pageTexts.join("\n\n").replace(/\u0000/g, "").trim();
  if (!sourceText) throw new Error("PDF에서 텍스트를 읽지 못했습니다. 스캔본은 아직 지원하지 않습니다.");

  const lines = sourceText.split(/\n+/).map(cleanLine).filter(Boolean);
  const caseNo = caseNumberFrom(sourceText);
  return {
    title: titleFrom(lines, caseNo, file.name),
    caseNo,
    sourceHtml: sourceText.split("\n").map(escapeHtml).join("<br>")
  };
}
