export type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height?: number;
  hasEOL?: boolean;
};

export type PdfViewport = { width: number; height: number; transform: number[] };
type Chunk = { text: string; raw: string; x: number; y: number; endX: number; size: number };
export type PdfLine = { text: string; x: number; y: number; endX: number; size: number; trailingSpace: boolean };
export type PdfPage = { width: number; height: number; lines: PdfLine[] };
type FlowLine = PdfLine & { page: number; kind: 'body' | 'quote'; right: number; left: number; header?: boolean };

const heading = (text: string) => /^(?:\d+[.)]\s|[가-하][.)]\s|\([가-하\d]+\)\s|[①-⑳㉠-㉻]|【)/.test(text)
  || /^(?:주\s*문|이\s*유|판\s*결|범\s*죄\s*사\s*실|증거의 요지|법령의 적용|양형의 이유|신상정보등록 및 제출의무)$/.test(text);
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();

export function cleanPdfFragment(text: string) {
  const cleaned = text.normalize('NFC').replace(/\u0000|\u2bb9/g, '')
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => {
      const code = parseInt(hex || decimal, hex ? 16 : 10);
      return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }).replace(/&nbsp;/gi, ' ');
  // Broken court watermarks use dense runs of unrelated glyphs. Circled list
  // markers and ordinary Hanja are valid text and must not truncate a paragraph.
  const rare = (cleaned.match(/[\u2e00-\u2fff\u3400-\u4dbf]/g) || []).length;
  if (rare >= 5 && rare / cleaned.length > 0.12) return '';
  return cleaned;
}

function point(matrix: number[], x: number, y: number) {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

export function pageFromTextItems(items: unknown[], viewport: PdfViewport): PdfPage {
  const chunks: Chunk[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item) || !('width' in item)) continue;
    const value = item as PdfTextItem;
    if (typeof value.str !== 'string' || !Array.isArray(value.transform) || value.transform.length < 6) continue;
    const raw = cleanPdfFragment(value.str);
    if (!raw.trim()) continue;
    const [x, y] = point(viewport.transform, value.transform[4], value.transform[5]);
    const horizontal = Math.hypot(value.transform[0], value.transform[1]) || 1;
    const end = point(viewport.transform,
      value.transform[4] + value.width * value.transform[0] / horizontal,
      value.transform[5] + value.width * value.transform[1] / horizontal);
    const scale = Math.hypot(viewport.transform[0], viewport.transform[1]) || 1;
    const size = (Math.hypot(value.transform[2], value.transform[3]) || value.height || horizontal) * scale;
    if (![x, y, end[0], size].every(Number.isFinite)) continue;
    chunks.push({ text: compact(raw), raw, x: Math.min(x, end[0]), y, endX: Math.max(x, end[0]), size });
  }
  // PDF drawing order is unrelated to reading order: a quotation box can be
  // painted before the paragraph above it. Rebuild visual rows first.
  chunks.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Chunk[][] = [];
  for (const chunk of chunks) {
    const row = rows.slice(-3).reverse().find(candidate => {
      const main = candidate.reduce((a, b) => a.size > b.size ? a : b);
      return Math.abs(main.y - chunk.y) <= Math.max(1.8, Math.max(main.size, chunk.size) * 0.38);
    });
    if (row) row.push(chunk);
    else rows.push([chunk]);
  }
  const lines = rows.map(row => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let previous: Chunk | undefined;
    for (const chunk of row) {
      if (previous && chunk.text === previous.text && Math.abs(chunk.x - previous.x) < 0.5) continue;
      const space = previous && (/\s$/.test(previous.raw) || /^\s/.test(chunk.raw)
        || chunk.x - previous.endX > Math.max(1.2, Math.min(previous.size, chunk.size) * 0.16));
      text += `${space ? ' ' : ''}${chunk.text}`;
      previous = chunk;
    }
    const main = row.reduce((a, b) => a.text.length * a.size > b.text.length * b.size ? a : b);
    const last = row[row.length - 1];
    return { text: compact(text), x: row[0].x, y: main.y, endX: Math.max(...row.map(chunk => chunk.endX)), size: main.size, trailingSpace: /\s$/.test(last.raw) };
  }).filter(line => line.text && !(/^-\s*\d+\s*-$/.test(line.text) && line.y > viewport.height * 0.85));
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return { width: viewport.width, height: viewport.height, lines };
}

function bodyFont(pages: PdfPage[]) {
  const counts = new Map<number, number>();
  for (const page of pages) for (const line of page.lines) {
    if (line.y < page.height * 0.1 || line.y > page.height * 0.94) continue;
    const size = Math.round(line.size * 2) / 2;
    counts.set(size, (counts.get(size) || 0) + line.text.length);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function joinSeparator(previous: FlowLine, next: FlowLine) {
  if (previous.trailingSpace || /[.!?…:;]$/.test(previous.text)) return ' ';
  const fillsLine = previous.endX >= previous.right - previous.size * 0.8;
  if (!fillsLine || !/^[가-힣A-Za-z0-9]/.test(next.text)) return ' ';
  const tail = previous.text.match(/[가-힣]+$/)?.[0] || '';
  // Justified Korean text omits the blank at a physical line break. Preserve
  // obvious completed phrases; otherwise join the syllables of a wrapped word.
  const particleContinuation = /^(?:은|는|이|가|을|를|의|에|와|과|도|로|으로|에서|에게)(?:\s|[,.])/.test(next.text);
  if (!particleContinuation && tail.length >= 2 && /(?:으로서|으로써|에게|에서|부터|까지|이나|하고|하며|면서|는데|거나|대한|따른|위한|관한|의한|인한|없는|있는|같은|이러한|그러한|따라|아니라|또는|그리고|그러나|그런데|따라서|한편|다만|다시|모두|함께|이미|또한|[은는을를과와도의에한된])$/.test(tail)
      && !(tail.endsWith('대한') && next.text.startsWith('민국'))) return ' ';
  return '';
}

export function documentFromPages(pages: PdfPage[]) {
  const size = bodyFont(pages);
  const recurrent = new Map<string, number>();
  for (const page of pages) {
    const marginTexts = new Set(page.lines.filter(line => line.y < page.height * 0.12 || line.y > page.height * 0.94).map(line => line.text));
    for (const text of marginTexts) recurrent.set(text, (recurrent.get(text) || 0) + 1);
  }
  const flow: FlowLine[] = [];
  const footnotes: { page: number; text: string; lastLine: FlowLine }[] = [];
  const hasCover = pages[0]?.lines.slice(0, 15).some(line => /(?:법\s*원|지\s*원)/.test(line.text));
  pages.forEach((page, pageIndex) => {
    let inFootnotes = false;
    const main: (PdfLine & { kind: 'body' | 'quote' })[] = [];
    for (const line of page.lines) {
      const margin = line.y < page.height * 0.12 || line.y > page.height * 0.94;
      const repeated = pages.length > 1 && (recurrent.get(line.text) || 0) >= Math.max(2, Math.ceil(pages.length * 0.6));
      if (margin && (repeated || /본\s*판결서|비실명처리일자/.test(line.text))) continue;
      if (line.y < page.height * 0.1 && /판결서|인터넷열람|사건관계인/.test(line.text)) continue;
      if (line.size < size * 0.82 && line.y > page.height * 0.68 && (/^\d+\)\s/.test(line.text) || inFootnotes)) {
        inFootnotes = true;
        const last = footnotes[footnotes.length - 1];
        const noteLine: FlowLine = { ...line, page: pageIndex, kind: 'body', left: line.x, right: Math.max(...page.lines.map(other => other.endX)) };
        if (last?.page === pageIndex && !/^\d+\)\s/.test(line.text)) {
          last.text += `${joinSeparator(last.lastLine, noteLine)}${line.text}`;
          last.lastLine = noteLine;
        } else footnotes.push({ page: pageIndex, text: line.text, lastLine: noteLine });
        continue;
      }
      // The court's boxed quotations have slightly smaller type and an inset.
      main.push({ ...line, kind: line.size < size * 0.96 && line.size >= size * 0.82 && line.x > page.width * 0.1 ? 'quote' : 'body' });
    }
    let header = pageIndex === 0 && hasCover;
    for (const line of main) {
      if (/^(?:주\s*문|이\s*유)$/.test(line.text)) header = false;
      const peers = main.filter(other => other.kind === line.kind && Math.abs(other.size - line.size) < 1);
      flow.push({ ...line, page: pageIndex, right: Math.max(...peers.map(other => other.endX)), left: Math.min(...peers.map(other => other.x)), header });
    }
  });

  const paragraphs: { kind: 'body' | 'quote'; text: string }[] = [];
  let previous: FlowLine | undefined;
  for (const line of flow) {
    const paragraph = paragraphs[paragraphs.length - 1];
    const indented = line.x > line.left + line.size * 0.7 && line.x < line.left + line.size * 1.8;
    const previousShort = previous && previous.endX < previous.right - previous.size * 1.5;
    let breakBefore = !previous || line.header || previous.header || previous.kind !== line.kind || heading(line.text) || (heading(previous.text) && previousShort)
      || (previous.page === line.page && line.y - previous.y > Math.max(previous.size, line.size) * 3.1)
      || (indented && (line.x > previous.x + line.size * 0.65 || previousShort))
      || (previousShort && /[.!?…]$/.test(previous.text));
    if (previous?.header && line.header
        && (previous.text.match(/\(/g)?.length || 0) > (previous.text.match(/\)/g)?.length || 0)) breakBefore = false;
    if (breakBefore || !paragraph) paragraphs.push({ kind: line.kind, text: line.text });
    else paragraph.text += `${joinSeparator(previous!, line)}${line.text}`;
    previous = line;
  }
  let html = '';
  let quoteOpen = false;
  for (const paragraph of paragraphs) {
    if (paragraph.kind === 'quote' && !quoteOpen) { html += '<div class="pdf-quote">'; quoteOpen = true; }
    if (paragraph.kind !== 'quote' && quoteOpen) { html += '</div>'; quoteOpen = false; }
    html += `<p>${escapeHtml(paragraph.text)}</p>`;
  }
  if (quoteOpen) html += '</div>';
  if (footnotes.length) html += `<div class="pdf-footnotes"><p><b>각주</b></p>${footnotes.map(note => `<p>${escapeHtml(note.text)}</p>`).join('')}</div>`;
  return { sourceHtml: html, lines: flow.map(line => line.text), text: paragraphs.map(paragraph => paragraph.text).join('\n\n'), paragraphs };
}
