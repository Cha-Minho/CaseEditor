import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { LegalGraph } from "../types";

// Circular ordering and inner object placement are adapted from plot.app.yebni.cc
// with the author's permission. React Flow remains the interaction layer.
export function legalGraphToDiagram(data: LegalGraph) {
  const partyIds = data.parties.map((party) => party.id);
  const weights = new Map<string, Map<string, number>>();
  const addWeight = (from: string, to: string) => {
    if (!weights.has(from)) weights.set(from, new Map());
    weights.get(from)!.set(to, (weights.get(from)!.get(to) || 0) + 1);
  };
  data.relations.forEach((relation) => {
    if (relation.from === relation.to) return;
    addWeight(relation.from, relation.to);
    addWeight(relation.to, relation.from);
  });
  const degree = (id: string) => Array.from(weights.get(id)?.values() || []).reduce((sum, value) => sum + value, 0);
  const rest = [...partyIds].sort((a, b) => degree(b) - degree(a) || partyIds.indexOf(a) - partyIds.indexOf(b));
  const order: string[] = [];
  let cursor = rest.shift();
  if (cursor) order.push(cursor);
  while (rest.length && cursor) {
    let best = 0;
    for (let index = 1; index < rest.length; index += 1) {
      const score = weights.get(cursor)?.get(rest[index]) || 0;
      const bestScore = weights.get(cursor)?.get(rest[best]) || 0;
      if (score > bestScore || (score === bestScore && degree(rest[index]) > degree(rest[best]))) best = index;
    }
    cursor = rest.splice(best, 1)[0];
    order.push(cursor);
  }

  const center = { x: 480, y: 330 };
  const radius = Math.max(190, Math.min(270, 170 + order.length * 18));
  const partyMap = new Map(data.parties.map((party) => [party.id, party]));
  const nodes: Node[] = order.map((id, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(1, order.length);
    return {
      id,
      position: order.length === 1 ? center : { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) },
      data: { label: partyMap.get(id)?.role ? `${partyMap.get(id)?.name || id}\n${partyMap.get(id)?.role}` : partyMap.get(id)?.name || id, role: partyMap.get(id)?.role || "" },
      className: "diagram-person"
    };
  });

  data.objects.slice(0, 12).forEach((object, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(1, data.objects.length);
    const innerRadius = data.objects.length === 1 ? 0 : Math.min(135, 60 + data.objects.length * 10);
    nodes.push({
      id: object.id,
      position: { x: center.x + innerRadius * Math.cos(angle), y: center.y + innerRadius * Math.sin(angle) },
      data: { label: object.name },
      className: "diagram-object"
    });
  });

  const objectMap = new Map(data.objects.map((object) => [object.id, object.name]));
  const edges: Edge[] = data.relations.map((relation) => ({
    id: relation.id,
    source: relation.from,
    target: relation.to,
    type: "bezier",
    label: relation.objectId && objectMap.get(relation.objectId)
      ? `${relation.label} (${objectMap.get(relation.objectId)})`
      : relation.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `diagram-edge kind-${relation.kind} status-${relation.status}`,
    data: { ...relation, objectName: relation.objectId ? objectMap.get(relation.objectId) : undefined }
  }));
  return { nodes, edges, legalGraph: data };
}
