import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CaseItem, CaseNotes, EditableFieldKey, Topic } from "../types";
import { FIELD_LABELS } from "../types";
import { RichEditableField, ToolMode } from "./RichEditableField";
import { Network } from 'lucide-react';
import { DiagramEditor } from './DiagramEditor';

type Props = {
  onUpdateDiagram: (caseId: string, diagram: CaseNotes['diagram']) => void;
  topics: Topic[];
  selectedCase: CaseItem | null;
  selectedNotes: CaseNotes | null;
  selectedCaseIds: string[];
  collapsedFields: string[];
  splitWidth: number;
  onBack: () => void;
  onUpdateCase: (id: string, patch: Partial<CaseItem>) => void;
  onMoveSelectedCases: (topicId: string | null) => void;
  onUpdateField: (caseId: string, field: EditableFieldKey, value: string) => void;
  onToggleField: (field: EditableFieldKey) => void;
  onSaveSplit: (width: number) => void;
  onDelete: (id: string) => void;
  onAddBlank: () => void;
};

const referenceFields: EditableFieldKey[] = ["source_html", "holding_html", "judgment_summary_html"];
const noteFields: EditableFieldKey[] = ["majority_html", "dissent_html", "concurring_html", "tags_html"];

export function Editor({
  onUpdateDiagram,
  topics,
  selectedCase,
  selectedNotes,
  selectedCaseIds,
  collapsedFields,
  splitWidth,
  onBack,
  onUpdateCase,
  onMoveSelectedCases,
  onUpdateField,
  onToggleField,
  onSaveSplit,
  onDelete,
  onAddBlank
}: Props) {
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [moveExpandedIds, setMoveExpandedIds] = useState<Set<string>>(new Set());
  const [draftSplitWidth, setDraftSplitWidth] = useState(splitWidth);
  const moveMenuRef = useRef<HTMLDivElement | null>(null);
  const splitWidthRef = useRef(splitWidth);
  const isResizingRef = useRef(false);
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

  useEffect(() => {
    if (!moveMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoveMenuOpen(false);
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(event.target as Node)) setMoveMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [moveMenuOpen]);

  useEffect(() => {
    if (isResizingRef.current) return;
    splitWidthRef.current = splitWidth;
    setDraftSplitWidth(splitWidth);
  }, [splitWidth]);

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
  const moveCount = selectedCaseIds.length > 1 ? selectedCaseIds.length : 1;

  function requestDelete() {
    if (!selectedCase) return;
    if (window.confirm(`"${selectedCase.title}" 판례를 삭제할까요?`)) onDelete(selectedCase.id);
  }

  function startSplitResize(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    event.preventDefault();
    isResizingRef.current = true;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const percent = Math.round(((moveEvent.clientX - rect.left) / rect.width) * 100);
      const nextWidth = Math.max(25, Math.min(75, percent));
      splitWidthRef.current = nextWidth;
      setDraftSplitWidth(nextWidth);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      isResizingRef.current = false;
      onSaveSplit(splitWidthRef.current);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function chooseTopic(topicId: string | null) {
    onMoveSelectedCases(topicId);
    setMoveMenuOpen(false);
  }

  function toggleMoveTopic(topicId: string) {
    setMoveExpandedIds((current) => {
      const next = new Set(current);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  }

  function renderMoveTopic(topic: Topic): JSX.Element {
    const children = topics.filter((item) => item.parent_id === topic.id).sort((a, b) => a.sort_order - b.sort_order);
    const hasChildren = children.length > 0;
    const open = moveExpandedIds.has(topic.id);
    return (
      <div className="move-tree-node" key={topic.id}>
        <div className="move-tree-row">
          {hasChildren ? (
            <button className="move-tree-toggle" onClick={() => toggleMoveTopic(topic.id)} aria-label={`${topic.name} ${open ? "접기" : "펼치기"}`}>
              <span className={`chevron ${open ? "open" : ""}`}>▸</span>
            </button>
          ) : <span className="move-tree-spacer" />}
          <button className="move-tree-name" onClick={() => chooseTopic(topic.id)}>{topic.name}</button>
        </div>
        {hasChildren && open && <div className="move-tree-children">{children.map(renderMoveTopic)}</div>}
      </div>
    );
  }

  const moveRoots = topics.filter((topic) => !topic.parent_id).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <main className="editor-pane">
      <header className="editor-header">
        <button className="ghost back-button" onClick={onBack}>‹ 목록</button>
        <div className="editor-title">
          <h1
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(event) => onUpdateCase(selectedCase.id, { case_no: event.currentTarget.textContent?.trim() || "" })}
          >
            {selectedCase.case_no || "사건번호 없음"}
          </h1>
          <p className="editor-meta">
            {topicPath}
          </p>
        </div>
        <div className="editor-controls">
          <button className={`diagram-launch ${selectedNotes.diagram?.nodes.length ? 'has-diagram' : ''}`} title="관계도" aria-label="관계도" onClick={() => setDiagramOpen(true)}><Network size={20} /></button>
          <div className="editor-mark-tools">
            <button
              className={`tool-button ${toolMode === "highlight" ? "on" : ""}`}
              title="드래그한 부분에 형광펜 (Ctrl+H는 독립 토글)"
              onClick={() => setToolMode(toolMode === "highlight" ? null : "highlight")}
            >
              형광펜
            </button>
            <button
              className={`tool-button ${toolMode === "erase" ? "on" : ""}`}
              title="드래그한 부분의 형광펜 지우기 (Ctrl+H는 독립 토글)"
              onClick={() => setToolMode(toolMode === "erase" ? null : "erase")}
            >
              지우개
            </button>
          </div>
          <div className="move-menu-wrap" ref={moveMenuRef}>
            <button className="move-menu-button" onClick={() => setMoveMenuOpen((open) => !open)}>
              {moveCount > 1 ? `${moveCount}개 폴더 이동` : "폴더 이동"}
            </button>
            {moveMenuOpen && (
              <div className="move-menu" role="menu" aria-label="폴더 이동">
                <button className="move-tree-name unclassified-move" onClick={() => chooseTopic(null)}>미분류</button>
                <div className="move-tree-list">{moveRoots.map(renderMoveTopic)}</div>
              </div>
            )}
          </div>
          <div className="editor-case-actions">
            <button
              className={`star-button ${selectedCase.important ? "on" : ""}`}
              title={selectedCase.important ? "중요 해제" : "중요 표시"}
              onClick={() => onUpdateCase(selectedCase.id, { important: !selectedCase.important })}
            >
              {selectedCase.important ? "★" : "☆"}
            </button>
            <button className="danger" onClick={requestDelete}>삭제</button>
          </div>
        </div>
      </header>

      <div
        className="editor-columns"
        style={{ gridTemplateColumns: `minmax(240px, ${draftSplitWidth}%) 20px minmax(240px, 1fr)` }}
      >
        <section className="field-group">
          <h2>내 정리</h2>
          <RichEditableField
            label="주요 문구 / 결론 요약"
            value={combinedSummaryHtml}
            collapsed={collapsedFields.includes("summary_html")}
            toolMode={toolMode}
            onExitTool={() => setToolMode(null)}
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
              onExitTool={() => setToolMode(null)}
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
          aria-valuenow={draftSplitWidth}
          onPointerDown={startSplitResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onSaveSplit(Math.max(25, draftSplitWidth - 2));
            if (event.key === "ArrowRight") onSaveSplit(Math.min(75, draftSplitWidth + 2));
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
              onExitTool={() => setToolMode(null)}
              onToggle={() => onToggleField(field)}
              onChange={(value) => onUpdateField(selectedCase.id, field, value)}
            />
          ))}
        </section>
      </div>
      {diagramOpen && <DiagramEditor key={selectedCase.id} title={selectedCase.case_no || '관계도'} value={selectedNotes.diagram} onChange={(diagram) => onUpdateDiagram(selectedCase.id, diagram)} onClose={() => setDiagramOpen(false)} />}
    </main>
  );
}
