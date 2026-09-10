import { alignLegalGraphTimeline, computePropertyArcs, propertyArcIsActive } from '../src/lib/plotGraph';
import type { LegalGraph } from '../src/types';

const graph: LegalGraph = {
  parties: [
    { id: 'accused', name: '피고인' },
    { id: 'victim', name: '공소외 1' },
    { id: 'police', name: '경찰' }
  ],
  objects: [
    { id: 'phone', name: '피고인 소유 휴대전화 2대' },
    { id: 'cartridge', name: '합성대마 카트리지' },
    { id: 'warrant', name: '압수수색영장', ownerId: 'police' }
  ],
  relations: [
    { id: 'pickup', from: 'accused', to: 'accused', label: '카트리지를 찾아 가지고 옴', kind: 'status', sequence: 1, objectId: 'cartridge', effect: 'poss', evidence: '피고인이 카트리지를 찾아 가지고 왔다', status: 'recognized', confidence: 1 },
    { id: 'handover', from: 'accused', to: 'victim', label: '카트리지를 건네줌', kind: 'status', sequence: 2, objectId: 'cartridge', effect: 'poss', evidence: '피고인이 공소외인에게 카트리지를 건네주었다', status: 'recognized', confidence: 1 },
    { id: 'submit', from: 'victim', to: 'police', label: '휴대전화 2대 임의제출', kind: 'status', sequence: 3, objectId: 'phone', effect: 'own', evidence: '피해자가 경찰에 휴대전화를 임의제출하였다', status: 'recognized', confidence: 1 },
    { id: 'seize', from: 'police', to: 'accused', label: '영장 없이 피고인 소유 휴대전화 2대를 압수', kind: 'status', sequence: 4, objectId: 'phone', effect: 'poss', evidence: '경찰이 휴대전화를 압수하였다', status: 'recognized', confidence: 1 },
    { id: 'present', from: 'police', to: 'accused', label: '압수수색영장 제시', kind: 'notice', sequence: 5, objectId: 'warrant', effect: 'own', evidence: '경찰이 영장을 제시하였다', status: 'recognized', confidence: 1 }
  ],
  events: []
};

const arcs = computePropertyArcs(graph);
const misalignedTimeline: LegalGraph = {
  parties: graph.parties,
  objects: [],
  events: [
    { id: 'ev1', sequence: 1, date: '2024.04.04', text: '피고인이 범행을 부인함', evidence: '부인하였다' },
    { id: 'ev2', sequence: 2, date: '2024.04.15', text: '피고인이 부인하고 선별절차 참여를 거부함', evidence: '부인하고 더 이상 선별절차에 참여할 수 없다고 하였다' },
    { id: 'ev3', sequence: 3, date: '2024.05.24', text: '통화녹음 파일을 압수함', evidence: '통화녹음 파일 8개를 압수하였다' },
    { id: 'ev4', sequence: 4, text: '대법원이 파기환송함', evidence: '원심판결을 파기하고 환송한다' }
  ],
  relations: [
    { id: 't1', from: 'accused', to: 'police', label: '범행 부인', kind: 'statement', sequence: 1, date: '2024.04.04', evidence: '부인하였다', status: 'recognized', confidence: 1 },
    { id: 't2', from: 'police', to: 'accused', label: '녹음파일 재생', kind: 'notice', sequence: 2, date: '2024.04.15', evidence: '파일을 재생하였다', status: 'recognized', confidence: 1 },
    { id: 't3', from: 'accused', to: 'police', label: '선별절차 거부', kind: 'statement', sequence: 3, date: '2024.04.15', evidence: '선별절차에 참여할 수 없다고 하였다', status: 'recognized', confidence: 1 },
    { id: 't4', from: 'accused', to: 'police', label: '통화녹음 파일 압수', kind: 'other', sequence: 4, date: '2024.05.24', evidence: '통화녹음 파일 8개를 압수하였다', status: 'recognized', confidence: 1 },
    { id: 't5', from: 'police', to: 'accused', label: '파기환송', kind: 'dispute', sequence: 5, evidence: '원심판결을 파기하고 환송한다', status: 'recognized', confidence: 1 }
  ]
};
const alignedTimeline = alignLegalGraphTimeline(misalignedTimeline)!;
document.getElementById('result')!.textContent = JSON.stringify({
  arcs,
  alignedSequences: alignedTimeline.relations.map(relation => relation.sequence),
  before: arcs.filter(arc => propertyArcIsActive(arc, 0, 0, false)),
  step3: arcs.filter(arc => propertyArcIsActive(arc, 3, 0, false)),
  step4: arcs.filter(arc => propertyArcIsActive(arc, 4, 0, false)),
  cartridgeStep1: arcs.filter(arc => arc.thing === 'cartridge' && propertyArcIsActive(arc, 1, 0, false)),
  cartridgeStep2: arcs.filter(arc => arc.thing === 'cartridge' && propertyArcIsActive(arc, 2, 0, false)),
  final: arcs.filter(arc => propertyArcIsActive(arc, 5, Infinity, true))
});
