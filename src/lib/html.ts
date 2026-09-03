const ALLOWED_TAGS = new Set(["B", "I", "U", "STRONG", "EM", "BR", "DIV", "P", "SPAN", "MARK", "UL", "OL", "LI"]);
const ALLOWED_ATTRS = new Set(["class"]);

export function sanitizeHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html.replace(/\u200B/g, "");

  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!ALLOWED_TAGS.has(element.tagName)) {
          element.replaceWith(document.createTextNode(element.textContent || ""));
          return;
        }
        Array.from(element.attributes).forEach((attr) => {
          if (!ALLOWED_ATTRS.has(attr.name) || (attr.name === "class" && attr.value !== "case-highlight")) {
            element.removeAttribute(attr.name);
          }
        });
      }
      walk(child);
    });
  };

  walk(template.content);
  return template.innerHTML;
}

export function applyHighlight() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const mark = document.createElement("mark");
  mark.className = "case-highlight";
  try {
    range.surroundContents(mark);
  } catch {
    const content = range.extractContents();
    mark.append(content);
    range.insertNode(mark);
  }
  selection.removeAllRanges();
}

function rangeOverlapsNode(range: Range, node: Node) {
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0
  );
}

function highlightedMarksInRange(range: Range) {
  return Array.from(document.querySelectorAll("mark.case-highlight")).filter((mark) =>
    rangeOverlapsNode(range, mark)
  );
}

export function eraseHighlight() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (selection.isCollapsed) {
    const node = selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;
    const mark = node?.closest("mark.case-highlight");
    if (mark) mark.replaceWith(...Array.from(mark.childNodes));
    return;
  }

  const marks = highlightedMarksInRange(range);
  if (!marks.length) return;

  // The browser splits surrounding marks when extracting a partial selection.
  // Unwrapping the extracted fragment therefore keeps the still-highlighted text intact.
  const content = range.extractContents();
  Array.from(content.querySelectorAll("mark.case-highlight")).forEach((mark) => {
    mark.replaceWith(...Array.from(mark.childNodes));
  });
  range.insertNode(content);
  selection.removeAllRanges();
}

export function toggleHighlight() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const hasHighlight = highlightedMarksInRange(range).length > 0;
  if (hasHighlight) eraseHighlight();
  else applyHighlight();
}

export function textFromHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}
