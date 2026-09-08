import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RichEditableField } from '../src/components/RichEditableField';
import '../src/styles.css';

function Fixture() {
  const [value, setValue] = useState('');
  return <RichEditableField label="테스트" value={value} collapsed={false} toolMode={null} onToggle={() => {}} onChange={setValue} onExitTool={() => {}} />;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
