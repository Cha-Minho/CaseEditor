import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../src/components/Sidebar';
import { SidebarLayout } from '../src/components/SidebarLayout';
import type { CaseItem, Topic } from '../src/types';
import '../src/styles.css';
function Fixture() {
  const longList = new URLSearchParams(window.location.search).has('long');
  const [topics,setTopics]=useState<Topic[]>([
    {id:'criminal',name:'형사소송법',parent_id:null},
    {id:'civil',name:'민법',parent_id:null},
    {id:'evidence',name:'증거재판주의',parent_id:'criminal'},
    ...(longList ? Array.from({length:40},(_,i)=>({id:`folder-${i}`,name:`민법 세부 폴더 ${i+1}`,parent_id:'civil'})) : []),
  ].map(t=>({...t,user_id:'fixture',sort_order:0,created_at:'',updated_at:'',deleted_at:null})));
  const [cases,setCases]=useState<CaseItem[]>([
    {id:'c1',case_no:'2023도11371',topic_id:'criminal'},
    {id:'c2',case_no:'2024도163',topic_id:'criminal'},
    {id:'c3',case_no:'2026도4423',topic_id:'evidence'},
    {id:'c4',case_no:'2023도13081',topic_id:null},
    ...(longList ? Array.from({length:50},(_,i)=>({id:`case-${i}`,case_no:`2025도${1000+i}`,topic_id:'criminal'})) : []),
  ].map(c=>({...c,title:c.case_no,user_id:'fixture',important:false,api_status:'manual',api_error:null,created_at:'',updated_at:'',deleted_at:null})));
  const [selected,setSelected]=useState('판례 편집');
  const [ids,setIds]=useState<string[]>([]);
  return <SidebarLayout><Sidebar userId="fixture" topics={topics} cases={cases} notes={[]} expandedIds={[]} selectedCaseId={null} selectedCaseIds={ids} configured={false}
    onSelectCase={id=>setSelected(cases.find(c=>c.id===id)!.case_no)} onSelectCases={setIds}
    onMoveCases={(ids,topic_id)=>setCases(cs=>cs.map(c=>ids.includes(c.id)?{...c,topic_id}:c))}
    onMoveTopic={(id,parent_id)=>setTopics(ts=>ts.map(t=>t.id===id?{...t,parent_id}:t))}
    onToggleTopic={()=>{}} onAddTopic={parent_id=>setTopics(ts=>[...ts,{...ts[0],id:'new',name:'새 폴더',parent_id:parent_id||null}])}
    onRenameTopic={(id,name)=>setTopics(ts=>ts.map(t=>t.id===id?{...t,name}:t))} onDeleteTopic={id=>setTopics(ts=>ts.filter(t=>t.id!==id))}
    onAddBlank={()=>{}} onAddApiCase={async()=>{}} onAddPdfCases={async()=>{}} onImport={async()=>{}} onDeleteCases={ids=>setCases(cs=>cs.filter(c=>!ids.includes(c.id)))} onSignOut={()=>{}}/>
    <main className="editor-pane"><header className="editor-header"><h2>{selected}</h2></header><div className="field-box">판례 메모</div></main>
  </SidebarLayout>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
