import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, type Node, type Edge, type ReactFlowInstance } from '@xyflow/react';
import { UserPlus, SquarePlus, Undo2, Redo2, Trash2, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { CaseNotes } from '../types';

type Graph = { nodes: Node[]; edges: Edge[] };
type Props = { title: string; value: CaseNotes['diagram']; onChange: (graph: Graph) => void; onClose: () => void };

export function DiagramEditor({ title, value, onChange, onClose }: Props) {
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
    change({ nodes: graph.nodes.filter(n => selected.kind !== 'node' || n.id !== selected.id), edges: graph.edges.filter(e => selected.kind === 'edge' ? e.id !== selected.id : e.source !== selected.id && e.target !== selected.id) });
    setSelected(null);
  }
  return createPortal(<dialog ref={dialog} className="diagram-dialog" aria-label="판례 관계도" onCancel={onClose} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,textarea')) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); travel(event.key.toLowerCase() === 'z' && !event.shiftKey); }
  }}>
    <header className="diagram-heading"><strong>{title} · 관계도</strong><button aria-label="관계도 닫기" title="닫기 (Esc)" onClick={onClose}><X size={20} /></button></header>
    <div className="diagram-toolbar">
      <button title="당사자 추가" onClick={() => add('person')}><UserPlus size={18} /><span>당사자</span></button>
      <button title="목적물 추가" onClick={() => add('object')}><SquarePlus size={18} /><span>목적물</span></button>
      <button title="실행 취소 (Ctrl+Z)" aria-label="실행 취소" disabled={!undo.current.length} onClick={() => travel(true)}><Undo2 size={18} /></button>
      <button title="다시 실행 (Ctrl+Y)" aria-label="다시 실행" disabled={!redo.current.length} onClick={() => travel(false)}><Redo2 size={18} /></button>
      <button title="선택 삭제" aria-label="선택 삭제" disabled={!selected} onClick={remove}><Trash2 size={18} /></button>
      {selected && <input aria-label="선택 항목 이름" value={label} onChange={event => setLabel(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />}
    </div>
    <div className="diagram-canvas"><ReactFlow nodes={graph.nodes} edges={graph.edges} onInit={instance => { flow.current = instance; requestAnimationFrame(() => instance.fitView({ padding: 0.3, maxZoom: 1.3 })); }}
      onNodesChange={changes => display({ ...current.current, nodes: applyNodeChanges(changes, current.current.nodes) })}
      onEdgesChange={changes => display({ ...current.current, edges: applyEdgeChanges(changes, current.current.edges) })}
      onNodeDragStart={checkpoint} onNodeDragStop={() => save(current.current)}
      onConnect={connection => change({ ...current.current, edges: addEdge({ ...connection, id: crypto.randomUUID(), label: '관계', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, current.current.edges) })}
      onNodeClick={(_, node) => { setSelected({ kind: 'node', id: node.id }); setLabel(String(node.data.label || '')); }}
      onEdgeClick={(_, edge) => { setSelected({ kind: 'edge', id: edge.id }); setLabel(String(edge.label || '')); }}
      onPaneClick={() => setSelected(null)} deleteKeyCode={null} fitView minZoom={0.2} maxZoom={2.5}>
      <Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable />
    </ReactFlow></div>
  </dialog>, document.body);
}
