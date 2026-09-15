import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchLawCase } from '../src/lib/lawApi';

function Fixture() {
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const result = await fetchLawCase('2020도1538');
      setMessage(`${result.case_no}:${result.source_html?.length || 0}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '실패');
    }
  };

  return <><button onClick={load}>판례 불러오기</button><output>{message}</output></>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
