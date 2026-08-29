import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfCaseImport = {
  title: string;
  caseNo: string;
  courtName: string;
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

type PositionedLine = {
  text: string;
  y: number;
  startX: number;
  endX: number;
};

function stripPdfArtifacts(value: string) {
  const entityCleaned = value.replace(/&(#[xX]?[0-9a-fA-F]+|nbsp);?/g, " ");
  // 일부 법원 PDF는 본문 뒤에 깨진 보안 문구를 텍스트 조각으로 덧붙인다.
  const artifactIndex = entityCleaned.search(/[\u2e00-\u2fff\u3200-\u33ff\u3400-\u4dbf\uf900-\ufaff]/);
  if (artifactIndex < 0) return entityCleaned;
  const before = entityCleaned.slice(0, artifactIndex);
  const artifact = entityCleaned.slice(artifactIndex);
  const suspiciousCount = (artifact.match(/[\u2e00-\u2fff\u3200-\u33ff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  return suspiciousCount >= 2 ? before : entityCleaned;
}

function normalizeFragment(value: string) {
  const compact = cleanLine(stripPdfArtifacts(value));
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function textFromPage(items: unknown[], pageWidth: number) {
  const lines: PositionedLine[] = [];
  let line = "";
  let previous: TextChunk | null = null;
  let lineY = 0;
  let lineStartX = 0;
  let lineEndX = 0;

  const commitLine = () => {
    const next = readableLine(line);
    if (next) lines.push({ text: next, y: lineY, startX: lineStartX, endX: lineEndX });
    line = "";
    previous = null;
    lineY = 0;
    lineStartX = 0;
    lineEndX = 0;
  };

  items.forEach((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item) || !("width" in item) || !("hasEOL" in item)) return;
    const chunk = item as TextChunk;
    if (chunk.str.trim()) {
      if (!line) {
        lineY = chunk.transform[5];
        lineStartX = chunk.transform[4];
      }
      if (previous && shouldSeparate(previous, chunk)) line += " ";
      line += normalizeFragment(chunk.str);
      lineEndX = Math.max(lineEndX, chunk.transform[4] + chunk.width);
      previous = chunk;
    }
    if (chunk.hasEOL) commitLine();
  });
  commitLine();

  const lineHeight = median(lines.slice(1).map((line, index) => Math.abs(line.y - lines[index].y)).filter(Boolean));
  return lines.reduce((text, line, index) => {
    if (!index) return line.text;
    const previousLine = lines[index - 1];
    const yGap = Math.abs(previousLine.y - line.y);
    const wrapsAtRightEdge = previousLine.endX > pageWidth * 0.82;
    const alignedContinuation = Math.abs(previousLine.startX - line.startX) < 42;
    const endsSentence = /[.!?…:;)]$/.test(previousLine.text);
    const startsWithWord = /^[가-힣A-Za-z0-9]/.test(line.text);
    const joinWithoutSpace = wrapsAtRightEdge && alignedContinuation && !endsSentence && startsWithWord;
    const paragraphBreak = lineHeight > 0 && yGap > lineHeight * 1.55;
    return `${text}${joinWithoutSpace ? "" : paragraphBreak ? "\n\n" : " "}${line.text}`;
  }, "");
}

function caseNumberFrom(text: string) {
  return text.match(/\d{2,4}\s*[가-힣A-Za-z]+\s*\d+(?:\s*,\s*\d{2,4}\s*[가-힣A-Za-z]+\s*\d+)*/)?.[0].replace(/\s/g, "") || "";
}

function courtNameFrom(lines: string[]) {
  const header = lines.slice(0, 12).join(" ");
  return header.match(/(?:대법원|[가-힣]+(?:고등법원|지방법원|가정법원|행정법원|회생법원|지원))/)?.[0] || "";
}

function titleFrom(lines: string[], courtName: string, caseNo: string, fileName: string) {
  const caseLineIndex = lines.findIndex((line) => /^사\s*건/.test(line));
  const caseLine = caseLineIndex >= 0 ? lines[caseLineIndex].replace(/^사\s*건\s*/, "") : "";
  const nextLine = caseLineIndex >= 0 ? lines.slice(caseLineIndex + 1).find(Boolean) || "" : "";
  const rawTitle = caseLine.replace(caseNo, "").trim() || nextLine.replace(caseNo, "").trim();
  const fallback = caseNo || fileName.replace(/\.pdf$/i, "") || "PDF 판례";
  return [courtName, caseNo, rawTitle || fallback].filter(Boolean).join(" - ");
}

export async function readCasePdf(file: File): Promise<PdfCaseImport> {
  if (file.type && file.type !== "application/pdf") throw new Error("PDF 파일만 가져올 수 있습니다.");
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts: string[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pageTexts.push(textFromPage(content.items, page.getViewport({ scale: 1 }).width));
  }

  const sourceText = pageTexts.join("\n\n").replace(/\u0000/g, "").trim();
  if (!sourceText) throw new Error("PDF에서 텍스트를 읽지 못했습니다. 스캔본은 아직 지원하지 않습니다.");

  const lines = sourceText.split(/\n+/).map(cleanLine).filter(Boolean);
  const caseNo = caseNumberFrom(sourceText);
  const courtName = courtNameFrom(lines);
  return {
    title: titleFrom(lines, courtName, caseNo, file.name),
    caseNo,
    courtName,
    sourceHtml: sourceText.split("\n").map(escapeHtml).join("<br>")
  };
}
