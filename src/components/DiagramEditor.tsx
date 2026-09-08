import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Controls, BaseEdge, EdgeLabelRenderer, Handle, Position, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, type Node, type Edge, type EdgeProps, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { UserPlus, SquarePlus, Undo2, Redo2, Trash2, WandSparkles, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { CaseNotes } from '../types';
import type { LegalGraph } from '../types';
import { generateLegalGraph } from '../lib/legalGraphApi';
import { computePropertyArcs, dateKey, declutterEdgeLabels, legalGraphToDiagram, propertyArcIsActive } from '../lib/plotGraph';

type Graph = NonNullable<CaseNotes['diagram']>;
type Props = { title: string; sourceHtml: string; value: CaseNotes['diagram']; onChange: (graph: Graph) => void; onClose: () => void };

function PlotPartyNode({ data, selected }: NodeProps) {
  return <div className={`plot-party-node${selected ? ' selected' : ''}${data.future ? ' future' : ''}`} title={String(data.role || '')}>
    <Handle type="target" position={Position.Top} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    <span>{String(data.label || '')}</span>
    <Handle type="source" position={Position.Bottom} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
  </div>;
}

function PlotObjectNode({ data, selected }: NodeProps) {
  return <div className={`plot-object-node${selected ? ' selected' : ''}${data.future ? ' future' : ''}`}>
    <Handle type="target" position={Position.Top} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    <span>{String(data.label || '')}</span>
    <Handle type="source" position={Position.Bottom} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
  </div>;
}

function PlotEdge({ id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, style, label, data, selected }: EdgeProps) {
  const relation = data as (Partial<LegalGraph['relations'][number]> & { derivedArc?: boolean; role?: string; future?: boolean; pairIndex?: number; pairTotal?: number; centerX?: number; centerY?: number; labelX?: number; labelY?: number }) | undefined;
  let path: string;
  let labelX: number;
  let labelY: number;
  if (source === target) {
    path = `M ${sourceX} ${sourceY} C ${sourceX + 72} ${sourceY - 78}, ${targetX - 72} ${targetY - 78}, ${targetX} ${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = Math.min(sourceY, targetY) - 64;
  } else {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.hypot(dx, dy) || 1;
    let normalX = -dy / length;
    let normalY = dx / length;
    const middleX = (sourceX + targetX) / 2;
    const middleY = (sourceY + targetY) / 2;
    if ((middleX - (relation?.centerX || 320)) * normalX + (middleY - (relation?.centerY || 240)) * normalY < 0) {
      normalX *= -1;
      normalY *= -1;
    }
    const total = relation?.pairTotal || 1;
    const index = relation?.pairIndex || 0;
    const step = total > 4 ? 26 : total > 2 ? 32 : 36;
    const offset = index * step - (total - 1) * step * 0.3;
    const controlX = middleX + normalX * offset * 2;
    const controlY = middleY + normalY * offset * 2;
    const sourceRadius = relation?.derivedArc ? 42 : 34;
    const targetRadius = 38;
    const sourceVectorX = controlX - sourceX;
    const sourceVectorY = controlY - sourceY;
    const sourceVectorLength = Math.hypot(sourceVectorX, sourceVectorY) || 1;
    const targetVectorX = controlX - targetX;
    const targetVectorY = controlY - targetY;
    const targetVectorLength = Math.hypot(targetVectorX, targetVectorY) || 1;
    const startX = sourceX + sourceVectorX / sourceVectorLength * sourceRadius;
    const startY = sourceY + sourceVectorY / sourceVectorLength * sourceRadius;
    const endX = targetX + targetVectorX / targetVectorLength * targetRadius;
    const endY = targetY + targetVectorY / targetVectorLength * targetRadius;
    path = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
    labelX = (startX + 2 * controlX + endX) / 4;
    labelY = (startY + 2 * controlY + endY) / 4;
  }
  const anchorX = labelX;
  const anchorY = labelY;
  labelX = relation?.labelX ?? labelX;
  labelY = relation?.labelY ?? labelY;
  const hasLeader = Math.hypot(labelX - anchorX, labelY - anchorY) > 18;
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
    {hasLeader && <path className={`plot-label-leader${relation?.future ? ' future' : ''}`} d={`M ${anchorX} ${anchorY} L ${labelX} ${labelY}`} />}
    <EdgeLabelRenderer><div className={`plot-edge-chip kind-${relation?.kind || 'other'} status-${relation?.status || 'recognized'}${relation?.derivedArc ? ' property' : ''}${relation?.future ? ' future' : ''}${selected ? ' selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(var(--diagram-inverse-zoom, 1))` }}>
      {relation?.date && <small>{relation.date}</small>}
      <span>{String(label || relation?.role || '')}</span>
    </div></EdgeLabelRenderer>
  </>;
}

const nodeTypes = { plotParty: PlotPartyNode, plotObject: PlotObjectNode };
const edgeTypes = { plotEdge: PlotEdge };

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
  const [viewportZoom, setViewportZoom] = useState(1);

  const timeline = useMemo(() => (graph.legalGraph?.events || []).map((event, index) => ({ event, index })).sort((left, right) => {
    const leftSequence = left.event.sequence || left.index + 1;
    const rightSequence = right.event.sequence || right.index + 1;
    return leftSequence - rightSequence || dateKey(left.event.date) - dateKey(right.event.date);
  }).map(item => item.event), [graph.legalGraph]);
  const atEnd = timelineIndex >= timeline.length - 1;
  const cutoffSequence = timelineIndex < 0 ? 0 : timeline[timelineIndex]?.sequence || timelineIndex + 1;
  const cutoffDate = atEnd ? Infinity : timeline.slice(0, timelineIndex + 1).reduce((latest, event) => Math.max(latest, dateKey(event.date)), 0);
  const relationIsFuture = (relation?: Partial<LegalGraph['relations'][number]>) => {
    if (!timeline.length || atEnd) return false;
    if (relation?.sequence) return relation.sequence > cutoffSequence;
    const relationDate = dateKey(relation?.date);
    if (relationDate) return relationDate > cutoffDate;
    return true;
  };
  const renderNodes = useMemo<Node[]>(() => graph.nodes.map(node => {
    const related = graph.edges.filter(edge => edge.source === node.id || edge.target === node.id || (edge.data as Partial<LegalGraph['relations'][number]> | undefined)?.objectId === node.id);
    const future = related.length > 0 && related.every(edge => relationIsFuture(edge.data as Partial<LegalGraph['relations'][number]> | undefined));
    return { ...node, type: node.className?.includes('diagram-object') ? 'plotObject' : 'plotParty', data: { ...node.data, future } };
  }), [atEnd, cutoffDate, cutoffSequence, graph.edges, graph.nodes, timeline.length]);
  const visibleEdges = useMemo<Edge[]>(() => {
    const relations = graph.edges.map(edge => {
      const relation = edge.data as LegalGraph['relations'][number] | undefined;
      const future = relationIsFuture(relation);
      return { ...edge, type: 'plotEdge', style: { ...edge.style, opacity: future ? 0.09 : 1 }, data: { ...edge.data, future } };
    });
    const arcs = computePropertyArcs(graph.legalGraph).map(arc => {
      const active = propertyArcIsActive(arc, cutoffSequence, cutoffDate, atEnd);
      const kind = arc.role === '소유' ? 'own' : arc.role === '점유' ? 'poss' : 'lien';
      return { id: arc.id, source: arc.thing, target: arc.party, type: 'plotEdge', label: arc.role, selectable: false, focusable: false, className: `diagram-edge property-arc arc-${kind}`, style: { opacity: active ? 0.88 : 0.07 }, data: { derivedArc: true, role: arc.role, kind: 'status', status: 'recognized', future: !active } };
    });
    return declutterEdgeLabels([...relations, ...arcs] as Edge[], graph.nodes, 1 / viewportZoom);
  }, [atEnd, cutoffDate, cutoffSequence, graph.edges, graph.legalGraph, graph.nodes, timeline.length, viewportZoom]);

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
    const observer = new ResizeObserver(() => requestAnimationFrame(() => flow.current?.fitView({ padding: 0.18, maxZoom: 2 })));
    if (dialog.current) observer.observe(dialog.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setTimelineIndex(timeline.length - 1), [graph.legalGraph, timeline.length]);

  function add(kind: 'person' | 'object') {
    const node: Node = { id: crypto.randomUUID(), type: kind === 'person' ? 'plotParty' : 'plotObject', position: { x: 80 + (graph.nodes.length % 4) * 190, y: 80 + Math.floor(graph.nodes.length / 4) * 130 }, data: { label: kind === 'person' ? '당사자' : '목적물' }, className: kind === 'person' ? 'diagram-person' : 'diagram-object' };
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
    requestAnimationFrame(() => flow.current?.fitView({ padding: 0.18, maxZoom: 2 }));
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
      {draft.events.length > 0 && <details className="diagram-draft-events"><summary>사건 순서 확인</summary><ol>{draft.events.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).slice(0, 8).map(event => <li key={event.id}><b>{event.date || '날짜 미상'}</b><span>{event.text}</span></li>)}</ol></details>}
      <span className="diagram-review-actions"><button onClick={() => setDraft(null)}>취소</button><button className="primary" onClick={applyAiDraft}>관계도에 적용</button></span>
    </div>}
    {selectedRelation?.evidence && <div className="diagram-evidence"><span className={`relation-status status-${selectedRelation.status}`}>{selectedRelation.status === 'recognized' ? '인정 사실' : selectedRelation.status === 'alleged' ? '당사자 주장' : selectedRelation.status === 'disputed' ? '다툼 있음' : '소송 경과'}</span><span>{selectedRelation.evidence}</span><small>{Math.round((selectedRelation.confidence || 0) * 100)}%</small></div>}
    <div className={`diagram-workspace${timeline.length ? ' has-timeline' : ''}`}>
    {timeline.length > 0 && <aside className="diagram-timeline">
      <div className="diagram-timeline-bar"><strong>사건 흐름</strong>
        <span>{timeline.length < 2 ? '' : timelineIndex < 0 ? '사건 전' : atEnd ? '전체' : timeline[timelineIndex]?.date || `${cutoffSequence}단계`}</span>
        {timeline.length > 1 && <input aria-label="사건 흐름 시점" type="range" min="-1" max={timeline.length - 1} value={timelineIndex} onChange={event => setTimelineIndex(Number(event.target.value))} />}
      </div>
      <div className="diagram-event-list">{timeline.map((event, index) => {
        const future = index > timelineIndex;
        return <button key={event.id} className={future ? 'future' : ''} onClick={() => setTimelineIndex(index)}><b>{event.date || `${event.sequence || index + 1}단계`}</b><span>{event.text}</span></button>;
      })}</div>
    </aside>}
    <div className="diagram-canvas" style={{ '--diagram-inverse-zoom': 1 / viewportZoom } as CSSProperties}><ReactFlow nodes={renderNodes} edges={visibleEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={instance => { flow.current = instance; requestAnimationFrame(() => instance.fitView({ padding: 0.18, maxZoom: 2 })); }}
      onMove={(_, viewport) => setViewportZoom(currentZoom => Math.abs(currentZoom - viewport.zoom) < 0.001 ? currentZoom : viewport.zoom)}
      onNodesChange={changes => display({ ...current.current, nodes: applyNodeChanges(changes, current.current.nodes) })}
      onEdgesChange={changes => display({ ...current.current, edges: applyEdgeChanges(changes, current.current.edges) })}
      onNodeDragStart={checkpoint} onNodeDragStop={() => save(current.current)}
      onConnect={connection => change({ ...current.current, edges: addEdge({ ...connection, id: crypto.randomUUID(), type: 'plotEdge', label: '관계', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, current.current.edges) })}
      onNodeClick={(_, node) => { setSelected({ kind: 'node', id: node.id }); setLabel(String(node.data.label || '')); }}
      onEdgeClick={(_, edge) => { if (edge.data?.derivedArc) return; setSelected({ kind: 'edge', id: edge.id }); setLabel(String(edge.label || '')); }}
      onPaneClick={() => setSelected(null)} deleteKeyCode={null} fitView minZoom={0.2} maxZoom={2.5} proOptions={{ hideAttribution: true }}>
      <Controls showInteractive={false} />
    </ReactFlow></div>
    </div>
  </dialog>, document.body);
}
