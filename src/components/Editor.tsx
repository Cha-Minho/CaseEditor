import { PointerEvent, useMemo, useState } from "react";
import type { CaseItem, CaseNotes, EditableFieldKey, Topic } from "../types";
import { FIELD_LABELS } from "../types";
import { RichEditableField, ToolMode } from "./RichEditableField";

type Props = {
  topics: Topic[];
  selectedCase: CaseItem | null;
  selectedNotes: CaseNotes | null;
  collapsedFields: string[];
  splitWidth: number;
  onBack: () => void;
  onUpdateCase: (id: string, patch: Partial<CaseItem>) => void;
  onUpdateField: (caseId: string, field: EditableFieldKey, value: string) => void;
  onToggleField: (field: EditableFieldKey) => void;
  onSaveSplit: (width: number) => void;
  onDelete: (id: string) => void;
  onAddBlank: () => void;
};

const referenceFields: EditableFieldKey[] = ["source_html", "holding_html", "judgment_summary_html"];
const noteFields: EditableFieldKey[] = ["majority_html", "dissent_html", "concurring_html", "tags_html"];

export function Editor({
  topics,
  selectedCase,
  selectedNotes,
  collapsedFields,
  splitWidth,
  onBack,
  onUpdateCase,
  onUpdateField,
  onToggleField,
  onSaveSplit,
  onDelete,
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

  if (!selectedCase || !selectedNotes) {
    return (
      <main className="editor-pane">
        <div className="empty-state">
          <h2>판례를 선택하세요</h2>
          <p>왼쪽 목록에서 판례를 고르거나 새로 만들어보세요.</p>
          <button className="primary" onClick={onAddBlank}>빈 판례 만들기</button>
        </div>
      </main>
    );
  }

  const combinedSummaryHtml = [selectedNotes.key_phrases_html, selectedNotes.summary_html]
    .filter((value) => value.trim())
    .join("<div><br></div>");

  function requestDelete() {
    if (!selectedCase) return;
    if (window.confirm(`"${selectedCase.title}" 판례를 삭제할까요?`)) onDelete(selectedCase.id);
  }

  function startSplitResize(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    event.preventDefault();

    const move = (moveEvent: globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const percent = Math.round(((moveEvent.clientX - rect.left) / rect.width) * 100);
      onSaveSplit(Math.max(25, Math.min(75, percent)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <main className="editor-pane">
      <header className="editor-header">
        <button className="ghost back-button" onClick={onBack}>‹ 목록</button>
        <div className="editor-title">
          <h1
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(event) => onUpdateCase(selectedCase.id, { title: event.currentTarget.textContent?.trim() || "제목 없음" })}
          >
            {selectedCase.title}
          </h1>
          <p className="editor-meta">
            {selectedCase.case_no || "사건번호 없음"} · {topicPath}
          </p>
        </div>
        <div className="editor-controls">
          <button
            className={`tool-button ${toolMode === "highlight" ? "on" : ""}`}
            title="드래그한 부분에 형광펜 (PC 전용)"
            onClick={() => setToolMode(toolMode === "highlight" ? null : "highlight")}
          >
            형광펜
          </button>
          <button
            className={`tool-button ${toolMode === "erase" ? "on" : ""}`}
            title="형광펜 지우기 (PC 전용)"
            onClick={() => setToolMode(toolMode === "erase" ? null : "erase")}
          >
            지우개
          </button>
          <button
            className={`star-button ${selectedCase.important ? "on" : ""}`}
            title={selectedCase.important ? "중요 해제" : "중요 표시"}
            onClick={() => onUpdateCase(selectedCase.id, { important: !selectedCase.important })}
          >
            {selectedCase.important ? "★" : "☆"}
          </button>
          <select
            value={selectedCase.topic_id || ""}
            onChange={(event) => onUpdateCase(selectedCase.id, { topic_id: event.target.value || null })}
          >
            <option value="">미분류</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.name}</option>
            ))}
          </select>
          <button className="danger" onClick={requestDelete}>삭제</button>
        </div>
      </header>

      <div
        className="editor-columns"
        style={{ gridTemplateColumns: `minmax(240px, ${splitWidth}%) 6px minmax(240px, 1fr)` }}
      >
        <section className="field-group">
          <h2>내 정리</h2>
          <RichEditableField
            label="주요 문구 / 결론 요약"
            value={combinedSummaryHtml}
            collapsed={collapsedFields.includes("summary_html")}
            toolMode={toolMode}
            onToolDone={() => setToolMode(null)}
            onToggle={() => onToggleField("summary_html")}
            onChange={(value) => {
              onUpdateField(selectedCase.id, "summary_html", value);
              if (selectedNotes.key_phrases_html.trim()) onUpdateField(selectedCase.id, "key_phrases_html", "");
            }}
          />
          {noteFields.map((field) => (
            <RichEditableField
              key={field}
              label={FIELD_LABELS[field]}
              value={selectedNotes[field]}
              collapsed={collapsedFields.includes(field)}
              toolMode={toolMode}
              onToolDone={() => setToolMode(null)}
              onToggle={() => onToggleField(field)}
              onChange={(value) => onUpdateField(selectedCase.id, field, value)}
            />
          ))}
        </section>

        <div
          className="split-resizer"
          role="separator"
          tabIndex={0}
          aria-label="내 정리와 참고자료 폭 조절"
          aria-orientation="vertical"
          aria-valuemin={25}
          aria-valuemax={75}
          aria-valuenow={splitWidth}
          onPointerDown={startSplitResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onSaveSplit(Math.max(25, splitWidth - 2));
            if (event.key === "ArrowRight") onSaveSplit(Math.min(75, splitWidth + 2));
          }}
        />

        <section className="field-group">
          <h2>참고자료</h2>
          {referenceFields.map((field) => (
            <RichEditableField
              key={field}
              label={FIELD_LABELS[field]}
              value={selectedNotes[field]}
              collapsed={collapsedFields.includes(field)}
              toolMode={toolMode}
              onToolDone={() => setToolMode(null)}
              onToggle={() => onToggleField(field)}
              onChange={(value) => onUpdateField(selectedCase.id, field, value)}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
