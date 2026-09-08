import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { LegalGraph } from "../types";

// Layout and time-axis rules are ported from plot.app.yebni.cc with the
// author's permission. React Flow only supplies editing, pan and zoom.
export function dateKey(date?: string) {
  if (!date) return 0;
  const numbers = String(date).match(/\d+/g)?.map(Number) || [];
  if (!numbers.length || numbers[0] < 1000) return 0;
  return numbers[0] * 10000 + (numbers[1] || 0) * 100 + (numbers[2] || 0);
}

export function dateLabel(key: number) {
  const year = Math.floor(key / 10000);
  const month = Math.floor(key / 100) % 100;
  const day = key % 100;
  return [year, month || null, day || null].filter(value => value !== null).join('.');
}

export function computeGraphTimes(data?: LegalGraph) {
  if (!data) return [];
  return [...new Set([
    ...data.relations.map(relation => dateKey(relation.date)),
    ...data.events.map(event => dateKey(event.date))
  ].filter(Boolean))].sort((a, b) => a - b);
}

type PropertyArc = { id: string; thing: string; party: string; role: string; start: number; end: number; usesSequence: boolean };

const ownershipTransferPattern = /소유권\s*이전|매도|매매|증여|양도|상속|유증|명의신탁/;
const possessionTransferPattern = /임의\s*제출|제출|압수|교부|인도|보관|은닉|점유/;

export function propertyArcIsActive(arc: PropertyArc, cutoffSequence: number, cutoffDate: number, atEnd: boolean) {
  if (!atEnd && cutoffSequence <= 0 && cutoffDate <= 0) return false;
  const cutoff = atEnd ? Infinity : arc.usesSequence ? cutoffSequence : cutoffDate;
  return arc.start <= cutoff && (arc.end === Infinity || cutoff < arc.end);
}

function possessionRecipient(relation: LegalGraph['relations'][number], parties: Map<string, LegalGraph['parties'][number]>) {
  if (!/압수/.test(relation.label)) return relation.to;
  const authorityPattern = /경찰|검사|검찰|수사기관|수사관/;
  return [relation.from, relation.to].find(id => {
    const party = parties.get(id);
    return party && authorityPattern.test(`${party.name} ${party.role || ''}`);
  }) || relation.from;
}

export function computePropertyArcs(data?: LegalGraph): PropertyArc[] {
  if (!data) return [];
  const arcs: PropertyArc[] = [];
  const partyById = new Map(data.parties.map(party => [party.id, party]));
  for (const object of data.objects) {
    if (/영장/.test(object.name)) continue;
    const relations = data.relations
      .filter(relation => relation.objectId === object.id && relation.from !== relation.to)
      .slice();
    if (!relations.length) continue;
    const usesSequence = relations.some(relation => Boolean(relation.sequence));
    const timeOf = (relation: LegalGraph['relations'][number]) => usesSequence
      ? relation.sequence || Infinity
      : dateKey(relation.date) || 0;
    relations.sort((left, right) => timeOf(left) - timeOf(right));
    const inferredOwner = data.parties.find(party => {
      const names = [party.name, party.id, party.role].filter(Boolean) as string[];
      return names.some(name => object.name.includes(`${name} 소유`) || object.name.includes(`${name}의 소유`));
    })?.id;
    const owns = relations.filter(relation => relation.effect === 'own' && ownershipTransferPattern.test(relation.label));
    const initialOwner = object.ownerId && partyById.has(object.ownerId)
      ? object.ownerId
      : inferredOwner || owns[0]?.from || relations.find(relation => relation.effect === 'sale')?.from;
    let holder = initialOwner;
    let previous = 0;
    owns.forEach((relation, index) => {
      const key = timeOf(relation);
      if (holder && holder !== relation.to) arcs.push({ id: `arc-own-${object.id}-${index}`, thing: object.id, party: holder, role: '소유', start: previous, end: key, usesSequence });
      holder = relation.to;
      previous = key;
    });
    if (holder) arcs.push({ id: `arc-own-${object.id}-last`, thing: object.id, party: holder, role: '소유', start: previous, end: Infinity, usesSequence });
    relations.filter(relation => relation.effect === 'lien').forEach((relation, index) => {
      arcs.push({ id: `arc-lien-${object.id}-${index}`, thing: object.id, party: relation.to, role: '담보', start: timeOf(relation), end: Infinity, usesSequence });
    });
    const possessions = relations.filter(relation => relation.effect === 'poss' || (!ownershipTransferPattern.test(relation.label) && possessionTransferPattern.test(relation.label)));
    let possessor = object.possessorId && partyById.has(object.possessorId) ? object.possessorId : possessions.length ? initialOwner : undefined;
    let possessionStart = 0;
    possessions.forEach((relation, index) => {
      const key = timeOf(relation);
      const nextPossessor = possessionRecipient(relation, partyById);
      if (possessor === nextPossessor) return;
      if (possessor) arcs.push({ id: `arc-poss-${object.id}-${index}`, thing: object.id, party: possessor, role: '점유', start: possessionStart, end: key, usesSequence });
      possessor = nextPossessor;
      possessionStart = key;
    });
    if (possessor) arcs.push({ id: `arc-poss-${object.id}-last`, thing: object.id, party: possessor, role: '점유', start: possessionStart, end: Infinity, usesSequence });
  }
  return arcs.filter(arc => arc.end > arc.start);
}

type LabelEdgeData = { labelX?: number; labelY?: number; manualLabelX?: number; manualLabelY?: number };

function labelBoxSize(edge: Edge, inverseZoom: number) {
  const date = String((edge.data as Partial<LegalGraph['relations'][number]> | undefined)?.date || '');
  const text = `${date} ${String(edge.label || '관계')}`.trim();
  const lines = Math.max(1, Math.ceil(text.length / 18));
  return {
    w: Math.min(210, Math.max(54, text.length * 7 + 18)) * inverseZoom,
    h: (18 + lines * 12) * inverseZoom
  };
}

export function declutterEdgeLabels(edges: Edge[], nodes: Node[], inverseZoom = 1) {
  const centers = new Map(nodes.map(node => {
    const object = node.className?.includes('diagram-object');
    return [node.id, { x: node.position.x + (object ? 60 : 34), y: node.position.y + (object ? 22 : 34), w: object ? 130 : 76, h: object ? 54 : 76 }] as const;
  }));
  const boxes = edges.map(edge => {
    const from = centers.get(edge.source);
    const to = centers.get(edge.target);
    if (!from || !to) return null;
    const size = labelBoxSize(edge, inverseZoom);
    const self = edge.source === edge.target;
    const ax = self ? from.x : (from.x + to.x) / 2;
    const ay = self ? from.y - 64 : (from.y + to.y) / 2;
    const data = edge.data as LabelEdgeData | undefined;
    const fixed = data?.manualLabelX !== undefined && data.manualLabelY !== undefined;
    return { edge, x: fixed ? data.manualLabelX! : ax, y: fixed ? data.manualLabelY! : ay, ax, ay, fixed, ...size };
  }).filter((box): box is NonNullable<typeof box> => Boolean(box));
  const obstacles = [...centers.values()];
  const maxX = Math.max(640, ...obstacles.map(item => item.x + item.w));
  const maxY = Math.max(480, ...obstacles.map(item => item.y + item.h));
  const steps = Math.max(70, Math.min(240, 250 - boxes.length * 4));
  for (let step = 0; step < steps; step += 1) {
    const pull = 0.06 * (1 - step / steps);
    boxes.forEach(box => {
      if (box.fixed) return;
      box.x += (box.ax - box.x) * pull;
      box.y += (box.ay - box.y) * pull;
    });
    for (let left = 0; left < boxes.length; left += 1) {
      const current = boxes[left];
      for (let right = left + 1; right < boxes.length; right += 1) {
        const other = boxes[right];
        const dx = other.x - current.x;
        const dy = other.y - current.y;
        const overlapX = (current.w + other.w) / 2 + 6 * inverseZoom - Math.abs(dx);
        const overlapY = (current.h + other.h) / 2 + 5 * inverseZoom - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (current.fixed && other.fixed) continue;
        if (overlapY * 1.7 < overlapX) {
          const direction = dy < 0 ? -1 : 1;
          if (!current.fixed) current.y -= overlapY * (other.fixed ? 1 : 0.5) * direction;
          if (!other.fixed) other.y += overlapY * (current.fixed ? 1 : 0.5) * direction;
        } else {
          const direction = dx < 0 ? -1 : 1;
          if (!current.fixed) current.x -= overlapX * (other.fixed ? 1 : 0.5) * direction;
          if (!other.fixed) other.x += overlapX * (current.fixed ? 1 : 0.5) * direction;
        }
      }
      if (current.fixed) continue;
      obstacles.forEach(obstacle => {
        const dx = current.x - obstacle.x;
        const dy = current.y - obstacle.y;
        const overlapX = (current.w + obstacle.w) / 2 - Math.abs(dx);
        const overlapY = (current.h + obstacle.h) / 2 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) return;
        if (overlapY < overlapX) current.y += dy < 0 ? -overlapY : overlapY;
        else current.x += dx < 0 ? -overlapX : overlapX;
      });
      current.x = Math.max(current.w / 2 + 5, Math.min(maxX - current.w / 2 - 5, current.x));
      current.y = Math.max(current.h / 2 + 5, Math.min(maxY - current.h / 2 - 5, current.y));
    }
  }
  const positions = new Map(boxes.map(box => [box.edge.id, { x: box.x, y: box.y }]));
  return edges.map(edge => {
    const position = positions.get(edge.id);
    if (!position) return edge;
    return { ...edge, data: { ...(edge.data as LabelEdgeData | undefined), labelX: position.x, labelY: position.y } };
  });
}

function orderParties(data: LegalGraph) {
  const ids = [...new Set([...data.parties.map(party => party.id), ...data.relations.flatMap(relation => [relation.from, relation.to])])].filter(Boolean);
  const weights = new Map<string, Map<string, number>>();
  const addWeight = (from: string, to: string) => {
    if (!weights.has(from)) weights.set(from, new Map());
    weights.get(from)!.set(to, (weights.get(from)!.get(to) || 0) + 1);
  };
  data.relations.forEach(relation => {
    if (relation.from === relation.to) return;
    addWeight(relation.from, relation.to);
    addWeight(relation.to, relation.from);
  });
  const degree = (id: string) => [...(weights.get(id)?.values() || [])].reduce((sum, value) => sum + value, 0);
  const rest = [...ids].sort((a, b) => degree(b) - degree(a) || ids.indexOf(a) - ids.indexOf(b));
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
  const cost = (items: string[]) => {
    let total = 0;
    for (let left = 0; left < items.length; left += 1) for (let right = left + 1; right < items.length; right += 1) {
      const weight = weights.get(items[left])?.get(items[right]) || 0;
      const distance = right - left;
      total += weight * Math.min(distance, items.length - distance);
    }
    return total;
  };
  let bestCost = cost(order);
  for (let pass = 0; pass < 6 && order.length > 3; pass += 1) {
    let improved = false;
    for (let left = 0; left < order.length; left += 1) for (let right = left + 1; right < order.length; right += 1) {
      const candidate = order.slice();
      [candidate[left], candidate[right]] = [candidate[right], candidate[left]];
      const candidateCost = cost(candidate);
      if (candidateCost < bestCost) {
        bestCost = candidateCost;
        order.splice(0, order.length, ...candidate);
        improved = true;
      }
    }
    if (!improved) break;
  }
  return order;
}

export function legalGraphToDiagram(data: LegalGraph) {
  const order = orderParties(data);
  const partyMap = new Map(data.parties.map(party => [party.id, party]));
  const pairCounts = new Map<string, number>();
  data.relations.forEach(relation => {
    const key = [relation.from, relation.to].sort().join('|');
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  });
  const maxPairCount = Math.max(0, ...pairCounts.values());
  const objects = data.objects.filter(object => data.relations.some(relation => relation.objectId === object.id)).slice(0, 8);
  const width = 640;
  const height = Math.round(Math.min(1300, Math.max(480, 450 + Math.max(0, maxPairCount - 2) * 54 + Math.max(0, order.length - 5) * 36 + (objects.length > 1 ? 60 : 0))));
  const center = { x: width / 2, y: height / 2 };
  const radius = Math.max(140, Math.min(232, Math.min(width, height) * 0.34)) + (objects.length ? 26 : 0);
  const centers = new Map<string, { x: number; y: number }>();
  const nodes: Node[] = order.map((id, index) => {
    const point = order.length === 1
      ? center
      : order.length === 2
        ? { x: center.x + (index ? 1 : -1) * radius, y: center.y }
        : { x: center.x + radius * Math.cos(-Math.PI / 2 + index * 2 * Math.PI / order.length), y: center.y + radius * Math.sin(-Math.PI / 2 + index * 2 * Math.PI / order.length) };
    centers.set(id, point);
    return { id, type: 'plotParty', position: { x: point.x - 34, y: point.y - 34 }, data: { label: partyMap.get(id)?.name || id, role: partyMap.get(id)?.role || '' }, className: 'diagram-person' };
  });
  const relatedAngle = (objectId: string) => {
    const related = [...new Set(data.relations.filter(relation => relation.objectId === objectId).flatMap(relation => [relation.from, relation.to]))]
      .map(id => centers.get(id)).filter((point): point is { x: number; y: number } => Boolean(point));
    if (!related.length) return 0;
    const x = related.reduce((sum, point) => sum + point.x, 0) / related.length - center.x;
    const y = related.reduce((sum, point) => sum + point.y, 0) / related.length - center.y;
    return Math.atan2(y, x);
  };
  const segments = data.relations.map(relation => [centers.get(relation.from), centers.get(relation.to)] as const).filter(pair => pair[0] && pair[1] && pair[0] !== pair[1]);
  const distanceToSegment = (x: number, y: number, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = dx * dx + dy * dy || 1;
    const fraction = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / length));
    return Math.hypot(x - (from.x + fraction * dx), y - (from.y + fraction * dy));
  };
  const placed: { x: number; y: number }[] = [];
  objects.map(object => ({ object, angle: relatedAngle(object.id) })).sort((a, b) => a.angle - b.angle).forEach(({ object, angle }) => {
    let best = center;
    let bestScore = -Infinity;
    for (const radial of [0.12, 0.26, 0.38, 0.5, 0.62]) for (let index = 0; index < 18; index += 1) {
      const candidateAngle = angle + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * Math.PI / 9;
      const x = center.x + radius * radial * Math.cos(candidateAngle);
      const y = center.y + radius * radial * Math.sin(candidateAngle);
      let score = 1e9;
      segments.forEach(segment => { score = Math.min(score, distanceToSegment(x, y, segment[0]!, segment[1]!)); });
      centers.forEach(point => { score = Math.min(score, Math.hypot(x - point.x, y - point.y) - 36); });
      placed.forEach(point => { score = Math.min(score, Math.hypot(x - point.x, y - point.y) - 52); });
      score = Math.min(score, 62) - Math.abs(((candidateAngle - angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 16;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    placed.push(best);
    nodes.push({ id: object.id, type: 'plotObject', position: { x: best.x - 60, y: best.y - 22 }, data: { label: object.name }, className: 'diagram-object' });
  });
  const objectMap = new Map(data.objects.map(object => [object.id, object.name]));
  const pairSeen = new Map<string, number>();
  const edges: Edge[] = data.relations.map((relation, index) => ({
    id: relation.id,
    source: relation.from,
    target: relation.to,
    type: 'plotEdge',
    label: relation.objectId && objectMap.get(relation.objectId) ? `${relation.label} (${objectMap.get(relation.objectId)})` : relation.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `diagram-edge kind-${relation.kind} status-${relation.status}`,
    data: (() => {
      const pair = [relation.from, relation.to].sort().join('|');
      const pairIndex = pairSeen.get(pair) || 0;
      pairSeen.set(pair, pairIndex + 1);
      return { ...relation, order: index, pairIndex, pairTotal: pairCounts.get(pair) || 1, centerX: center.x, centerY: center.y, objectName: relation.objectId ? objectMap.get(relation.objectId) : undefined };
    })()
  })).sort((a, b) => {
    const left = a.data as LegalGraph['relations'][number];
    const right = b.data as LegalGraph['relations'][number];
    return (left.sequence || Infinity) - (right.sequence || Infinity)
      || (dateKey(left.date) || Infinity) - (dateKey(right.date) || Infinity)
      || Number(a.data?.order) - Number(b.data?.order);
  });
  return { nodes, edges, legalGraph: data };
}
