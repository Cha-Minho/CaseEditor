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

function caseNumberFrom(text: string) {
  return text.match(/\d{2,4}\s*[가-힣A-Za-z]+\s*\d+(?:\s*,\s*\d{2,4}\s*[가-힣A-Za-z]+\s*\d+)*/)?.[0].replace(/\s/g, "") || "";
}

function titleFrom(lines: string[], caseNo: string, fileName: string) {
  const caseLineIndex = lines.findIndex((line) => /^사\s*건(?:\s|$)/.test(line));
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
    let pageText = "";
    content.items.forEach((item) => {
      if (!("str" in item)) return;
      pageText += item.str;
      pageText += item.hasEOL ? "\n" : " ";
    });
    pageTexts.push(pageText);
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
