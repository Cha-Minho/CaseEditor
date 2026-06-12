import { FocusEvent, MouseEvent, useEffect, useRef, useState } from "react";
import type { EditableFieldKey } from "../types";
import { applyHighlight, eraseHighlight, sanitizeHtml } from "../lib/html";

type ToolMode = "highlight" | "erase" | null;

type Props = {
  field: EditableFieldKey;
  label: string;
  value: string;
  collapsed: boolean;
  toolMode: ToolMode;
  onToggle: () => void;
  onChange: (value: string) => void;
  onToolDone: () => void;
};

export function RichEditableField({ label, value, collapsed, toolMode, onToggle, onChange, onToolDone }: Props) {
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

  function pointerUp(event: MouseEvent<HTMLDivElement>) {
    if (!toolMode) return;
    event.preventDefault();
    toolMode === "highlight" ? applyHighlight() : eraseHighlight();
    if (ref.current) {
      const html = sanitizeHtml(ref.current.innerHTML);
      lastHtml.current = html;
      onChange(html);
    }
    onToolDone();
  }

  return (
    <section className={`editable-field ${collapsed ? "collapsed" : ""}`}>
      <button className="field-heading" onClick={onToggle}>
        <span>{label}</span>
        <span>{collapsed ? "펼치기" : "접기"}</span>
      </button>
      {!collapsed && (
        <div
          ref={ref}
          className={`rich-box ${toolMode ? "tool-active" : ""}`}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onMouseUp={pointerUp}
          onContextMenu={(event) => {
            if (toolMode) {
              event.preventDefault();
              onToolDone();
            }
          }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      )}
    </section>
  );
}
