import { FocusEvent, KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { applyHighlight, eraseHighlight, sanitizeHtml } from "../lib/html";

export type ToolMode = "highlight" | "erase" | null;

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
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!ref.current || focused || lastHtml.current === value) return;
    ref.current.innerHTML = value;
    lastHtml.current = value;
  }, [focused, value]);

  function commit(event: FocusEvent<HTMLDivElement>) {
    const html = sanitizeHtml(event.currentTarget.innerHTML);
    lastHtml.current = html;
    onChange(html);
    setFocused(false);
  }

  function applyCurrentTool(mode: Exclude<ToolMode, null>) {
    mode === "highlight" ? applyHighlight() : eraseHighlight();
    if (ref.current) {
      const html = sanitizeHtml(ref.current.innerHTML);
      lastHtml.current = html;
      onChange(html);
    }
  }

  function pointerUp(event: MouseEvent<HTMLDivElement>) {
    if (!toolMode) return;
    event.preventDefault();
    applyCurrentTool(toolMode);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!event.ctrlKey || event.key.toLowerCase() !== "h") return;
    event.preventDefault();
    applyCurrentTool(toolMode ?? "highlight");
  }

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
