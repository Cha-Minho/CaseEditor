import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiagramEditor } from '../src/components/DiagramEditor';
import type { CaseNotes } from '../src/types';
import { generateLegalGraph } from '../src/lib/legalGraphApi';
import { legalGraphToDiagram } from '../src/lib/plotGraph';
import '../src/styles.css';

function Fixture() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<CaseNotes['diagram']>();
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const sourceHtml = "<p>원고 갑은 피고 을에게 X 토지를 매도하고 매매대금을 받았다.</p>";
  const analyze = async () => {
    if (generating) return;
    setGenerating(true);
    setGenerationError('');
    try {
      setValue(legalGraphToDiagram(await generateLegalGraph(sourceHtml)));
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '관계도를 분석하지 못했습니다.');
    } finally {
      setGenerating(false);
    }
  };
  return <><button onClick={() => setOpen(true)}>관계도 열기</button>{open && <DiagramEditor title="2020다12345" sourceHtml={sourceHtml} value={value} generating={generating} generationError={generationError} onGenerate={analyze} onDismissGenerationError={() => setGenerationError('')} onChange={setValue} onClose={() => setOpen(false)} />}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
