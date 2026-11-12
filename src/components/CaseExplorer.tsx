import { useRef, useState, type MouseEvent, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Scissors, ClipboardPaste, FolderPlus, Folder, FileText, Home, CheckSquare } from 'lucide-react';
import type { CaseItem, Topic } from '../types';
import { compareCasesByTitle, compareTopicsByName } from '../lib/sort';

const ROOT = '__root__';
const UNCLASSIFIED = '__unclassified__';
type Props = {
  topics: Topic[];
  cases: CaseItem[];
  results: CaseItem[] | null;
  checked: Set<string>;
  onChecked: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onMoveCases: (ids: string[], topic: string | null) => void;
  onMoveTopic: (id: string, parent: string | null) => void;
  onAddTopic: (parent?: string | null) => void;
  onNavigate: () => void;
  onFolderMenu: (event: MouseEvent, topic: Topic | null, ids: string[]) => void;
};
type Transfer = { cases: string[] } | { topic: string };

export function CaseExplorer(props: Props) {
  const [history, setHistory] = useState([ROOT]);
  const [index, setIndex] = useState(0);
  const [cut, setCut] = useState<Transfer | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const current = history[index];
  const byId = new Map(props.topics.map(t => [t.id, t]));
  const location = current === ROOT || current === UNCLASSIFIED || byId.has(current) ? current : ROOT;
  const parent = location === UNCLASSIFIED ? ROOT : byId.get(location)?.parent_id || ROOT;
  const folders = props.topics.filter(t => t.parent_id === (location === ROOT ? null : location)).sort(compareTopicsByName);
  const cases = props.results || props.cases.filter(c => location === UNCLASSIFIED ? !c.topic_id : c.topic_id === location).sort(compareCasesByTitle);
  const breadcrumbs: Topic[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(location);
  while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); breadcrumbs.unshift(cursor); cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined; }

  function navigate(id: string) {
    props.onNavigate();
    if (id === location) return;
    setHistory([...history.slice(0, index + 1), id]); setIndex(index + 1);
    props.onChecked([]); anchor.current = null; setSelectedFolder(null);
  }
  function step(next: number) { props.onNavigate(); setIndex(next); props.onChecked([]); anchor.current = null; setSelectedFolder(null); }
  function select(event: MouseEvent, id: string) {
    setSelectedFolder(null);
    const next = new Set(event.ctrlKey || event.metaKey || event.shiftKey ? props.checked : []);
    const start = cases.findIndex(c => c.id === anchor.current), end = cases.findIndex(c => c.id === id);
    if (event.shiftKey && start >= 0 && end >= 0) cases.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(c => next.add(c.id));
    else if ((event.ctrlKey || event.metaKey) && next.has(id)) next.delete(id);
    else next.add(id);
    if (!event.shiftKey) anchor.current = id;
    props.onChecked([...next]);
  }
  function open(id: string) { props.onOpen(id); window.dispatchEvent(new Event('case-editor:open-case')); }
  function move(data: Transfer, destination: string) {
    if ('cases' in data) {
      if (destination === ROOT) return;
      const ids = data.cases.filter(id => props.cases.some(c => c.id === id));
      if (ids.length) props.onMoveCases(ids, destination === UNCLASSIFIED ? null : destination);
    } else if (destination !== UNCLASSIFIED) {
      let t = byId.get(destination);
      const visited = new Set<string>();
      while (t && !visited.has(t.id)) { if (t.id === data.topic) return; visited.add(t.id); t = t.parent_id ? byId.get(t.parent_id) : undefined; }
      props.onMoveTopic(data.topic, destination === ROOT ? null : destination);
    }
    props.onChecked([]);
  }
  function startDrag(event: DragEvent, data: Transfer) {
    event.dataTransfer.setData('application/x-case-explorer', JSON.stringify(data));
    event.dataTransfer.effectAllowed = 'move';
  }
  function dropHandlers(id: string) {
    return {
      onDragOver: (event: DragEvent) => {
        if (!event.dataTransfer.types.includes('application/x-case-explorer')) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropTarget(id);
      },
      onDragLeave: () => setDropTarget(null),
      onDrop: (event: DragEvent) => {
        event.preventDefault(); event.stopPropagation(); setDropTarget(null);
        try { move(JSON.parse(event.dataTransfer.getData('application/x-case-explorer')), id); } catch { /* Ignore unrelated or malformed drag data. */ }
      },
    };
  }
  function descendantCases(id: string) {
    const ids = new Set([id]); let changed = true;
    while (changed) { changed = false; for (const t of props.topics) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); changed = true; } }
    return props.cases.filter(c => c.topic_id && ids.has(c.topic_id)).map(c => c.id);
  }
  const allChecked = cases.length > 0 && cases.every(c => props.checked.has(c.id));
  const canPaste = cut && (location !== ROOT || 'topic' in cut) && (location !== UNCLASSIFIED || 'cases' in cut);
  return <section className="case-explorer" aria-label="판례 탐색기">
    <div className="explorer-toolbar">
      <button title="뒤로" aria-label="뒤로" disabled={index === 0} onClick={() => step(index - 1)}><ArrowLeft size={18}/></button>
      <button title="앞으로" aria-label="앞으로" disabled={index === history.length - 1} onClick={() => step(index + 1)}><ArrowRight size={18}/></button>
      <button title="상위 폴더" aria-label="상위 폴더" disabled={location === ROOT} onClick={() => navigate(parent)}><ArrowUp size={18}/></button>
      <span className="explorer-tool-divider"/>
      <button title="새 폴더" aria-label="새 폴더" disabled={location === UNCLASSIFIED} onClick={() => props.onAddTopic(location === ROOT ? null : location)}><FolderPlus size={18}/></button>
      <button title="전체 선택 / 해제" aria-label="전체 선택 / 해제" disabled={!cases.length} onClick={() => props.onChecked(allChecked ? [] : cases.map(c => c.id))}><CheckSquare size={18}/></button>
      <button title="잘라내기" aria-label="잘라내기" disabled={!props.checked.size && !selectedFolder} onClick={() => setCut(props.checked.size ? {cases: [...props.checked]} : {topic: selectedFolder!})}><Scissors size={18}/></button>
      <button title="이동하여 붙여넣기" aria-label="이동하여 붙여넣기" disabled={!canPaste} onClick={() => { if (cut) { move(cut, location); setCut(null); } }}><ClipboardPaste size={18}/></button>
    </div>
    <nav className="explorer-path" aria-label="현재 경로">
      <button title="전체 폴더" aria-label="전체 폴더" onClick={() => navigate(ROOT)} {...dropHandlers(ROOT)}><Home size={16}/></button>
      {breadcrumbs.map(t => <span key={t.id}><span aria-hidden="true">›</span><button onClick={() => navigate(t.id)} {...dropHandlers(t.id)} title={t.name}>{t.name}</button></span>)}
      {location === UNCLASSIFIED && <span>› 미분류</span>}
    </nav>
    <div className={`explorer-content ${dropTarget === location ? 'drop-target' : ''}`} {...dropHandlers(location)}>
      {props.results && <p className="list-label">검색 결과 {cases.length}개</p>}
      {!props.results && location !== UNCLASSIFIED && folders.map(t => <div className={`explorer-folder ${selectedFolder === t.id ? 'is-selected' : ''} ${dropTarget === t.id ? 'drop-target' : ''} ${cut && 'topic' in cut && cut.topic === t.id ? 'is-cut' : ''}`} key={t.id} draggable onDragStart={e => startDrag(e, {topic: t.id})} {...dropHandlers(t.id)} onContextMenu={e => props.onFolderMenu(e, t, descendantCases(t.id))}>
        <button className="explorer-folder-open" onClick={() => { if (window.matchMedia('(pointer: coarse)').matches) navigate(t.id); else { setSelectedFolder(t.id); props.onChecked([]); } }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); navigate(t.id); } }} onDoubleClick={() => navigate(t.id)}><Folder size={20}/><span>{t.name}</span><small>{props.topics.filter(c => c.parent_id === t.id).length + props.cases.filter(c => c.topic_id === t.id).length}</small></button>
      </div>)}
      {!props.results && location === ROOT && <div className={`explorer-folder ${dropTarget === UNCLASSIFIED ? 'drop-target' : ''}`} {...dropHandlers(UNCLASSIFIED)} onContextMenu={e => props.onFolderMenu(e, null, props.cases.filter(c => !c.topic_id).map(c => c.id))}><button className="explorer-folder-open" onClick={() => { if (window.matchMedia('(pointer: coarse)').matches) navigate(UNCLASSIFIED); }} onDoubleClick={() => navigate(UNCLASSIFIED)}><Folder size={20}/><span>미분류</span><small>{props.cases.filter(c => !c.topic_id).length}</small></button></div>}
      {cases.map(c => <div key={c.id} data-case-id={c.id} className={`case-row explorer-case-row ${props.checked.has(c.id) ? 'is-selected' : ''} ${cut && 'cases' in cut && cut.cases.includes(c.id) ? 'is-cut' : ''}`}>
        <button className={`checkbox case-checkbox ${props.checked.has(c.id) ? 'on' : ''}`} aria-label={`${c.case_no || '사건번호 없음'} 선택`} aria-pressed={props.checked.has(c.id)} onClick={() => { const next=new Set(props.checked); next.has(c.id) ? next.delete(c.id) : next.add(c.id); anchor.current=c.id; props.onChecked([...next]); }}>{props.checked.has(c.id) ? '✓' : ''}</button>
        <button className="case-item explorer-case" draggable onDragStart={e => startDrag(e,{cases:props.checked.has(c.id) ? [...props.checked] : [c.id]})} onClick={e => { select(e,c.id); if (window.matchMedia('(pointer: coarse)').matches) open(c.id); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); open(c.id); } }} onDoubleClick={() => open(c.id)} title={c.case_no || c.title}><FileText size={18}/><span>{c.important && <span className="star">★</span>}{c.case_no || '사건번호 없음'}</span></button>
      </div>)}
      {!props.results && !cases.length && (location === UNCLASSIFIED || !folders.length && location !== ROOT) && <p className="list-empty">비어 있는 폴더</p>}
    </div>
    <div className="explorer-status">{!props.results && location !== UNCLASSIFIED ? `${folders.length + (location === ROOT ? 1 : 0)}개 폴더 · ` : ''}{cases.length}개 판례{props.checked.size ? ` · ${props.checked.size}개 선택` : ''}</div>
  </section>;
}
