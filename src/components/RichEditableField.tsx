import { FocusEvent, useEffect, useRef, useState } from "react";
import { sanitizeHtml } from "../lib/html";

type Props = {
  label: string;
  value: string;
  collapsed: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
};

export function RichEditableField({ label, value, collapsed, onToggle, onChange }: Props) {
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

  return (
    <div className="field">
      <button className="field-label" onClick={onToggle}>
        <span>{label}</span>
        <span className="field-toggle">{collapsed ? "펼치기" : "접기"}</span>
      </button>
      {!collapsed && (
        <div
          ref={ref}
          className="field-box"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      )}
    </div>
  );
}
