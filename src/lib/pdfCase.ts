import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { documentFromPages, pageFromTextItems, type PdfPage } from "./pdfLayout";
import { formatReferenceHtml } from './judgmentFormat';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfCaseImport = {
  title: string;
  caseNo: string;
  courtName: string;
  sourceHtml: string;
};

function caseNumberFrom(text: string) {
  return text.normalize("NFC").match(/\d{2,4}\s*[가-힣A-Za-z]+\s*\d+(?:\s*,\s*\d{2,4}\s*[가-힣A-Za-z]+\s*\d+)*/)?.[0].replace(/\s/g, "") || "";
}

function courtNameFrom(lines: string[]) {
  for (const line of lines.slice(0, 12)) {
    const compact = line.replace(/\s/g, "");
    const court = compact.match(/(?:대법원|[가-힣]+(?:고등법원|지방법원|가정법원|행정법원|회생법원)(?:[가-힣]+지원)?)/)?.[0];
    if (court) return court;
  }
  return "";
}

function titleFrom(lines: string[], courtName: string, caseNo: string, fileName: string) {
  const index = lines.findIndex(line => /^사\s*건\s/.test(line));
  const label = index < 0 ? "" : lines[index].replace(/^사\s*건\s*/, "");
  let title = label.replace(caseNo, "").trim();
  for (let i = index + 1; index >= 0 && i < lines.length; i++) {
    if (/^(?:피\s*고\s*인|검\s*사|항\s*소\s*인|원\s*고|피\s*고|변\s*호\s*인|원\s*심\s*판\s*결|판\s*결\s*선\s*고)/.test(lines[i])) break;
    title += lines[i];
  }
  return [courtName, caseNo, title || (!caseNo ? fileName.replace(/\.pdf$/i, "") : "")].filter(Boolean).join(" - ") || "PDF 판례";
}

export async function readCasePdf(file: File): Promise<PdfCaseImport> {
  if (file.type && file.type !== "application/pdf") throw new Error("PDF 파일만 가져올 수 있습니다.");
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const pages: PdfPage[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      try {
        const content = await page.getTextContent();
        pages.push(pageFromTextItems(content.items, page.getViewport({ scale: 1 })));
      } finally { page.cleanup(); }
    }
    const document = documentFromPages(pages);
    if (!document.text.trim()) throw new Error("PDF에서 텍스트를 읽지 못했습니다. 스캔본은 아직 지원하지 않습니다.");
    const caseNo = caseNumberFrom(document.lines.slice(0, 20).join(" "));
    const courtName = courtNameFrom(document.lines);
    return {
      title: titleFrom(document.lines, courtName, caseNo, file.name),
      caseNo,
      courtName,
      sourceHtml: formatReferenceHtml(document.sourceHtml)
    };
  } finally { await task.destroy(); }
}
