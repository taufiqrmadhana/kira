import {Check, CircleHelp, type LucideIcon} from 'lucide-react';
import {type ReactNode} from 'react';
import {count, percent} from '../lib/format';
import {Button, KpiCard, Ring, type KpiCardProps} from './primitives';

/** The tutorial controller opens the requested chapter; clicking never changes data. */
export function PageHeader({title, subtitle, actions, tutorial}: {
  title:string;
  subtitle?:ReactNode;
  actions?:ReactNode;
  tutorial?:string;
}) {
  const heading=title.replace(/\.+\s*$/, '');
  return <header className="page-head page-header-v2"><div><h1>{heading}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="page-header-actions">{actions}{tutorial && <Button variant="quiet" className="tutorial-trigger" aria-label={`Start ${heading} tutorial`} onClick={() => window.dispatchEvent(new CustomEvent('kira:start-tutorial',{detail:{chapter:tutorial}}))}><CircleHelp size={20} aria-hidden="true"/></Button>}</div>
  </header>;
}

export function SummaryBand({rate, label='Match rate', kpis=[], stages=[], children, animate=true}: {
  rate:number|null;
  label?:string;
  kpis?:KpiCardProps[];
  stages?:{label:string;value:number|null;detail?:string}[];
  children?:ReactNode;
  animate?:boolean;
}) {
  return <section className="summary-band" aria-label="Match summary">
    <div className="summary-main-rate">{rate === null ? <div className="summary-no-rate"><strong>—</strong><span>{label}</span><small>No records in this selection</small></div> : <Ring value={rate} label={label} animate={animate}/>}</div>
    <div className="summary-kpis" data-count={kpis.length}>{kpis.map(kpi => <KpiCard key={kpi.label} animate={animate} {...kpi}/>)}{children}</div>
    {stages.length > 0 && <div className="summary-stages">{stages.map(stage => <div key={stage.label} className="summary-stage">{stage.value === null ? <div className="summary-stage-empty"><strong>—</strong><span>{stage.label}</span><small>No records</small></div> : <Ring value={stage.value} size={72} label={stage.label} animate={animate}/>} {stage.detail && <small>{stage.detail}</small>}</div>)}</div>}
  </section>;
}

export function RateCell({value, label='Match rate'}:{value:number|null;label?:string}) {
  const safe = value === null || !Number.isFinite(value) ? null : Math.max(0,Math.min(100,value));
  const tone = safe === null ? 'neutral' : safe >= 95 ? 'green' : safe >= 80 ? 'amber' : 'red';
  return <span className="rate-cell" role="img" aria-label={`${label}: ${percent(value)}`} data-tone={tone}>
    <span aria-hidden="true">{percent(value)}</span><span className="rate-cell-track" aria-hidden="true"><span style={{width:`${safe ?? 0}%`}}/></span>
  </span>;
}

export function LinkChip({reference,rule,pays,onClick}:{reference:string;rule?:string;pays?:number;onClick?:()=>void}) {
  const content=<><span className="link-chip-reference" title={reference}>{reference}</span>{rule && <span className="link-chip-rule">{rule}</span>}{pays !== undefined && <span className="link-chip-count">pays {count(pays)}</span>}</>;
  return onClick ? <button type="button" className="link-chip" onClick={onClick}>{content}</button> : <span className="link-chip">{content}</span>;
}

export function ToggleChip({label,checked,onChange,disabled=false}:{label:string;checked:boolean;onChange:(checked:boolean)=>void;disabled?:boolean}) {
  return <button type="button" className="toggle-chip" aria-pressed={checked} disabled={disabled} onClick={()=>onChange(!checked)}><Check size={12} aria-hidden="true" data-visible={checked}/>{label}</button>;
}

export function IconTile({icon:Icon,label}:{icon:LucideIcon;label?:string}) {
  return <span className="icon-tile" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}><Icon size={20} aria-hidden="true"/></span>;
}
