import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RichEditableField } from '../src/components/RichEditableField';
import '../src/styles.css';

function Fixture() {
  const [value, setValue] = useState('');
  const [secondValue, setSecondValue] = useState('');
  return <>
    <RichEditableField label="첫 번째" value={value} collapsed={false} toolMode={null} onToggle={() => {}} onChange={setValue} onExitTool={() => {}} />
    <RichEditableField label="두 번째" value={secondValue} collapsed={false} toolMode={null} onToggle={() => {}} onChange={setSecondValue} onExitTool={() => {}} />
  </>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
