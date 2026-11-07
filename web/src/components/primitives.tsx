import {type ButtonHTMLAttributes, type ReactNode} from 'react';
import {CheckCircle2, CircleAlert, Info, TriangleAlert, X, type LucideIcon} from 'lucide-react';
import {count, percent} from '../lib/format';
import {useAnimatedNumber} from '../lib/motion';
import {SummaryBandSkeleton} from './Loading';
import './design-system.css';

export function DecisionCard({title,description,children,actions}:{title:string;description?:string;children:ReactNode;actions:ReactNode}){
    return <section className="decision-card"><h2>{title}</h2>{description&&<p>{description}</p>}<div>{children}</div><footer>{actions}</footer></section>;
}
export function FilterChip({label,onRemove}:{label:string;onRemove:()=>void}){
    return <button type="button" className="filter-chip" onClick={onRemove} aria-label={`Remove ${label} filter`}>{label}<X size={13}/></button>;
}
export function Switch({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}){
    return <label className="ds-switch"><input type="checkbox" role="switch" checked={checked} onChange={event=>onChange(event.target.checked)}/>{label}</label>;
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
export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}) { return <button {...props} type={type} className={`button ${variant} ${className}`}/>; }
export type StatusTone = 'green' | 'amber' | 'red' | 'neutral';
export function StatusChip({children, tone = 'green', reason, icon}: {
    children: ReactNode;
    tone?: StatusTone;
    reason?: string;
    icon?: LucideIcon;
}) {
    const Icon = icon ?? ({green: CheckCircle2, amber: TriangleAlert, red: CircleAlert, neutral: Info}[tone]);
    return <span className={`status status-v2 ${tone}`}><Icon size={12} aria-hidden="true"/><span><span className="status-label">{children}</span>{reason && <small className="status-reason">{reason}</small>}</span></span>;
}
export interface KpiCardProps {
    label: string;
    value?: ReactNode;
    numericValue?: number;
    formatValue?: (value: number) => string;
    detail?: string;
    tone?: string;
    animate?: boolean;
}
export function KpiCard({label, value, numericValue, formatValue = count, detail, tone = 'neutral', animate = true}: KpiCardProps) {
    const number = numericValue ?? (typeof value === 'number' ? value : undefined);
    const display = useAnimatedNumber(number ?? 0, {enabled: animate && number !== undefined});
    return <article className={`kpi kpi-v2 ${tone}`}><p>{label}</p><strong>{number === undefined ? value : <><span aria-hidden="true">{formatValue(display)}</span><span className="sr-only">{formatValue(number)}</span></>}</strong>{detail && <small>{detail}</small>}</article>;
}
export function Ring({value, label, size = 160, animate = true}: {
    value: number;
    label: string;
    size?: number;
    animate?: boolean;
}) {
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    const display = useAnimatedNumber(safe, {duration: 900, enabled: animate});
    const compact = size <= 80, stroke = compact ? 6 : 12;
    const finalText = percent(value), text = Number.isFinite(value) ? percent(display) : finalText;
    return <div className={`match-ring ring-v2${compact ? ' ring-small' : ''}`} style={{width:size}} role="img" aria-label={`${label}: ${finalText}`}>
        <div className="ring-graphic" style={{width:size,height:size}} aria-hidden="true">
            <svg viewBox={`0 0 ${size} ${size}`}><circle cx={size/2} cy={size/2} r={(size-stroke)/2} strokeWidth={stroke} className="track"/><circle cx={size/2} cy={size/2} r={(size-stroke)/2} strokeWidth={stroke} strokeOpacity={display > 0 ? 1 : 0} className="value" pathLength="100" strokeDasharray={`${display} 100`}/></svg>
            <div className="ring-value"><strong data-long={finalText.length > 5}>{text}</strong>{!compact && <small>{label}</small>}</div>
        </div>
        {compact && <span className="ring-caption" aria-hidden="true">{label}</span>}
    </div>;
}
export function Empty({ title = 'No records yet', children }: {
    title?: string;
    children?: ReactNode;
}) { return <div className="empty"><h3>{title}</h3><div className="empty-description">{children || 'Upload and match your files to see the results here.'}</div></div>; }
export function Loading() { return <SummaryBandSkeleton/>; }
export function ErrorState({ message, retry }: {
    message: string;
    retry: () => void;
}) { return <div className="error" role="alert"><h3>Couldn’t load this view</h3><p>{message}</p><Button onClick={retry}>Try again</Button></div>; }
export function Tabs({ value, onChange, items, label = "Analysis views" }: {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    items: {
        value: string;
        label: string;
        subtitle?: string;
    }[];
}) { return <div className="tabs tabs-v2" role="tablist" aria-label={label}>{items.map((item, index) => <button type="button" key={item.value} role="tab" tabIndex={value === item.value ? 0 : -1} aria-selected={value === item.value} onClick={() => onChange(item.value)} onKeyDown={event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (delta || event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + delta + items.length) % items.length;
    onChange(items[next].value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');
    buttons?.[next].focus();
} }}><span>{item.label}</span>{item.subtitle && <small>{item.subtitle}</small>}</button>)}</div>; }
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
