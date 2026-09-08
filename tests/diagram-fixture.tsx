import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiagramEditor } from '../src/components/DiagramEditor';
import type { CaseNotes } from '../src/types';
import '../src/styles.css';

function Fixture() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<CaseNotes['diagram']>();
  return <><button onClick={() => setOpen(true)}>관계도 열기</button>{open && <DiagramEditor title="2020다12345" sourceHtml="<p>원고 갑은 피고 을에게 X 토지를 매도하고 매매대금을 받았다.</p>" value={value} onChange={setValue} onClose={() => setOpen(false)} />}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
