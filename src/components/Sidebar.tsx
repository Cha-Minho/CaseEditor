import { ChangeEvent, DragEvent, FormEvent, PointerEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { CaseItem, CaseNotes, Topic } from "../types";
import { convertOldJson } from "../lib/oldJson";
import type { AppSnapshot } from "../types";
import { readCasePdf, type PdfCaseImport } from "../lib/pdfCase";
import { compareCasesByTitle, compareTopicsByName } from "../lib/sort";

const UNCLASSIFIED_ID = "__unclassified__";

type Marquee = { x: number; y: number; width: number; height: number };
type FolderMenu = { topic: Topic | null; caseIds: string[]; x: number; y: number };

type Props = {
  userId: string;
  topics: Topic[];
  cases: CaseItem[];
  notes: CaseNotes[];
  expandedIds: string[];
  selectedCaseId: string | null;
  selectedCaseIds: string[];
  configured: boolean;
  userEmail?: string;
  onSelectCase: (id: string) => void;
  onSelectCases: (ids: string[]) => void;
  onMoveCases: (ids: string[], topicId: string | null) => void;
  onMoveTopic: (topicId: string, parentId: string | null) => void;
  onToggleTopic: (id: string) => void;
  onAddTopic: (parentId?: string | null) => void;
  onRenameTopic: (id: string, name: string) => void;
  onDeleteTopic: (id: string) => void;
  onAddBlank: () => void;
  onAddApiCase: (caseNo: string) => Promise<void>;
  onAddPdfCases: (pdfCases: PdfCaseImport[]) => Promise<void>;
  onImport: (snapshot: AppSnapshot) => Promise<void>;
  onDeleteCases: (ids: string[]) => void;
  onSignOut: () => void;
};

export function Sidebar(props: Props) {
  const [query, setQuery] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);
  const [dropTopicId, setDropTopicId] = useState<string | null | undefined>(undefined);
  const [topicDropId, setTopicDropId] = useState<string | null | undefined>(undefined);
  const [readingPdf, setReadingPdf] = useState(false);
  const [importantOnly, setImportantOnly] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addingCaseNos, setAddingCaseNos] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [folderMenu, setFolderMenu] = useState<FolderMenu | null>(null);
  const caseListRef = useRef<HTMLElement | null>(null);
  const addDialogRef = useRef<HTMLDialogElement | null>(null);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; base: Set<string> } | null>(null);
  const needle = query.trim().toLowerCase();
  const visibleCases = importantOnly ? props.cases.filter((item) => item.important) : props.cases;
  const notesByCaseId = useMemo(() => new Map(props.notes.map((note) => [note.case_id, note])), [props.notes]);

  const searchResults = useMemo(() => {
    if (!needle) return null;
    return visibleCases.filter((item) => {
      const notes = notesByCaseId.get(item.id);
      return `${item.title} ${item.case_no} ${notes?.tags_html || ""}`.toLowerCase().includes(needle);
    }).sort(compareCasesByTitle);
  }, [needle, notesByCaseId, visibleCases]);

  const roots = props.topics.filter((topic) => !topic.parent_id).sort(compareTopicsByName);
  const unclassified = visibleCases.filter((item) => !item.topic_id).sort(compareCasesByTitle);

  useEffect(() => {
    if (!folderMenu) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!folderMenuRef.current?.contains(event.target as Node)) setFolderMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFolderMenu(null);
    };
    const closeOnViewportChange = () => setFolderMenu(null);
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [folderMenu]);

  useEffect(() => {
    if (addMenuOpen && addDialogRef.current && !addDialogRef.current.open) {
      addDialogRef.current.showModal();
    }
  }, [addMenuOpen]);

  async function submitCaseNo(event: FormEvent) {
    event.preventDefault();
    const values = caseNo.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean);
    if (!values.length || addingCaseNos) return;
    setAddingCaseNos(true);
    try {
      for (const [index, value] of values.entries()) {
        if (index > 0) await new Promise((resolve) => window.setTimeout(resolve, 300));
        await props.onAddApiCase(value);
      }
      setCaseNo("");
      setAddMenuOpen(false);
    } finally {
      setAddingCaseNos(false);
    }
  }

  async function chooseImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const snapshot = convertOldJson(parsed, props.userId);
      if (!snapshot.cases.length && !snapshot.topics.length) {
        window.alert("JSON에서 가져올 판례나 목차를 찾지 못했습니다.");
        return;
      }
      if (window.confirm(`목차 ${snapshot.topics.length}개, 판례 ${snapshot.cases.length}개를 가져올까요?`)) {
        await props.onImport(snapshot);
        setAddMenuOpen(false);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "JSON 파일을 읽지 못했습니다.");
    }
  }

  function renameTopic(topic: Topic) {
    const nextName = window.prompt("폴더 이름", topic.name)?.trim();
    if (nextName && nextName !== topic.name) props.onRenameTopic(topic.id, nextName);
  }

  function deleteTopic(topic: Topic) {
    if (window.confirm(`"${topic.name}" 폴더를 삭제할까요? 안에 있던 판례는 미분류로 이동합니다.`)) {
      props.onDeleteTopic(topic.id);
    }
  }

  async function choosePdfFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setReadingPdf(true);
    try {
      const imported: PdfCaseImport[] = [];
      const failed: string[] = [];
      for (const file of files) {
        try {
          imported.push(await readCasePdf(file));
        } catch (error) {
          failed.push(`${file.name}: ${error instanceof Error ? error.message : "읽지 못했습니다."}`);
        }
      }
      if (imported.length) {
        await props.onAddPdfCases(imported);
        setAddMenuOpen(false);
      }
      if (failed.length) window.alert(failed.join("\n"));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "PDF를 읽지 못했습니다.");
    } finally {
      setReadingPdf(false);
    }
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      props.onSelectCases(Array.from(next));
      return next;
    });
  }

  function caseIdsInTopic(topicId: string) {
    const childMap = new Map<string | null, Topic[]>();
    props.topics.forEach((topic) => {
      const key = topic.parent_id || null;
      childMap.set(key, [...(childMap.get(key) || []), topic]);
    });
    const topicIds = new Set<string>();
    const collect = (id: string) => {
      topicIds.add(id);
      (childMap.get(id) || []).forEach((child) => collect(child.id));
    };
    collect(topicId);
    return visibleCases.filter((item) => item.topic_id && topicIds.has(item.topic_id)).map((item) => item.id);
  }

  function toggleCaseGroup(ids: string[]) {
    if (!ids.length) return;
    setCheckedIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      props.onSelectCases(Array.from(next));
      return next;
    });
  }

  function openFolderMenu(event: ReactMouseEvent, topic: Topic | null, caseIds: string[]) {
    event.preventDefault();
    const menuWidth = 176;
    const menuHeight = topic ? 168 : 48;
    setFolderMenu({
      topic,
      caseIds,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  function deleteChecked() {
    if (!checkedIds.size) return;
    if (window.confirm(`선택한 판례 ${checkedIds.size}개를 삭제할까요?`)) {
      props.onDeleteCases(Array.from(checkedIds));
      setCheckedIds(new Set());
      props.onSelectCases([]);
    }
  }

  function startCaseDrag(event: DragEvent<HTMLButtonElement>, id: string) {
    const ids = checkedIds.has(id) ? Array.from(checkedIds) : [id];
    setDraggedIds(ids);
    props.onSelectCases(ids);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ids.join(","));
  }

  function allowCaseDrop(event: DragEvent<HTMLElement>, topicId: string | null) {
    if (!draggedIds.length) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTopicId(topicId);
  }

  function dropCases(event: DragEvent<HTMLElement>, topicId: string | null) {
    if (!draggedIds.length) return;
    event.preventDefault();
    props.onMoveCases(draggedIds, topicId);
    setDraggedIds([]);
    setDropTopicId(undefined);
  }

  function startTopicDrag(event: DragEvent<HTMLElement>, topicId: string) {
    setDraggedTopicId(topicId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-case-editor-topic", topicId);
  }

  function allowTopicDrop(event: DragEvent<HTMLElement>, topicId: string | null) {
    if (!draggedTopicId || draggedTopicId === topicId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTopicDropId(topicId);
  }

  function dropTopic(event: DragEvent<HTMLElement>, topicId: string | null) {
    if (!draggedTopicId || draggedTopicId === topicId) return;
    event.preventDefault();
    props.onMoveTopic(draggedTopicId, topicId);
    setDraggedTopicId(null);
    setTopicDropId(undefined);
  }

  function startMarquee(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, label")) return;
    const list = caseListRef.current;
    if (!list) return;
    const rect = list.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top + list.scrollTop };
    marqueeStart.current = { ...point, base: event.ctrlKey ? new Set(checkedIds) : new Set() };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function updateMarquee(event: PointerEvent<HTMLElement>) {
    const start = marqueeStart.current;
    const list = caseListRef.current;
    if (!start || !list) return;
    const rect = list.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top + list.scrollTop;
    setMarquee({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) });
  }

  function finishMarquee(event: PointerEvent<HTMLElement>) {
    const start = marqueeStart.current;
    const list = caseListRef.current;
    marqueeStart.current = null;
    if (!start || !list) {
      setMarquee(null);
      return;
    }
    const listRect = list.getBoundingClientRect();
    const endX = event.clientX - listRect.left;
    const endY = event.clientY - listRect.top + list.scrollTop;
    const currentMarquee = {
      x: Math.min(start.x, endX),
      y: Math.min(start.y, endY),
      width: Math.abs(endX - start.x),
      height: Math.abs(endY - start.y)
    };
    setMarquee(null);
    if (currentMarquee.width < 4 && currentMarquee.height < 4) return;
    const selected = new Set(start.base);
    list.querySelectorAll<HTMLElement>("[data-case-id]").forEach((item) => {
      const rect = item.getBoundingClientRect();
      const left = rect.left - listRect.left;
      const top = rect.top - listRect.top + list.scrollTop;
      const intersects = left < currentMarquee.x + currentMarquee.width && left + rect.width > currentMarquee.x
        && top < currentMarquee.y + currentMarquee.height && top + rect.height > currentMarquee.y;
      if (intersects) selected.add(item.dataset.caseId || "");
    });
    selected.delete("");
    const ids = Array.from(selected);
    setCheckedIds(new Set(ids));
    props.onSelectCases(ids);
  }

  function renderCase(caseItem: CaseItem) {
    const checked = checkedIds.has(caseItem.id);
    return (
      <div className="case-row" key={caseItem.id} data-case-id={caseItem.id}>
        <button
          className={`checkbox case-checkbox ${checked ? "on" : ""}`}
          aria-label={`${caseItem.case_no || "사건번호 없음"} 선택`}
          aria-pressed={checked}
          onClick={(event) => {
            event.stopPropagation();
            toggleChecked(caseItem.id);
          }}
        >
          {checked ? "✓" : ""}
        </button>
        <button
        className={`case-item ${props.selectedCaseId === caseItem.id ? "active" : ""} ${checked ? "checked" : ""}`}
        onClick={() => props.onSelectCase(caseItem.id)}
        draggable
        onDragStart={(event) => startCaseDrag(event, caseItem.id)}
        onDragEnd={() => {
          setDraggedIds([]);
          setDropTopicId(undefined);
        }}
      >
        <span className="case-item-title">
          {caseItem.important && <span className="star">★</span>}
          {caseItem.case_no || "사건번호 없음"}
        </span>
      </button>
      </div>
    );
  }

  function renderTopic(topic: Topic): JSX.Element {
    const children = props.topics.filter((item) => item.parent_id === topic.id).sort(compareTopicsByName);
    const topicCases = visibleCases.filter((item) => item.topic_id === topic.id).sort(compareCasesByTitle);
    const open = props.expandedIds.includes(topic.id);
    const allTopicCaseIds = caseIdsInTopic(topic.id);

    return (
      <div className="folder" key={topic.id}>
        <div
          className={`folder-row ${dropTopicId === topic.id ? "drop-target" : ""} ${topicDropId === topic.id ? "topic-drop-target" : ""}`}
          onContextMenu={(event) => openFolderMenu(event, topic, allTopicCaseIds)}
          draggable
          onDragStart={(event) => startTopicDrag(event, topic.id)}
          onDragEnd={() => {
            setDraggedTopicId(null);
            setTopicDropId(undefined);
          }}
          onDragOver={(event) => {
            allowCaseDrop(event, topic.id);
            allowTopicDrop(event, topic.id);
          }}
          onDragLeave={() => {
            setDropTopicId((current) => current === topic.id ? undefined : current);
            setTopicDropId((current) => current === topic.id ? undefined : current);
          }}
          onDrop={(event) => {
            dropCases(event, topic.id);
            dropTopic(event, topic.id);
          }}
        >
          <button className="folder-toggle" onClick={() => props.onToggleTopic(topic.id)}>
            <span className={`chevron ${open ? "open" : ""}`}>▸</span>
            <span className="folder-name">{topic.name}</span>
            <span className="folder-count">{children.length + topicCases.length}</span>
          </button>
        </div>
        {open && (
          <div className="folder-children">
            {topicCases.map(renderCase)}
            {children.map(renderTopic)}
          </div>
        )}
      </div>
    );
  }

  const unclassifiedOpen = props.expandedIds.includes(UNCLASSIFIED_ID);

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <span className="head-actions">
          <button
            className="primary add-case-button"
            aria-haspopup="dialog"
            aria-expanded={addMenuOpen}
            onClick={() => setAddMenuOpen(true)}
          >
            + 판례 추가
          </button>
          <button
            className={`ghost important-filter ${importantOnly ? "select-on" : ""}`}
            title={importantOnly ? "전체 판례 보기" : "중요 판례만 보기"}
            aria-label={importantOnly ? "전체 판례 보기" : "중요 판례만 보기"}
            onClick={() => setImportantOnly((current) => !current)}
          >
            ★
          </button>
        </span>
      </header>

      {checkedIds.size > 0 && (
        <div className="select-bar">
          <span>{checkedIds.size}개 선택됨</span>
          <button className="danger" onClick={deleteChecked}>삭제</button>
        </div>
      )}

      <input
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="사건번호, 태그 검색"
        type="search"
      />

      <nav
        className="case-list"
        ref={caseListRef}
        onPointerDown={startMarquee}
        onPointerMove={updateMarquee}
        onPointerUp={finishMarquee}
        onPointerCancel={() => {
          marqueeStart.current = null;
          setMarquee(null);
        }}
      >
        {searchResults ? (
          <>
            <p className="list-label">{searchResults.length}개 결과</p>
            {searchResults.map(renderCase)}
          </>
        ) : (
          <>
            <div
              className={`folder-root-actions ${topicDropId === null ? "topic-drop-target" : ""}`}
              onDragOver={(event) => allowTopicDrop(event, null)}
              onDragLeave={() => setTopicDropId((current) => current === null ? undefined : current)}
              onDrop={(event) => dropTopic(event, null)}
            >
              <button className="ghost" onClick={() => props.onAddTopic(null)}>+ 폴더</button>
            </div>
            {roots.map(renderTopic)}
            {unclassified.length > 0 && (
              <div className="folder">
                <div
                  className={`folder-row ${dropTopicId === null ? "drop-target" : ""}`}
                  onContextMenu={(event) => openFolderMenu(event, null, unclassified.map((item) => item.id))}
                  onDragOver={(event) => allowCaseDrop(event, null)}
                  onDragLeave={() => setDropTopicId((current) => current === null ? undefined : current)}
                  onDrop={(event) => dropCases(event, null)}
                >
                  <button className="folder-toggle muted" onClick={() => props.onToggleTopic(UNCLASSIFIED_ID)}>
                    <span className={`chevron ${unclassifiedOpen ? "open" : ""}`}>▸</span>
                    <span className="folder-name">미분류</span>
                    <span className="folder-count">{unclassified.length}</span>
                  </button>
                </div>
                {unclassifiedOpen && <div className="folder-children">{unclassified.map(renderCase)}</div>}
              </div>
            )}
            {roots.length === 0 && unclassified.length === 0 && (
              <p className="list-empty">아직 판례가 없습니다.<br />판례 추가 버튼으로 새 판례를 넣어보세요.</p>
            )}
          </>
        )}
        {marquee && <div className="selection-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
      </nav>

      <footer className="sidebar-foot">
        {props.configured && props.userEmail && <div className="account-line">{props.userEmail}</div>}
        <div className="foot-actions">
          {props.configured && <button className="ghost" onClick={props.onSignOut}>로그아웃</button>}
        </div>
      </footer>

      {folderMenu && (
        <div
          ref={folderMenuRef}
          className="folder-context-menu"
          role="menu"
          aria-label={`${folderMenu.topic?.name || "미분류"} 폴더 메뉴`}
          style={{ left: folderMenu.x, top: folderMenu.y }}
        >
          <button
            role="menuitem"
            disabled={!folderMenu.caseIds.length}
            onClick={() => {
              toggleCaseGroup(folderMenu.caseIds);
              setFolderMenu(null);
            }}
          >
            {folderMenu.caseIds.length > 0 && folderMenu.caseIds.every((id) => checkedIds.has(id)) ? "전체 선택 해제" : "전체 선택"}
          </button>
          {folderMenu.topic && (
            <>
              <button role="menuitem" onClick={() => { props.onAddTopic(folderMenu.topic!.id); setFolderMenu(null); }}>하위 폴더 추가</button>
              <button role="menuitem" onClick={() => { renameTopic(folderMenu.topic!); setFolderMenu(null); }}>이름 변경</button>
              <button role="menuitem" className="danger-text" onClick={() => { deleteTopic(folderMenu.topic!); setFolderMenu(null); }}>폴더 삭제</button>
            </>
          )}
        </div>
      )}

      {addMenuOpen && createPortal(
        <dialog
          ref={addDialogRef}
          className="case-add-dialog"
          aria-labelledby="case-add-title"
          onCancel={() => setAddMenuOpen(false)}
        >
          <header className="case-add-heading">
            <h2 id="case-add-title">판례 추가</h2>
            <button className="icon-button" type="button" title="닫기" aria-label="닫기" onClick={() => setAddMenuOpen(false)}><X size={20} /></button>
          </header>
          <form className="case-add-section case-number-form" onSubmit={submitCaseNo}>
            <label htmlFor="case-number-list">사건번호</label>
            <textarea
              id="case-number-list"
              value={caseNo}
              onChange={(event) => setCaseNo(event.target.value)}
              placeholder="2016도348, 부산고등법원 2020노570"
              rows={4}
              autoFocus
              disabled={addingCaseNos}
            />
            <button type="submit" className="primary" disabled={!caseNo.trim() || addingCaseNos}>
              {addingCaseNos ? "불러오는 중" : "사건번호로 불러오기"}
            </button>
          </form>
          <section className="case-add-section" aria-label="파일에서 추가">
            <h3>파일</h3>
            <div className="case-add-actions">
              <label className={`ghost file-button ${readingPdf ? "is-loading" : ""}`}>
                {readingPdf ? "PDF 읽는 중" : "PDF 판결문"}
                <input type="file" accept="application/pdf,.pdf" multiple onChange={choosePdfFile} disabled={readingPdf} />
              </label>
              <label className="ghost file-button">
                JSON 가져오기
                <input type="file" accept="application/json,.json" onChange={chooseImportFile} />
              </label>
            </div>
          </section>
          <section className="case-add-section" aria-label="직접 작성">
            <h3>직접 작성</h3>
            <button className="ghost" type="button" onClick={() => {
              props.onAddBlank();
              setAddMenuOpen(false);
            }}>빈 판례 만들기</button>
          </section>
        </dialog>,
        document.body
      )}
    </aside>
  );
}
