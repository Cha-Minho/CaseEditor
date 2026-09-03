import { FocusEvent, KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { applyHighlight, eraseHighlight, sanitizeHtml, toggleHighlight } from "../lib/html";

export type ToolMode = "highlight" | "erase" | null;

type History = {
  undo: string[];
  redo: string[];
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

  useEffect(() => {
    handleExternalValue();
  }, [focused, value]);

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
