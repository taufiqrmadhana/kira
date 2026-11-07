import {SummaryBandSkeleton} from './Loading';

export function DecisionCard({title,description,children,actions}:{title:string;description?:string;children:ReactNode;actions:ReactNode}){
    return <section className="decision-card"><h2>{title}</h2>{description&&<p>{description}</p>}<div>{children}</div><footer>{actions}</footer></section>;
}
export function FilterChip({label,onRemove}:{label:string;onRemove:()=>void}){
    return <button type="button" className="filter-chip" onClick={onRemove} aria-label={`Remove ${label} filter`}>{label}<X size={13}/></button>;
}
export function Switch({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}){
    return <label className="inline"><input type="checkbox" role="switch" checked={checked} onChange={event=>onChange(event.target.checked)}/>{label}</label>;
}
export function MoreFilters({count=0,children}:{count?:number;children:ReactNode}){
    return <details className="more-filters"><summary>More filters{count?` (${count})`:''}</summary><div>{children}</div></details>;
}
export function DraftMark({children}:{children:ReactNode}){
    return <div className="draft-field"><small>Kira’s draft: check it, then Save</small>{children}</div>;
}
export function SelectionBar({children}:{children:ReactNode}){
    return <section className="selection-bar" aria-label="Select data">{children}</section>;
}
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { percent } from '../lib/format';
export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}) { return <button {...props} type={type} className={`button ${variant} ${className}`}/>; }
export function StatusChip({ children, tone = 'green' }: {
    children: ReactNode;
    tone?: 'green' | 'amber' | 'red' | 'neutral';
}) { return <span className={`status ${tone}`}>{children}</span>; }
export function KpiCard({ label, value, detail, tone = 'neutral' }: {
    label: string;
    value: ReactNode;
    detail?: string;
    tone?: string;
}) { return <article className={`kpi ${tone}`}><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }
export function Ring({ value, label, size = 152 }: {
    value: number;
    label: string;
    size?: number;
}) { const safe = Math.max(0, Math.min(100, value)); return <div className="match-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${percent(value)}`}><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" className="track"/><circle cx="60" cy="60" r="50" className="value" pathLength="100" strokeDasharray={`${safe} 100`}/></svg><div><strong>{percent(value)}</strong><small>{label}</small></div></div>; }
export function Empty({ title = 'No records yet', children }: {
    title?: string;
    children?: ReactNode;
}) { return <div className="empty"><h3>{title}</h3><div className="empty-description">{children || 'Upload and match your files to see the results here.'}</div></div>; }
export function Loading() { return <SummaryBandSkeleton/>; }
export function ErrorState({ message, retry }: {
    message: string;
    retry: () => void;
}) { return <div className="error" role="alert"><h3>Couldn’t load this view</h3><p>{message}</p><Button onClick={retry}>Try again</Button></div>; }
export function Tabs({ value, onChange, items }: {
    value: string;
    onChange: (value: string) => void;
    items: {
        value: string;
        label: string;
    }[];
}) { return <div className="tabs" role="tablist" aria-label="Analysis views">{items.map((item, index) => <button type="button" key={item.value} role="tab" tabIndex={value === item.value ? 0 : -1} aria-selected={value === item.value} onClick={() => onChange(item.value)} onKeyDown={event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (delta || event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + delta + items.length) % items.length;
    onChange(items[next].value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');
    buttons?.[next].focus();
} }}>{item.label}</button>)}</div>; }
export function Segmented({ value, onChange, items, label }: {
    value: string;
    onChange: (value: string) => void;
    items: {
        value: string;
        label: string;
    }[];
    label: string;
}) { return <div className="segmented" role="group" aria-label={label}>{items.map((item, index) => <button type="button" key={item.value} tabIndex={value === item.value || !items.some(option => option.value === value) && index === 0 ? 0 : -1} aria-pressed={value === item.value} onClick={() => onChange(item.value)} onKeyDown={event => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + delta + items.length) % items.length;
    onChange(items[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
}}>{item.label}</button>)}</div>; }
export function Modal({ title, children, onClose }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []); return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget)
    onClose(); }}><header><h2>{title}</h2><Button aria-label="Close dialog" variant="quiet" onClick={onClose}><X size={20}/></Button></header>{children}</dialog>; }
export function Toast({ children, onClose }: {
    children: ReactNode;
    onClose: () => void;
}) { useEffect(() => { const id = setTimeout(onClose, 5000); return () => clearTimeout(id); }, [onClose]); return <div role="status" className="toast">{children}<Button aria-label="Dismiss notification" variant="quiet" onClick={onClose}><X size={16}/></Button></div>; }
