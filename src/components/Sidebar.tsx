import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type { CaseItem, Topic } from "../types";
import { convertOldJson } from "../lib/oldJson";
import type { AppSnapshot } from "../types";

const UNCLASSIFIED_ID = "__unclassified__";

type Props = {
  userId: string;
  topics: Topic[];
  cases: CaseItem[];
  expandedIds: string[];
  selectedCaseId: string | null;
  syncMessage: string;
  configured: boolean;
  userEmail?: string;
  onSelectCase: (id: string) => void;
  onToggleTopic: (id: string) => void;
  onAddTopic: (parentId?: string | null) => void;
  onRenameTopic: (id: string, name: string) => void;
  onDeleteTopic: (id: string) => void;
  onAddBlank: () => void;
  onAddApiCase: (caseNo: string) => Promise<void>;
  onImport: (snapshot: AppSnapshot) => Promise<void>;
  onSignOut: () => void;
};

export function Sidebar(props: Props) {
  const [query, setQuery] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const needle = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!needle) return null;
    return props.cases.filter((item) => `${item.title} ${item.case_no}`.toLowerCase().includes(needle));
  }, [needle, props.cases]);

  const roots = props.topics.filter((topic) => !topic.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const unclassified = props.cases.filter((item) => !item.topic_id);

  async function submitCaseNo(event: FormEvent) {
    event.preventDefault();
    const value = caseNo.trim();
    if (!value) return;
    setCaseNo("");
    await props.onAddApiCase(value);
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

  function renderCase(caseItem: CaseItem) {
    return (
      <button
        key={caseItem.id}
        className={`case-item ${props.selectedCaseId === caseItem.id ? "active" : ""}`}
        onClick={() => props.onSelectCase(caseItem.id)}
      >
        <span className="case-item-title">
          {caseItem.important && <span className="star">★</span>}
          {caseItem.title}
        </span>
        {caseItem.case_no && <span className="case-item-no">{caseItem.case_no}</span>}
      </button>
    );
  }

  function renderTopic(topic: Topic): JSX.Element {
    const children = props.topics.filter((item) => item.parent_id === topic.id).sort((a, b) => a.sort_order - b.sort_order);
    const topicCases = props.cases.filter((item) => item.topic_id === topic.id);
    const open = props.expandedIds.includes(topic.id);

    return (
      <div className="folder" key={topic.id}>
        <div className="folder-row">
          <button className="folder-toggle" onClick={() => props.onToggleTopic(topic.id)}>
            <span className={`chevron ${open ? "open" : ""}`}>▸</span>
            <span className="folder-name">{topic.name}</span>
            <span className="folder-count">{children.length + topicCases.length}</span>
          </button>
          <span className="folder-actions">
            <button title="하위 폴더 추가" onClick={() => props.onAddTopic(topic.id)}>+</button>
            <button title="이름 변경" onClick={() => renameTopic(topic)}>✎</button>
            <button title="폴더 삭제" onClick={() => deleteTopic(topic)}>×</button>
          </span>
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
        <h1>판례 정리함</h1>
        <button className="ghost" title="폴더 추가" onClick={() => props.onAddTopic(null)}>+ 폴더</button>
      </header>

      <input
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="판례명, 사건번호 검색"
        type="search"
      />

      <form className="add-form" onSubmit={submitCaseNo}>
        <input
          value={caseNo}
          onChange={(event) => setCaseNo(event.target.value)}
          placeholder="사건번호로 판례 추가"
        />
        <button type="submit" className="primary" disabled={!caseNo.trim()}>추가</button>
      </form>
      <button className="ghost blank-case" onClick={props.onAddBlank}>+ 빈 판례</button>

      <nav className="case-list">
        {searchResults ? (
          <>
            <p className="list-label">{searchResults.length}개 결과</p>
            {searchResults.map(renderCase)}
          </>
        ) : (
          <>
            {roots.map(renderTopic)}
            {unclassified.length > 0 && (
              <div className="folder">
                <div className="folder-row">
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
              <p className="list-empty">아직 판례가 없습니다.<br />위에서 사건번호로 추가하거나 빈 판례를 만들어보세요.</p>
            )}
          </>
        )}
      </nav>

      <footer className="sidebar-foot">
        <div className="sync-line">
          <span className="sync-dot" />
          <span className="sync-text">{props.syncMessage}</span>
        </div>
        {props.configured && props.userEmail && <div className="account-line">{props.userEmail}</div>}
        <div className="foot-actions">
          <label className="ghost file-button">
            JSON 가져오기
            <input type="file" accept="application/json,.json" onChange={chooseImportFile} />
          </label>
          {props.configured && <button className="ghost" onClick={props.onSignOut}>로그아웃</button>}
        </div>
      </footer>
    </aside>
  );
}
