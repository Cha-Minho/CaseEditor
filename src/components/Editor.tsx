import { PointerEvent, useMemo, useState } from "react";
import type { CaseItem, CaseNotes, EditableFieldKey, Topic, UiState } from "../types";
import { FIELD_LABELS } from "../types";
import { RichEditableField } from "./RichEditableField";

type ToolMode = "highlight" | "erase" | null;

type Props = {
  cases: CaseItem[];
  topics: Topic[];
  selectedCase: CaseItem | null;
  selectedNotes: CaseNotes | null;
  collapsedFields: string[];
  splitWidth: number;
  onSelectCase: (id: string) => void;
  onUpdateCase: (id: string, patch: Partial<CaseItem>) => void;
  onUpdateField: (caseId: string, field: EditableFieldKey, value: string) => void;
  onSaveUi: (patch: Partial<UiState>) => void;
  onAddBlank: () => void;
};

const leftFields: EditableFieldKey[] = ["source_html", "holding_html", "judgment_summary_html"];
const rightFields: EditableFieldKey[] = ["majority_html", "dissent_html", "concurring_html", "tags_html"];

export function Editor({
  cases,
  topics,
  selectedCase,
  selectedNotes,
  collapsedFields,
  splitWidth,
  onSelectCase,
  onUpdateCase,
  onUpdateField,
  onSaveUi,
  onAddBlank
}: Props) {
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const topicPath = useMemo(() => {
    if (!selectedCase?.topic_id) return "미분류";
    const map = new Map(topics.map((topic) => [topic.id, topic]));
    const path: string[] = [];
    let cursor = map.get(selectedCase.topic_id);
    while (cursor) {
      path.unshift(cursor.name);
      cursor = cursor.parent_id ? map.get(cursor.parent_id) : undefined;
    }
    return path.join(" / ") || "미분류";
  }, [selectedCase?.topic_id, topics]);

  function toggleField(field: EditableFieldKey) {
    const set = new Set(collapsedFields);
    set.has(field) ? set.delete(field) : set.add(field);
    onSaveUi({ collapsed_fields: Array.from(set) });
  }

  function startSplitResize(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    event.preventDefault();

    const move = (moveEvent: PointerEvent | globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const percent = Math.round(((moveEvent.clientX - rect.left) / rect.width) * 100);
      onSaveUi({ split_width: Math.max(28, Math.min(72, percent)) });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  if (!selectedCase || !selectedNotes) {
    return (
      <section className="empty-editor">
        <h1>판례 정리함</h1>
        <p>아래 도구막대에서 목차와 검색을 열거나 판례를 만들어보세요.</p>
        <button className="brand" onClick={onAddBlank}>빈 판례 만들기</button>
      </section>
    );
  }

  const combinedSummaryHtml = [selectedNotes.key_phrases_html, selectedNotes.summary_html]
    .filter((value) => value.trim())
    .join("<div><br></div>");

  return (
    <section className="editor">
      <header className="editor-head">
        <div className="selected-title">
          <div className="title-block">
            <h1
              id="editorHeading"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={(event) => onUpdateCase(selectedCase.id, { title: event.currentTarget.textContent || "제목 없음" })}
            >
              {selectedCase.title}
            </h1>
            <div className="case-meta">
              <span>{selectedCase.case_no || "사건번호 없음"}</span>
              <span>{topicPath}</span>
            </div>
          </div>
          <div className="editor-side">
            <div className="folder-move">
              <span className="field-label">폴더 이동</span>
              <select value={selectedCase.topic_id || ""} onChange={(event) => onUpdateCase(selectedCase.id, { topic_id: event.target.value || null })}>
                <option value="">미분류</option>
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            </div>
            <div className="editor-tools">
              <button className={selectedCase.important ? "brand" : "secondary"} onClick={() => onUpdateCase(selectedCase.id, { important: !selectedCase.important })}>
                {selectedCase.important ? "★ 중요" : "☆ 중요"}
              </button>
              <button className="warn" onClick={() => onUpdateCase(selectedCase.id, { deleted_at: new Date().toISOString() })}>삭제</button>
              <button className={`desktop-only-tool ${toolMode === "highlight" ? "active-tool" : "secondary"}`} onClick={() => setToolMode(toolMode === "highlight" ? null : "highlight")}>형광펜</button>
              <button className={`desktop-only-tool ${toolMode === "erase" ? "active-tool" : "secondary"}`} onClick={() => setToolMode(toolMode === "erase" ? null : "erase")}>지우개</button>
            </div>
          </div>
        </div>
      </header>

      <div className="editor-body">
      <div
        className="editor-split"
        style={{ gridTemplateColumns: `minmax(260px, ${splitWidth}%) 8px minmax(260px, 1fr)` }}
      >
        <div className="editor-column reference-column">
          <div className="column-heading"><h3>참고자료</h3></div>
          {leftFields.map((field) => (
            <RichEditableField
              key={field}
              field={field}
              label={FIELD_LABELS[field]}
              value={selectedNotes[field]}
              collapsed={collapsedFields.includes(field)}
              toolMode={toolMode}
              onToolDone={() => setToolMode(null)}
              onToggle={() => toggleField(field)}
              onChange={(value) => onUpdateField(selectedCase.id, field, value)}
            />
          ))}
        </div>
        <div
          className="split-resizer"
          role="separator"
          tabIndex={0}
          aria-label="참고자료와 내 정리 폭 조절"
          aria-orientation="vertical"
          aria-valuemin={28}
          aria-valuemax={72}
          aria-valuenow={splitWidth}
          onPointerDown={startSplitResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onSaveUi({ split_width: Math.max(28, splitWidth - 2) });
            if (event.key === "ArrowRight") onSaveUi({ split_width: Math.min(72, splitWidth + 2) });
          }}
        />
        <div className="editor-column note-column">
          <div className="column-heading"><h3>내 정리</h3></div>
          <RichEditableField
            field="summary_html"
            label="주요 문구 / 결론 요약"
            value={combinedSummaryHtml}
            collapsed={collapsedFields.includes("summary_html")}
            toolMode={toolMode}
            onToolDone={() => setToolMode(null)}
            onToggle={() => toggleField("summary_html")}
            onChange={(value) => {
              onUpdateField(selectedCase.id, "summary_html", value);
              if (selectedNotes.key_phrases_html.trim()) onUpdateField(selectedCase.id, "key_phrases_html", "");
            }}
          />
          {rightFields.map((field) => (
            <RichEditableField
              key={field}
              field={field}
              label={FIELD_LABELS[field]}
              value={selectedNotes[field]}
              collapsed={collapsedFields.includes(field)}
              toolMode={toolMode}
              onToolDone={() => setToolMode(null)}
              onToggle={() => toggleField(field)}
              onChange={(value) => onUpdateField(selectedCase.id, field, value)}
            />
          ))}
        </div>
      </div>
      </div>
      <select className="mobile-case-switcher" value={selectedCase.id} onChange={(event) => onSelectCase(event.target.value)}>
        {cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.title}</option>)}
      </select>
    </section>
  );
}
