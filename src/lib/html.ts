const ALLOWED_TAGS = new Set(["B", "I", "U", "STRONG", "EM", "BR", "DIV", "P", "SPAN", "MARK", "UL", "OL", "LI"]);
const ALLOWED_ATTRS = new Set(["class"]);

export function sanitizeHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;

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

export function eraseHighlight() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const marks = Array.from(document.querySelectorAll("mark.case-highlight")).filter((mark) =>
    range.intersectsNode(mark)
  );
  marks.forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
}

export function textFromHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}
