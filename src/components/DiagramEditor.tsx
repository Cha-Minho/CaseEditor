import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Controls, BaseEdge, EdgeLabelRenderer, Handle, Position, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, type Node, type Edge, type EdgeProps, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { ChevronLeft, ChevronRight, GitBranchPlus, UserPlus, SquarePlus, Undo2, Redo2, Trash2, WandSparkles, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { CaseNotes } from '../types';
import type { LegalGraph } from '../types';
import { generateLegalGraph } from '../lib/legalGraphApi';
import { alignLegalGraphTimeline, computePropertyArcs, dateKey, declutterEdgeLabels, legalGraphToDiagram, propertyArcIsActive } from '../lib/plotGraph';

type Graph = NonNullable<CaseNotes['diagram']>;
type Props = { title: string; sourceHtml: string; value: CaseNotes['diagram']; onChange: (graph: Graph) => void; onClose: () => void };
type ProceduralRoleKind = 'police' | 'prosecutor' | 'court';

const proceduralRoleLabels: Record<ProceduralRoleKind, string> = {
  police: '경찰·수사기관',
  prosecutor: '검사·검찰',
  court: '법원·판사'
};

function proceduralRoleKind(label: unknown, role: unknown): ProceduralRoleKind | null {
  const text = `${String(label || '')} ${String(role || '')}`;
  if (/검사|검찰/.test(text)) return 'prosecutor';
  if (/법원|재판부|판사|법관/.test(text)) return 'court';
  if (/경찰|수사기관|수사관|사법경찰|경위|경감|경사|경장|순경/.test(text)) return 'police';
  return null;
}

function concisePartyLabel(label: unknown, role: unknown) {
  const fullLabel = String(label || '').trim();
  const anonymous = fullLabel.match(/공소외\s*\d+/);
  if (anonymous) return anonymous[0].replace(/공소외\s*/, '공소외 ');
  const roleKind = proceduralRoleKind(fullLabel, role);
  if (roleKind === 'police' && fullLabel.length > 8) {
    const station = fullLabel.match(/([^\s]{1,8}파출소)/)?.[1];
    if (station) return `${station} 경찰관`;
    if (/형사과/.test(fullLabel)) return '형사과 경찰관';
    return '경찰관';
  }
  if (roleKind === 'prosecutor' && fullLabel.length > 8) return '검사';
  if (roleKind === 'court' && fullLabel.length > 8) {
    if (/관련사건/.test(fullLabel)) return '관련사건 법원';
    if (/이 사건/.test(fullLabel)) return '이 사건 법원';
    return '법원';
  }
  return fullLabel;
}

function PlotPartyNode({ data, selected }: NodeProps) {
  const roleKind = proceduralRoleKind(data.label, data.role);
  const roleLabel = roleKind ? proceduralRoleLabels[roleKind] : String(data.role || '');
  const fullLabel = String(data.label || '');
  const tooltip = [fullLabel, String(data.role || '')].filter((part, index, parts) => part && parts.indexOf(part) === index).join(' · ');
  return <div className={`plot-party-node${roleKind ? ` role-${roleKind}` : ''}${selected ? ' selected' : ''}${data.future ? ' future' : ''}`} data-procedural-role={roleKind || undefined} title={tooltip || roleLabel}>
    <Handle type="target" position={Position.Top} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    <span>{concisePartyLabel(data.label, data.role)}</span>
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
  const relation = data as (Partial<LegalGraph['relations'][number]> & { derivedArc?: boolean; role?: string; future?: boolean; pairIndex?: number; pairTotal?: number; centerX?: number; centerY?: number; labelX?: number; labelY?: number; viewportZoom?: number; onSelectEdge?: (id: string) => void; onMoveLabel?: (id: string, x: number, y: number) => void }) | undefined;
  const suppressClickAfterDrag = useRef(false);
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
  const startLabelDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (relation?.derivedArc) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickAfterDrag.current = false;
    const element = event.currentTarget;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = labelX;
    const startY = labelY;
    const zoom = relation?.viewportZoom || 1;
    let moved = false;
    const onMove = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startClientX) / zoom;
      const dy = (pointer.clientY - startClientY) / zoom;
      moved ||= Math.hypot(dx, dy) > 3;
      if (moved) suppressClickAfterDrag.current = true;
      element.style.transform = `translate(-50%, -50%) translate(${startX + dx}px,${startY + dy}px) scale(var(--diagram-inverse-zoom, 1))`;
    };
    const onUp = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) return;
      relation?.onMoveLabel?.(id, startX + (pointer.clientX - startClientX) / zoom, startY + (pointer.clientY - startClientY) / zoom);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
    {hasLeader && <path className={`plot-label-leader${relation?.future ? ' future' : ''}`} d={`M ${anchorX} ${anchorY} L ${labelX} ${labelY}`} />}
    <EdgeLabelRenderer><button type="button" disabled={relation?.derivedArc} className={`plot-edge-chip nodrag nopan kind-${relation?.kind || 'other'} status-${relation?.status || 'recognized'}${relation?.derivedArc ? ' property' : ''}${relation?.future ? ' future' : ''}${selected ? ' selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(var(--diagram-inverse-zoom, 1))` }} onPointerDown={startLabelDrag} onClick={event => {
      event.stopPropagation();
      if (suppressClickAfterDrag.current) {
        suppressClickAfterDrag.current = false;
        event.preventDefault();
        return;
      }
      relation?.onSelectEdge?.(id);
    }}>
      {relation?.date && <small>{relation.date}</small>}
      <span>{String(label || relation?.role || '')}</span>
    </button></EdgeLabelRenderer>
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
  const [visibleTimelineIndexes, setVisibleTimelineIndexes] = useState<number[]>([]);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkSource, setLinkSource] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [linkLabel, setLinkLabel] = useState('관계');
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');

  const selectEdge = useCallback((id: string) => {
    const edge = current.current.edges.find(item => item.id === id);
    if (!edge || edge.data?.derivedArc) return;
    setSelected({ kind: 'edge', id });
    setLabel(String(edge.label || ''));
    setEdgeSource(edge.source);
    setEdgeTarget(edge.target);
  }, []);
  const moveEdgeLabel = useCallback((id: string, x: number, y: number) => {
    change({ ...current.current, edges: current.current.edges.map(edge => edge.id === id ? { ...edge, data: { ...edge.data, manualLabelX: x, manualLabelY: y } } : edge) });
  }, []);

  const alignedLegalGraph = useMemo(() => alignLegalGraphTimeline(graph.legalGraph), [graph.legalGraph]);
  const alignedRelationsById = useMemo(() => new Map((alignedLegalGraph?.relations || []).map(relation => [relation.id, relation])), [alignedLegalGraph]);
  const timeline = useMemo(() => (alignedLegalGraph?.events || []).map((event, index) => ({ event, index })).sort((left, right) => {
    const leftSequence = left.event.sequence || left.index + 1;
    const rightSequence = right.event.sequence || right.index + 1;
    return leftSequence - rightSequence || dateKey(left.event.date) - dateKey(right.event.date);
  }).map(item => item.event), [alignedLegalGraph]);
  const timelineKey = timeline.map(event => event.id).join('|');
  const selectedMoments = visibleTimelineIndexes.map(index => ({ index, event: timeline[index] })).filter(item => item.event);
  const relationIsVisible = (relation?: Partial<LegalGraph['relations'][number]>) => {
    if (!timeline.length) return true;
    if (!selectedMoments.length) return false;
    const alignedRelation = relation?.id ? alignedRelationsById.get(relation.id) || relation : relation;
    return selectedMoments.some(({ index, event }) => {
      const sequence = event.sequence || index + 1;
      if (alignedRelation?.sequence) return alignedRelation.sequence === sequence;
      const relationDate = dateKey(alignedRelation?.date);
      const eventDate = dateKey(event.date);
      return Boolean(relationDate && eventDate && relationDate === eventDate);
    });
  };
  const propertyArcs = useMemo(() => computePropertyArcs(alignedLegalGraph), [alignedLegalGraph]);
  const activeTimelineEvent = timeline[timelineIndex];
  const propertyCutoffSequence = activeTimelineEvent?.sequence || timelineIndex + 1;
  const propertyCutoffDate = dateKey(activeTimelineEvent?.date);
  const visiblePropertyArcs = useMemo(() => timeline.length
    ? propertyArcs.filter(arc => propertyArcIsActive(arc, propertyCutoffSequence, propertyCutoffDate, timelineIndex === timeline.length - 1))
    : propertyArcs,
  [propertyArcs, propertyCutoffSequence, propertyCutoffDate, timelineIndex, timeline.length]);
  const showTimelineIndex = (index: number) => {
    const next = Math.max(0, Math.min(timeline.length - 1, index));
    setTimelineIndex(next);
    setVisibleTimelineIndexes([next]);
  };
  const renderNodes = useMemo<Node[]>(() => {
    const activeIds = new Set<string>();
    graph.edges.forEach(edge => {
      const relation = edge.data as Partial<LegalGraph['relations'][number]> | undefined;
      if (relationIsVisible(relation)) [edge.source, edge.target, relation?.objectId].filter(Boolean).forEach(id => activeIds.add(id!));
    });
    visiblePropertyArcs.forEach(arc => {
      activeIds.add(arc.thing);
      activeIds.add(arc.party);
    });
    return graph.nodes.map(node => ({ ...node, type: node.className?.includes('diagram-object') ? 'plotObject' : 'plotParty', data: { ...node.data, future: Boolean(timeline.length && !activeIds.has(node.id)) } }));
  }, [graph.edges, graph.nodes, selectedMoments, timeline.length, visiblePropertyArcs]);
  const visibleEdges = useMemo<Edge[]>(() => {
    const relations = graph.edges.map(edge => {
      const visible = relationIsVisible(edge.data as LegalGraph['relations'][number] | undefined);
      return { ...edge, type: 'plotEdge', selected: selected?.kind === 'edge' && selected.id === edge.id, style: { ...edge.style, opacity: visible ? 1 : 0.09 }, data: { ...edge.data, future: !visible, viewportZoom, onSelectEdge: selectEdge, onMoveLabel: moveEdgeLabel } };
    });
    const arcs = visiblePropertyArcs.map(arc => {
      const kind = arc.role === '소유' ? 'own' : arc.role === '점유' ? 'poss' : arc.role === '압수' ? 'seize' : 'lien';
      return { id: arc.id, source: arc.thing, target: arc.party, type: 'plotEdge', label: arc.role, selectable: false, focusable: false, className: `diagram-edge property-arc arc-${kind}`, style: { opacity: 0.88 }, data: { derivedArc: true, role: arc.role, kind, status: 'recognized', future: false } };
    });
    return declutterEdgeLabels([...relations, ...arcs] as Edge[], graph.nodes, 1 / viewportZoom);
  }, [graph.edges, graph.nodes, moveEdgeLabel, selectEdge, selected, selectedMoments, timeline.length, viewportZoom, visiblePropertyArcs]);

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
  useEffect(() => {
    const last = timeline.length - 1;
    setTimelineIndex(Math.max(0, last));
    setVisibleTimelineIndexes(last >= 0 ? [last] : []);
  }, [timelineKey]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => flow.current?.fitView({ padding: 0.24, maxZoom: 1.7 })));
    return () => window.cancelAnimationFrame(frame);
  }, [visibleTimelineIndexes.join('|')]);

  function add(kind: 'person' | 'object') {
    const node: Node = { id: crypto.randomUUID(), type: kind === 'person' ? 'plotParty' : 'plotObject', position: { x: 80 + (graph.nodes.length % 4) * 190, y: 80 + Math.floor(graph.nodes.length / 4) * 130 }, data: { label: kind === 'person' ? '당사자' : '목적물' }, className: kind === 'person' ? 'diagram-person' : 'diagram-object' };
    change({ ...graph, nodes: [...graph.nodes, node] });
    setSelected({ kind: 'node', id: node.id }); setLabel(String(node.data.label));
  }
  function openLinkForm() {
    const source = graph.nodes[0]?.id || '';
    setLinkSource(source);
    setLinkTarget(graph.nodes.find(node => node.id !== source)?.id || source);
    setLinkLabel('관계');
    setLinkFormOpen(true);
  }
  function addLink() {
    if (!linkSource || !linkTarget) return;
    const id = crypto.randomUUID();
    const edge: Edge = {
      id,
      source: linkSource,
      target: linkTarget,
      type: 'plotEdge',
      className: 'diagram-edge status-recognized kind-other',
      label: linkLabel.trim() || '관계',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
      data: { kind: 'other', status: 'recognized', confidence: 1, evidence: '' },
    };
    change({ ...current.current, edges: addEdge(edge, current.current.edges) });
    setLinkFormOpen(false);
    selectEdge(id);
  }
  function rename() {
    if (!selected) return;
    const text = label.trim();
    const existing = selected.kind === 'node' ? current.current.nodes.find(n => n.id === selected.id)?.data.label : current.current.edges.find(e => e.id === selected.id)?.label;
    if (existing === text) return;
    if (selected.kind === 'node') {
      change({ ...current.current, nodes: current.current.nodes.map(n => n.id === selected.id ? { ...n, data: { ...n.data, label: text } } : n) });
      return;
    }
    const legalGraph = current.current.legalGraph ? { ...current.current.legalGraph, relations: current.current.legalGraph.relations.map(relation => relation.id === selected.id ? { ...relation, label: text } : relation) } : undefined;
    change({ ...current.current, edges: current.current.edges.map(e => e.id === selected.id ? { ...e, label: text } : e), ...(legalGraph ? { legalGraph } : {}) });
  }
  function updateEdgeConnection() {
    if (selected?.kind !== 'edge' || !edgeSource || !edgeTarget) return;
    const text = label.trim() || '관계';
    const legalGraph = current.current.legalGraph ? {
      ...current.current.legalGraph,
      relations: current.current.legalGraph.relations.map(relation => relation.id === selected.id ? { ...relation, from: edgeSource, to: edgeTarget, label: text } : relation),
    } : undefined;
    change({
      ...current.current,
      edges: current.current.edges.map(edge => edge.id === selected.id ? { ...edge, source: edgeSource, target: edgeTarget, label: text } : edge),
      ...(legalGraph ? { legalGraph } : {}),
    });
  }
  function remove() {
    if (!selected) return;
    const legalGraph = selected.kind === 'edge' && graph.legalGraph ? { ...graph.legalGraph, relations: graph.legalGraph.relations.filter(relation => relation.id !== selected.id) } : graph.legalGraph;
    change({ ...graph, nodes: graph.nodes.filter(n => selected.kind !== 'node' || n.id !== selected.id), edges: graph.edges.filter(e => selected.kind === 'edge' ? e.id !== selected.id : e.source !== selected.id && e.target !== selected.id), ...(legalGraph ? { legalGraph } : {}) });
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
  const visibleProceduralRoles = (Object.keys(proceduralRoleLabels) as ProceduralRoleKind[]).filter(kind =>
    graph.nodes.some(node => node.type === 'plotParty' && proceduralRoleKind(node.data.label, node.data.role) === kind)
  );
  return createPortal(<dialog ref={dialog} className="diagram-dialog" aria-label="판례 관계도" onCancel={onClose} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,textarea')) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); travel(event.key.toLowerCase() === 'z' && !event.shiftKey); }
  }}>
    <header className="diagram-heading"><strong>{title} · 관계도</strong><button aria-label="관계도 닫기" title="닫기 (Esc)" onClick={onClose}><X size={20} /></button></header>
    <div className="diagram-toolbar">
      <button className="diagram-ai-button" title="판례 원문에서 AI 관계도 초안 만들기" disabled={generating || !sourceHtml.trim()} onClick={createAiDraft}><WandSparkles size={18} /><span>{generating ? '분석 중' : 'AI 초안'}</span></button>
      <button title="당사자 추가" onClick={() => add('person')}><UserPlus size={18} /><span>당사자</span></button>
      <button title="목적물 추가" onClick={() => add('object')}><SquarePlus size={18} /><span>목적물</span></button>
      <button title="관계 추가" disabled={graph.nodes.length < 2} onClick={openLinkForm}><GitBranchPlus size={18} /><span>관계</span></button>
      <button title="실행 취소 (Ctrl+Z)" aria-label="실행 취소" disabled={!undo.current.length} onClick={() => travel(true)}><Undo2 size={18} /></button>
      <button title="다시 실행 (Ctrl+Y)" aria-label="다시 실행" disabled={!redo.current.length} onClick={() => travel(false)}><Redo2 size={18} /></button>
      <button title="선택 삭제" aria-label="선택 삭제" disabled={!selected} onClick={remove}><Trash2 size={18} /></button>
      {selected?.kind === 'node' && <input aria-label="선택 항목 이름" value={label} onChange={event => setLabel(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />}
    </div>
    {linkFormOpen && <form className="diagram-link-form" onSubmit={event => { event.preventDefault(); addLink(); }}>
      <select aria-label="관계 시작 노드" value={linkSource} onChange={event => setLinkSource(event.target.value)}>{graph.nodes.map(node => <option key={node.id} value={node.id}>{String(node.data.label || '')}</option>)}</select>
      <span aria-hidden="true">→</span>
      <select aria-label="관계 도착 노드" value={linkTarget} onChange={event => setLinkTarget(event.target.value)}>{graph.nodes.map(node => <option key={node.id} value={node.id}>{String(node.data.label || '')}</option>)}</select>
      <input aria-label="관계 이름" value={linkLabel} onChange={event => setLinkLabel(event.target.value)} autoFocus />
      <button type="submit" className="primary">추가</button>
      <button type="button" onClick={() => setLinkFormOpen(false)}>취소</button>
    </form>}
    {generationError && <div className="diagram-generation-error" role="alert">{generationError}<button onClick={() => setGenerationError('')}>닫기</button></div>}
    {draft && <div className="diagram-draft-review">
      <div><strong>AI 초안</strong><span>당사자 {draft.parties.length} · 목적물 {draft.objects.length} · 관계 {draft.relations.length} · 사건 {draft.events.length}</span>{reviewCount > 0 && <span>주장·분쟁·절차 {reviewCount}개 포함</span>}</div>
      <p>AI가 추출한 초안입니다. 적용한 뒤 각 관계의 근거와 인정 여부를 확인하세요.{graph.nodes.length ? ' 적용하면 현재 관계도를 교체합니다.' : ''}</p>
      {draft.events.length > 0 && <details className="diagram-draft-events" open><summary>사건 순서 확인</summary><ol>{draft.events.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map(event => <li key={event.id}><b>{event.date || `${event.sequence || '?'}단계`}</b><span>{event.text}</span></li>)}</ol></details>}
      <span className="diagram-review-actions"><button onClick={() => setDraft(null)}>취소</button><button className="primary" onClick={applyAiDraft}>관계도에 적용</button></span>
    </div>}
    <div className={`diagram-workspace${timeline.length ? ' has-timeline' : ''}`}>
    {timeline.length > 0 && <aside className="diagram-timeline">
      <div className="diagram-timeline-bar"><strong>사건 흐름</strong>
        <span>{timeline[timelineIndex]?.date || `${timeline[timelineIndex]?.sequence || timelineIndex + 1}단계`}</span>
        {timeline.length > 1 && <div className="diagram-timeline-controls">
          <button type="button" aria-label="이전 사건" title="이전 사건" disabled={timelineIndex === 0} onClick={() => showTimelineIndex(timelineIndex - 1)}><ChevronLeft size={16} /></button>
          <input aria-label="사건 흐름 시점" type="range" min="0" max={timeline.length - 1} value={timelineIndex} onChange={event => showTimelineIndex(Number(event.target.value))} />
          <button type="button" aria-label="다음 사건" title="다음 사건" disabled={timelineIndex === timeline.length - 1} onClick={() => showTimelineIndex(timelineIndex + 1)}><ChevronRight size={16} /></button>
        </div>}
      </div>
      <div className="diagram-event-list">{timeline.map((event, index) => {
        const visible = visibleTimelineIndexes.includes(index);
        return <button key={event.id} className={visible ? 'on' : 'off'} aria-pressed={visible} onClick={() => { setTimelineIndex(index); setVisibleTimelineIndexes(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index].sort((a, b) => a - b)); }}><b>{event.date || `${event.sequence || index + 1}단계`}</b><span>{event.text}</span></button>;
      })}</div>
    </aside>}
    <div className="diagram-stage">
    {selected?.kind === 'edge' && <form className="diagram-link-form diagram-edge-editor" onSubmit={event => { event.preventDefault(); updateEdgeConnection(); }}>
      <select aria-label="선택 관계 시작 노드" value={edgeSource} onChange={event => setEdgeSource(event.target.value)}>{graph.nodes.map(node => <option key={node.id} value={node.id}>{String(node.data.label || '')}</option>)}</select>
      <span aria-hidden="true">→</span>
      <select aria-label="선택 관계 도착 노드" value={edgeTarget} onChange={event => setEdgeTarget(event.target.value)}>{graph.nodes.map(node => <option key={node.id} value={node.id}>{String(node.data.label || '')}</option>)}</select>
      <input aria-label="선택 관계 이름" value={label} onChange={event => setLabel(event.target.value)} />
      <button type="submit" className="primary">연결 변경</button>
      <button type="button" className="danger" onClick={remove}>연결 끊기</button>
    </form>}
    <div className="diagram-canvas" style={{ '--diagram-inverse-zoom': 1 / viewportZoom } as CSSProperties}><ReactFlow nodes={renderNodes} edges={visibleEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={instance => { flow.current = instance; requestAnimationFrame(() => instance.fitView({ padding: 0.18, maxZoom: 2 })); }}
      onMove={(_, viewport) => setViewportZoom(currentZoom => Math.abs(currentZoom - viewport.zoom) < 0.001 ? currentZoom : viewport.zoom)}
      onNodesChange={changes => display({ ...current.current, nodes: applyNodeChanges(changes, current.current.nodes) })}
      onEdgesChange={changes => display({ ...current.current, edges: applyEdgeChanges(changes, current.current.edges) })}
      onNodeDragStart={checkpoint} onNodeDragStop={() => save(current.current)}
      onConnect={connection => change({ ...current.current, edges: addEdge({ ...connection, id: crypto.randomUUID(), type: 'plotEdge', label: '관계', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, current.current.edges) })}
      onNodeClick={(_, node) => { setSelected({ kind: 'node', id: node.id }); setLabel(String(node.data.label || '')); }}
      onEdgeClick={(_, edge) => selectEdge(edge.id)}
      onPaneClick={() => setSelected(null)} deleteKeyCode={null} fitView minZoom={0.2} maxZoom={2.5} proOptions={{ hideAttribution: true }}>
      <Controls showInteractive={false} />
    </ReactFlow>
    {visibleProceduralRoles.length > 0 && <div className="diagram-role-legend" aria-label="당사자 신분 범례">{visibleProceduralRoles.map(kind => <span key={kind}><i className={`role-${kind}`} aria-hidden="true" />{proceduralRoleLabels[kind]}</span>)}</div>}
    </div>
    {selectedRelation?.evidence && <div className="diagram-evidence"><span className={`relation-status status-${selectedRelation.status}`}>{selectedRelation.status === 'recognized' ? '인정 사실' : selectedRelation.status === 'alleged' ? '당사자 주장' : selectedRelation.status === 'disputed' ? '다툼 있음' : '소송 경과'}</span><span>{selectedRelation.evidence}</span><small>{Math.round((selectedRelation.confidence || 0) * 100)}%</small></div>}
    </div>
    </div>
  </dialog>, document.body);
}
