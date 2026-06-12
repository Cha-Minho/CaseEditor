import { FormEvent, useMemo, useState } from "react";
import type { CaseItem, Topic } from "../types";

type Props = {
  cases: CaseItem[];
  topics: Topic[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onAddApiCase: (caseNo: string, topicId?: string | null) => Promise<void>;
  onAddBlank: (topicId?: string | null) => void;
};

export function CaseSearchPanel({ cases, topics, selectedCaseId, onSelectCase, onAddApiCase, onAddBlank }: Props) {
  const [query, setQuery] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [showImportant, setShowImportant] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter((item) => {
      if (showImportant && !item.important) return false;
      if (!needle) return true;
      return `${item.title} ${item.case_no}`.toLowerCase().includes(needle);
    });
  }, [cases, query, showImportant]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!caseNo.trim()) return;
    await onAddApiCase(caseNo.trim(), null);
    setCaseNo("");
  }

  return (
    <section className="panel-content">
      <header className="panel-header">
        <h2>검색</h2>
        <button className={showImportant ? "active" : ""} onClick={() => setShowImportant((value) => !value)}>★ 중요</button>
      </header>
      <input className="wide-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="판례명, 사건번호 검색" autoFocus />
      <form className="add-case-form" onSubmit={submit}>
        <input value={caseNo} onChange={(event) => setCaseNo(event.target.value)} placeholder="사건번호 입력" />
        <button type="submit">API 추가</button>
        <button type="button" onClick={() => onAddBlank(null)}>빈 판례</button>
      </form>
      <div className="case-count">{filtered.length}개 판례</div>
      <ul className="search-results">
        {filtered.map((caseItem) => (
          <li key={caseItem.id}>
            <button className={selectedCaseId === caseItem.id ? "selected" : ""} onClick={() => onSelectCase(caseItem.id)}>
              <b>{caseItem.important ? "★" : "☆"}</b>
              <span>{caseItem.title}</span>
              {caseItem.case_no && <small>{caseItem.case_no}</small>}
              {caseItem.api_status === "failed" && <small className="error-text">{caseItem.api_error}</small>}
            </button>
          </li>
        ))}
      </ul>
      <datalist id="topic-list">
        {topics.map((topic) => <option key={topic.id} value={topic.name} />)}
      </datalist>
    </section>
  );
}
