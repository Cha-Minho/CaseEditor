import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export function SidebarLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [sidebar, ...content] = Children.toArray(children);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  return (
    <div className={`app toggle-layout ${open ? 'sidebar-open' : 'sidebar-closed'} ${className}`}>
      <button
        ref={toggleRef}
        className="sidebar-toggle"
        aria-label={open ? '목차 닫기' : '목차 열기'}
        aria-expanded={open}
        aria-controls="case-navigation"
        title={open ? '목차 닫기' : '목차 열기'}
        onClick={() => setOpen(value => !value)}
      >
        {open ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
      </button>
      {open && <button className="sidebar-backdrop" aria-label="목차 닫기" onClick={() => setOpen(false)} />}
      <div id="case-navigation" className="sidebar-slot" hidden={!open} onClickCapture={event => {
        const target = event.target;
        if (window.matchMedia('(max-width: 860px)').matches && target instanceof Element
          && target.closest('.case-item') && !target.closest('input, button')) setOpen(false);
      }}>
        {sidebar}
      </div>
      {content}
    </div>
  );
}
