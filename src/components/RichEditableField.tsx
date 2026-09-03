import { FocusEvent, KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { applyHighlight, eraseHighlight, sanitizeHtml, toggleHighlight } from "../lib/html";

export type ToolMode = "highlight" | "erase" | null;

type History = {
  undo: string[];
  redo: string[];
};

type SelectionOffset = {
  start: number;
  end: number;
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
  const [focused, setFocused] = useState(false);

  function commit(event: FocusEvent<HTMLDivElement>) {
    const html = sanitizeHtml(event.currentTarget.innerHTML);
    lastHtml.current = html;
    onChange(html);
    setFocused(false);
  }

  function recordToolChange(change: () => void) {
    if (!ref.current) return;
    const before = sanitizeHtml(ref.current.innerHTML);
    change();
    const after = sanitizeHtml(ref.current.innerHTML);
    if (before === after) return;
    history.current.undo.push(before);
    if (history.current.undo.length > HISTORY_LIMIT) history.current.undo.shift();
    history.current.redo = [];
    lastHtml.current = after;
    onChange(after);
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

  function handleInput() {
    // Text typing has the browser's native undo history. Avoid replaying an old
    // highlighting snapshot over newer text edits.
    resetToolHistory();
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
    savedSelection.current = { start: startRange.toString().length, end: endRange.toString().length };
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

    const range = document.createRange();
    const start = findBoundary(saved.start);
    const end = findBoundary(saved.end);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  useEffect(() => {
    handleExternalValue();
  }, [focused, value]);

  useEffect(() => {
    const onWindowBlur = () => {
      if (document.activeElement !== ref.current) return;
      captureSelection();
      restoreAfterWindowFocus.current = Boolean(savedSelection.current);
    };
    const onWindowFocus = () => {
      if (!restoreAfterWindowFocus.current) return;
      restoreAfterWindowFocus.current = false;
      window.requestAnimationFrame(() => {
        ref.current?.focus({ preventScroll: true });
        restoreSelection();
      });
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
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
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onInput={handleInput}
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
