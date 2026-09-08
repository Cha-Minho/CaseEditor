import { ClipboardEvent, FocusEvent, FormEvent, KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyHighlight, eraseHighlight, sanitizeHtml, toggleHighlight } from "../lib/html";

export type ToolMode = "highlight" | "erase" | null;

type History = {
  undo: string[];
  redo: string[];
};

type SelectionOffset = {
  start: number;
  end: number;
  startPath?: number[];
  endPath?: number[];
  startNodeOffset?: number;
  endNodeOffset?: number;
};

const HISTORY_LIMIT = 60;

type Props = {
  label: string;
  value: string;
  collapsed: boolean;
  toolMode: ToolMode;
  onToggle: () => void;
  onChange: (value: string) => void;
  onExitTool: () => void;
};

export function RichEditableField({ label, value, collapsed, toolMode, onToggle, onChange, onExitTool }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastHtml = useRef(value);
  const history = useRef<History>({ undo: [], redo: [] });
  const savedSelection = useRef<SelectionOffset | null>(null);
  const restoreAfterWindowFocus = useRef(false);
  const recentlyBlurred = useRef(false);
  const focusedRef = useRef(false);
  const typingMode = useRef<"highlight" | "plain" | null>(null);
  const typingInputStart = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);

  function commit(event: FocusEvent<HTMLDivElement>) {
    recentlyBlurred.current = true;
    focusedRef.current = false;
    const html = sanitizeHtml(event.currentTarget.innerHTML);
    event.currentTarget.innerHTML = html;
    lastHtml.current = html;
    onChange(html);
    typingMode.current = null;
    typingInputStart.current = null;
    setFocused(false);
  }

  function recordToolChange(change: () => void) {
    if (!ref.current) return;
    captureSelection();
    const before = sanitizeHtml(ref.current.innerHTML);
    change();
    const after = sanitizeHtml(ref.current.innerHTML);
    if (before === after) return;
    history.current.undo.push(before);
    if (history.current.undo.length > HISTORY_LIMIT) history.current.undo.shift();
    history.current.redo = [];
    lastHtml.current = after;
    onChange(after);
    if (savedSelection.current) {
      const end = savedSelection.current.end;
      savedSelection.current = { start: end, end };
      window.requestAnimationFrame(() => {
        ref.current?.focus({ preventScroll: true });
        restoreSelection();
      });
    }
  }

  function applyCurrentTool(mode: Exclude<ToolMode, null>) {
    recordToolChange(() => (mode === "highlight" ? applyHighlight() : eraseHighlight()));
  }

  function pointerUp(event: MouseEvent<HTMLDivElement>) {
    if (!toolMode) return;
    event.preventDefault();
    applyCurrentTool(toolMode);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      if (selection.isCollapsed) {
        toggleTypingHighlight(selection.getRangeAt(0));
        return;
      }
      recordToolChange(toggleHighlight);
      return;
    }

    const isUndo = event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "z";
    const isRedo = event.ctrlKey && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));
    if (!isUndo && !isRedo) return;

    const from = isUndo ? history.current.undo : history.current.redo;
    const to = isUndo ? history.current.redo : history.current.undo;
    const next = from.pop();
    if (!next || !ref.current) return;
    event.preventDefault();
    to.push(sanitizeHtml(ref.current.innerHTML));
    ref.current.innerHTML = next;
    lastHtml.current = next;
    onChange(next);
  }

  function resetToolHistory() {
    history.current = { undo: [], redo: [] };
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    enforceTypingMode((event.nativeEvent as InputEvent).data || "");
    replaceArrowShortcut();
    captureSelection();
    // Text typing has the browser's native undo history. Avoid replaying an old
    // highlighting snapshot over newer text edits.
    resetToolHistory();
  }

  function enforceTypingMode(inserted: string) {
    const root = ref.current;
    const mode = typingMode.current;
    const start = typingInputStart.current;
    if (!root || !mode || start === null || !inserted) return;
    const end = start + inserted.length;
    root.innerHTML = sanitizeHtml(root.innerHTML);
    savedSelection.current = { start, end };
    restoreSelection();
    mode === "highlight" ? applyHighlight() : eraseHighlight();
    const html = sanitizeHtml(root.innerHTML);
    root.innerHTML = html;
    lastHtml.current = html;
    onChange(html);
    savedSelection.current = { start: end, end };
    restoreSelection();
    typingInputStart.current = end;
  }

  function replaceArrowShortcut() {
    const root = ref.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
    const caret = selection.getRangeAt(0);
    if (!root.contains(caret.startContainer)) return;
    const trailingText = textAtCaret(caret);
    if (!trailingText || trailingText.offset < 2) return;
    if (trailingText.node.data.slice(trailingText.offset - 2, trailingText.offset) !== "->") return;

    const replacement = document.createRange();
    replacement.setStart(trailingText.node, trailingText.offset - 2);
    replacement.setEnd(trailingText.node, trailingText.offset);
    selection.removeAllRanges();
    selection.addRange(replacement);
    // execCommand keeps this small replacement in the browser's native undo stack.
    if (!document.execCommand("insertText", false, "→")) return;

    captureSelection();
    typingInputStart.current = savedSelection.current?.start ?? null;
  }

  function textAtCaret(range: Range) {
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      return { node: range.startContainer as Text, offset: range.startOffset };
    }
    if (range.startContainer.nodeType !== Node.ELEMENT_NODE || range.startOffset === 0) return null;
    let node: Node | null = range.startContainer.childNodes[range.startOffset - 1] ?? null;
    while (node?.lastChild) node = node.lastChild;
    if (node?.nodeType !== Node.TEXT_NODE) return null;
    const textNode = node as Text;
    return { node: textNode, offset: textNode.data.length };
  }

  function toggleTypingHighlight(range: Range) {
    const root = ref.current;
    if (!root) return;
    const node = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const activeMark = node?.closest("mark.case-highlight");
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const cursorOffset = prefix.toString().length;
    typingInputStart.current = cursorOffset;
    const followsHighlight = !activeMark && caretFollowsHighlight(range, root);
    typingMode.current = activeMark || followsHighlight ? "plain" : "highlight";
    savedSelection.current = { start: cursorOffset, end: cursorOffset };
  }

  function caretFollowsHighlight(range: Range, root: HTMLElement) {
    const previousElement = (node: Node, offset: number): Element | null => {
      if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
        return (node.childNodes[offset - 1] as Element | undefined) || null;
      }
      if (node.nodeType === Node.TEXT_NODE && offset === 0) return node.previousSibling as Element | null;
      return null;
    };
    let current: Node | null = range.startContainer;
    let offset = range.startOffset;
    while (current) {
      if (current.nodeType === Node.TEXT_NODE && offset > 0) return false;
      const previous = previousElement(current, offset);
      if (previous instanceof Element && (previous.matches("mark.case-highlight") || previous.querySelector("mark.case-highlight"))) return true;
      if (current === root) break;
      offset = Array.prototype.indexOf.call(current.parentNode?.childNodes, current);
      current = current.parentNode;
    }
    return false;
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const root = ref.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;

    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    resetToolHistory();
    const html = sanitizeHtml(root.innerHTML);
    lastHtml.current = html;
    onChange(html);
  }

  function handleExternalValue() {
    if (!ref.current || focused || lastHtml.current === value) return;
    ref.current.innerHTML = value;
    lastHtml.current = value;
    resetToolHistory();
  }

  function captureSelection() {
    const root = ref.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;

    const startRange = document.createRange();
    startRange.selectNodeContents(root);
    startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = document.createRange();
    endRange.selectNodeContents(root);
    endRange.setEnd(range.endContainer, range.endOffset);
    const pathTo = (node: Node) => {
      const path: number[] = [];
      let current: Node | null = node;
      while (current && current !== root) {
        const parent: Node | null = current.parentNode;
        if (!parent) return undefined;
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
        current = parent;
      }
      return current === root ? path : undefined;
    };
    savedSelection.current = {
      start: startRange.toString().length,
      end: endRange.toString().length,
      startPath: pathTo(range.startContainer),
      endPath: pathTo(range.endContainer),
      startNodeOffset: range.startOffset,
      endNodeOffset: range.endOffset,
    };
  }

  function restoreSelection() {
    const root = ref.current;
    const saved = savedSelection.current;
    if (!root || !saved) return;

    const findBoundary = (offset: number) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let remaining = offset;
      let textNode = walker.nextNode() as Text | null;
      while (textNode) {
        if (remaining <= textNode.data.length) return { node: textNode, offset: remaining };
        remaining -= textNode.data.length;
        textNode = walker.nextNode() as Text | null;
      }
      return { node: root as Node, offset: root.childNodes.length };
    };

    const resolvePath = (path?: number[]) => {
      if (!path) return null;
      let node: Node = root;
      for (const index of path) {
        const child: ChildNode | undefined = node.childNodes[index];
        if (!child) return null;
        node = child;
      }
      return node;
    };
    const validOffset = (node: Node, offset?: number) => {
      if (offset === undefined) return null;
      const limit = node.nodeType === Node.TEXT_NODE ? (node as Text).data.length : node.childNodes.length;
      return offset <= limit ? offset : null;
    };
    const pathStartNode = resolvePath(saved.startPath);
    const pathEndNode = resolvePath(saved.endPath);
    const pathStartOffset = pathStartNode ? validOffset(pathStartNode, saved.startNodeOffset) : null;
    const pathEndOffset = pathEndNode ? validOffset(pathEndNode, saved.endNodeOffset) : null;
    const start = pathStartNode && pathStartOffset !== null ? { node: pathStartNode, offset: pathStartOffset } : findBoundary(saved.start);
    const end = pathEndNode && pathEndOffset !== null ? { node: pathEndNode, offset: pathEndOffset } : findBoundary(saved.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  useEffect(() => {
    handleExternalValue();
  }, [focused, value]);

  // React reapplies dangerouslySetInnerHTML after a note update. Restore the
  // logical caret after that commit so typing at a highlighted line end stays put.
  useLayoutEffect(() => {
    if (!focused || lastHtml.current !== value || !savedSelection.current) return;
    restoreSelection();
  }, [focused, value]);

  useEffect(() => {
    const onWindowBlur = () => {
      const root = ref.current;
      const selection = window.getSelection();
      const selectionInside = Boolean(root && selection?.anchorNode && root.contains(selection.anchorNode));
      if (!focusedRef.current && !recentlyBlurred.current && !selectionInside) return;
      restoreAfterWindowFocus.current = Boolean(savedSelection.current);
      recentlyBlurred.current = false;
    };
    const onWindowFocus = () => {
      if (!restoreAfterWindowFocus.current) return;
      restoreAfterWindowFocus.current = false;
      window.requestAnimationFrame(() => {
        ref.current?.focus({ preventScroll: true });
        restoreSelection();
      });
    };
    const onDocumentFocusIn = (event: globalThis.FocusEvent) => {
      if (event.target === ref.current) return;
      recentlyBlurred.current = false;
      restoreAfterWindowFocus.current = false;
    };
    const onSelectionChange = () => {
      if (!focusedRef.current || document.activeElement !== ref.current) return;
      captureSelection();
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("focusin", onDocumentFocusIn);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("focusin", onDocumentFocusIn);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  return (
    <div className="field">
      <button className="field-label" onClick={onToggle}>
        <span>{label}</span>
        <span className="field-toggle">{collapsed ? "펼치기" : "접기"}</span>
      </button>
      {!collapsed && (
        <div
          ref={ref}
          className={`field-box ${toolMode ? "tool-active" : ""}`}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onFocus={() => {
            focusedRef.current = true;
            recentlyBlurred.current = false;
            setFocused(true);
          }}
          onBlur={commit}
          onInput={handleInput}
          onSelect={captureSelection}
          onPaste={handlePaste}
          onMouseUp={pointerUp}
          onKeyDown={handleKeyDown}
          onContextMenu={(event) => {
            if (toolMode) {
              event.preventDefault();
              onExitTool();
            }
          }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      )}
    </div>
  );
}
