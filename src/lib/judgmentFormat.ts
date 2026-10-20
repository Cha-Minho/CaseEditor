import { sanitizeHtml } from './html';

const numberPrefix = /^(?:\[\d+\]|\d+[.)]|[가-하][.)]|\([가-하\d]+\)|[①-⑳㉠-㉻])\s*/;
const standaloneHeading = /^(?:주\s*문|이\s*유|판\s*결|범\s*죄\s*사\s*실|증거의 요지|법령의 적용|양형의 이유|신상정보등록 및 제출의무|각주)$/;

function fragmentBetween(element: HTMLElement, start: number, end: number) {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null;
  let started = false;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length || 0;
    if (!started && start <= offset + length) { range.setStart(node, Math.max(0, start - offset)); started = true; }
    if (started && end <= offset + length) { range.setEnd(node, Math.max(0, end - offset)); return range.cloneContents(); }
    offset += length;
  }
  return document.createDocumentFragment();
}

function emphasize(paragraph: HTMLParagraphElement, length: number) {
  const text = paragraph.textContent || '';
  const prefix = fragmentBetween(paragraph, 0, length);
  const remainder = fragmentBetween(paragraph, length, text.length);
  const strong = document.createElement('b');
  strong.append(prefix);
  paragraph.replaceChildren(strong, remainder);
}

function decorate(paragraph: HTMLParagraphElement) {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node);
  if (nodes.length) {
    nodes[0].textContent = (nodes[0].textContent || '').replace(/^\s+/, '');
    nodes[nodes.length - 1].textContent = (nodes[nodes.length - 1].textContent || '').replace(/\s+$/, '');
  }
  const text = (paragraph.textContent || '').trim();
  const prefix = text.match(numberPrefix)?.[0];
  const isHeading = standaloneHeading.test(text) || /^【[^】]+】$/.test(text)
    || (prefix && text.length <= 80 && !/(?:다|요)[.!?]$/.test(text));
  if (isHeading) {
    paragraph.className = 'judgment-heading';
    emphasize(paragraph, (paragraph.textContent || '').length);
  } else if (prefix) {
    emphasize(paragraph, prefix.length);
  } else {
    const label = text.match(/^(?:피\s*고\s*인|변\s*호\s*인|항\s*소\s*인|검\s*사|원\s*심\s*판\s*결|판\s*결\s*선\s*고|사\s*건)(?=\s|\d)/)?.[0];
    if (label) emphasize(paragraph, label.length);
  }
}

// Shared by API/PDF imports. Only structural whitespace and emphasis change;
// source words and existing inline annotations are retained.
export function formatReferenceHtml(html: string) {
  if (!html.trim()) return '';
  const input = document.createElement('template');
  input.innerHTML = sanitizeHtml(html);
  const output = document.createElement('div');

  function normalize(nodes: Node[], parent: HTMLElement) {
    let paragraph = document.createElement('p');
    const flush = () => {
      const text = paragraph.textContent || '';
      if (text.trim()) {
        const markers = [...text.matchAll(/【[^】]{1,50}】/g)];
        if (markers.length) {
          let cursor = 0;
          for (const match of markers) {
            if (match.index! > cursor && text.slice(cursor, match.index).trim()) {
              const before = document.createElement('p');
              before.append(fragmentBetween(paragraph, cursor, match.index!));
              decorate(before); parent.append(before);
            }
            const label = document.createElement('p');
            label.append(fragmentBetween(paragraph, match.index!, match.index! + match[0].length));
            decorate(label); parent.append(label);
            cursor = match.index! + match[0].length;
          }
          if (text.slice(cursor).trim()) {
            const tail = document.createElement('p');
            tail.append(fragmentBetween(paragraph, cursor, text.length));
            decorate(tail); parent.append(tail);
          }
        } else { decorate(paragraph); parent.append(paragraph); }
      }
      paragraph = document.createElement('p');
    };
    const visit = (node: Node, wrappers: HTMLElement[] = []) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = (node.textContent || '').split(/\r?\n/);
        parts.forEach((part, index) => {
          if (index) flush();
          if (!part) return;
          let content: Node = document.createTextNode(part);
          for (const wrapper of [...wrappers].reverse()) {
            const clone = wrapper.cloneNode(false) as HTMLElement;
            clone.append(content); content = clone;
          }
          paragraph.append(content);
        });
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.tagName === 'BR') { flush(); return; }
      if (['P', 'DIV', 'UL', 'OL', 'LI'].includes(node.tagName)) {
        flush();
        if (node.classList.contains('pdf-quote') || node.classList.contains('pdf-footnotes') || ['UL', 'OL', 'LI'].includes(node.tagName)) {
          const block = document.createElement(['UL', 'OL', 'LI'].includes(node.tagName) ? node.tagName : 'div'); block.className = node.className;
          normalize(Array.from(node.childNodes), block); parent.append(block);
        } else Array.from(node.childNodes).forEach(child => visit(child, wrappers));
        flush();
      } else Array.from(node.childNodes).forEach(child => visit(child, [...wrappers, node]));
    };
    nodes.forEach(node => visit(node));
    flush();
  }
  normalize(Array.from(input.content.childNodes), output);
  return sanitizeHtml(output.innerHTML);
}
