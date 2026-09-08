import { computePropertyArcs, propertyArcIsActive } from '../src/lib/plotGraph';
import type { LegalGraph } from '../src/types';

const graph: LegalGraph = {
  parties: [
    { id: 'accused', name: '피고인' },
    { id: 'victim', name: '공소외 1' },
    { id: 'police', name: '경찰' }
  ],
  objects: [{ id: 'phone', name: '피고인 소유 휴대전화 2대' }],
  relations: [
    { id: 'submit', from: 'victim', to: 'police', label: '휴대전화 2대 임의제출', kind: 'status', sequence: 3, objectId: 'phone', effect: 'own', evidence: '피해자가 경찰에 휴대전화를 임의제출하였다', status: 'recognized', confidence: 1 }
  ],
  events: []
};

const arcs = computePropertyArcs(graph);
document.getElementById('result')!.textContent = JSON.stringify({
  arcs,
  final: arcs.filter(arc => propertyArcIsActive(arc, 3, Infinity, true))
});
