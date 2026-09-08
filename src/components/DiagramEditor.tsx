import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, type Node, type Edge, type ReactFlowInstance } from '@xyflow/react';
import { UserPlus, SquarePlus, Undo2, Redo2, Trash2, WandSparkles, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { CaseNotes } from '../types';
import type { LegalGraph } from '../types';
import { generateLegalGraph } from '../lib/legalGraphApi';
import { legalGraphToDiagram } from '../lib/plotGraph';

type Graph = NonNullable<CaseNotes['diagram']>;
type Props = { title: string; sourceHtml: string; value: CaseNotes['diagram']; onChange: (graph: Graph) => void; onClose: () => void };

export function DiagramEditor({ title, sourceHtml, value, onChange, onClose }: Props) {
  const [graph, setGraph] = useState<Graph>(() => value || { nodes: [], edges: [] });
  const current = useRef(graph);
  const undo = useRef<Graph[]>([]);
  const redo = useRef<Graph[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const flow = useRef<ReactFlowInstance | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [label, setLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [draft, setDraft] = useState<LegalGraph | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(0);

  const timeline = useMemo(() => [...(graph.legalGraph?.events || [])].sort((a, b) => (a.date || '').localeCompare(b.date || '')), [graph.legalGraph]);
  const activeEvent = timeline[timelineIndex];
  const visibleEdges = useMemo(() => {
    if (!activeEvent?.date) return graph.edges;
    return graph.edges.map(edge => {
      const relation = edge.data as LegalGraph['relations'][number] | undefined;
      const future = Boolean(relation?.date && relation.date > activeEvent.date!);
      return future ? { ...edge, style: { ...edge.style, opacity: 0.14 } } : edge;
    });
  }, [activeEvent?.date, graph.edges]);

  function display(next: Graph) { current.current = next; setGraph(next); }
  function checkpoint() { undo.current = [...undo.current.slice(-49), structuredClone(current.current)]; redo.current = []; }
  function save(next: Graph) { display(next); callback.current(next); }
  function change(next: Graph) { checkpoint(); save(next); }
  function travel(back: boolean) {
    const source = back ? undo : redo;
    const target = back ? redo : undo;
    const next = source.current.pop();
    if (!next) return;
    target.current.push(structuredClone(current.current));
    setSelected(null); save(next);
  }
  useEffect(() => {
    dialog.current?.showModal();
    const observer = new ResizeObserver(() => requestAnimationFrame(() => flow.current?.fitView({ padding: 0.3, maxZoom: 1.3 })));
    if (dialog.current) observer.observe(dialog.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setTimelineIndex(Math.max(0, timeline.length - 1)), [graph.legalGraph, timeline.length]);

  function add(kind: 'person' | 'object') {
    const node: Node = { id: crypto.randomUUID(), position: { x: 80 + (graph.nodes.length % 4) * 190, y: 80 + Math.floor(graph.nodes.length / 4) * 130 }, data: { label: kind === 'person' ? '당사자' : '목적물' }, className: kind === 'person' ? 'diagram-person' : 'diagram-object' };
    change({ ...graph, nodes: [...graph.nodes, node] });
    setSelected({ kind: 'node', id: node.id }); setLabel(String(node.data.label));
  }
  function rename() {
    if (!selected) return;
    const text = label.trim();
    const existing = selected.kind === 'node' ? current.current.nodes.find(n => n.id === selected.id)?.data.label : current.current.edges.find(e => e.id === selected.id)?.label;
    if (existing === text) return;
    change(selected.kind === 'node' ? { ...current.current, nodes: current.current.nodes.map(n => n.id === selected.id ? { ...n, data: { ...n.data, label: text } } : n) } : { ...current.current, edges: current.current.edges.map(e => e.id === selected.id ? { ...e, label: text } : e) });
  }
  function remove() {
    if (!selected) return;
    change({ ...graph, nodes: graph.nodes.filter(n => selected.kind !== 'node' || n.id !== selected.id), edges: graph.edges.filter(e => selected.kind === 'edge' ? e.id !== selected.id : e.source !== selected.id && e.target !== selected.id) });
    setSelected(null);
  }

  async function createAiDraft() {
    setGenerating(true);
    setGenerationError('');
    try {
      setDraft(await generateLegalGraph(sourceHtml));
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '관계도 초안을 만들지 못했습니다.');
    } finally {
      setGenerating(false);
    }
  }

  function applyAiDraft() {
    if (!draft) return;
    change(legalGraphToDiagram(draft));
    setDraft(null);
    requestAnimationFrame(() => flow.current?.fitView({ padding: 0.3, maxZoom: 1.2 }));
  }

  const selectedEdge = selected?.kind === 'edge' ? graph.edges.find(edge => edge.id === selected.id) : null;
  const selectedRelation = selectedEdge?.data as LegalGraph['relations'][number] | undefined;
  const reviewCount = draft?.relations.filter(relation => relation.status !== 'recognized').length || 0;
  return createPortal(<dialog ref={dialog} className="diagram-dialog" aria-label="판례 관계도" onCancel={onClose} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,textarea')) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); travel(event.key.toLowerCase() === 'z' && !event.shiftKey); }
  }}>
    <header className="diagram-heading"><strong>{title} · 관계도</strong><button aria-label="관계도 닫기" title="닫기 (Esc)" onClick={onClose}><X size={20} /></button></header>
    <div className="diagram-toolbar">
      <button className="diagram-ai-button" title="판례 원문에서 AI 관계도 초안 만들기" disabled={generating || !sourceHtml.trim()} onClick={createAiDraft}><WandSparkles size={18} /><span>{generating ? '분석 중' : 'AI 초안'}</span></button>
      <button title="당사자 추가" onClick={() => add('person')}><UserPlus size={18} /><span>당사자</span></button>
      <button title="목적물 추가" onClick={() => add('object')}><SquarePlus size={18} /><span>목적물</span></button>
      <button title="실행 취소 (Ctrl+Z)" aria-label="실행 취소" disabled={!undo.current.length} onClick={() => travel(true)}><Undo2 size={18} /></button>
      <button title="다시 실행 (Ctrl+Y)" aria-label="다시 실행" disabled={!redo.current.length} onClick={() => travel(false)}><Redo2 size={18} /></button>
      <button title="선택 삭제" aria-label="선택 삭제" disabled={!selected} onClick={remove}><Trash2 size={18} /></button>
      {selected && <input aria-label="선택 항목 이름" value={label} onChange={event => setLabel(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />}
    </div>
    {generationError && <div className="diagram-generation-error" role="alert">{generationError}<button onClick={() => setGenerationError('')}>닫기</button></div>}
    {draft && <div className="diagram-draft-review">
      <div><strong>AI 초안</strong><span>당사자 {draft.parties.length} · 목적물 {draft.objects.length} · 관계 {draft.relations.length} · 사건 {draft.events.length}</span>{reviewCount > 0 && <span>주장·분쟁·절차 {reviewCount}개 포함</span>}</div>
      <p>AI가 추출한 초안입니다. 적용한 뒤 각 관계의 근거와 인정 여부를 확인하세요.{graph.nodes.length ? ' 적용하면 현재 관계도를 교체합니다.' : ''}</p>
      <span className="diagram-review-actions"><button onClick={() => setDraft(null)}>취소</button><button className="primary" onClick={applyAiDraft}>관계도에 적용</button></span>
    </div>}
    {selectedRelation?.evidence && <div className="diagram-evidence"><span className={`relation-status status-${selectedRelation.status}`}>{selectedRelation.status === 'recognized' ? '인정 사실' : selectedRelation.status === 'alleged' ? '당사자 주장' : selectedRelation.status === 'disputed' ? '다툼 있음' : '소송 경과'}</span><span>{selectedRelation.evidence}</span><small>{Math.round((selectedRelation.confidence || 0) * 100)}%</small></div>}
    <div className="diagram-canvas"><ReactFlow nodes={graph.nodes} edges={visibleEdges} onInit={instance => { flow.current = instance; requestAnimationFrame(() => instance.fitView({ padding: 0.3, maxZoom: 1.3 })); }}
      onNodesChange={changes => display({ ...current.current, nodes: applyNodeChanges(changes, current.current.nodes) })}
      onEdgesChange={changes => display({ ...current.current, edges: applyEdgeChanges(changes, current.current.edges) })}
      onNodeDragStart={checkpoint} onNodeDragStop={() => save(current.current)}
      onConnect={connection => change({ ...current.current, edges: addEdge({ ...connection, id: crypto.randomUUID(), label: '관계', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, current.current.edges) })}
      onNodeClick={(_, node) => { setSelected({ kind: 'node', id: node.id }); setLabel(String(node.data.label || '')); }}
      onEdgeClick={(_, edge) => { setSelected({ kind: 'edge', id: edge.id }); setLabel(String(edge.label || '')); }}
      onPaneClick={() => setSelected(null)} deleteKeyCode={null} fitView minZoom={0.2} maxZoom={2.5}>
      <Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable />
    </ReactFlow></div>
    {timeline.length > 0 && <footer className="diagram-timeline">
      <strong>사건 흐름</strong>
      {timeline.length > 1 && <input aria-label="사건 흐름 시점" type="range" min="0" max={timeline.length - 1} value={timelineIndex} onChange={event => setTimelineIndex(Number(event.target.value))} />}
      <span>{activeEvent?.date || `${timelineIndex + 1}/${timeline.length}`}</span>
      <p>{activeEvent?.text}</p>
    </footer>}
  </dialog>, document.body);
}
