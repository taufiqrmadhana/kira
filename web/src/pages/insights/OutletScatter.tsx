import {useId, useState} from 'react';
import {EvidenceTooltip} from '../../components/EvidenceTooltip';
import {count, money, percent} from '../../lib/format';
import type {Outlet, PerformanceResponse} from './api';

export default function OutletScatter({rows, medians, onSelect}: {rows: Outlet[]; medians: PerformanceResponse['medians']; onSelect:(row:Outlet)=>void}) {
  const id = useId();
  const [focusedOutlet, setFocusedOutlet] = useState('');
  const [hovered, setHovered] = useState<{row:Outlet; anchor:Element}|null>(null);
  const [focused, setFocused] = useState<{row:Outlet; anchor:Element}|null>(null);
  const [dismissed, setDismissed] = useState(false);
  const active = dismissed ? null : hovered || focused;
  const points = rows.filter(row => row.keep_rate !== null && Number.isFinite(row.keep_rate));
  if (!points.length) return <p className="insights-muted">A keep rate needs gross sales for the selected period.</p>;
  const left = 76, right = 465, top = 34;
  const bottom = Math.max(300, points.length * 24 + 28), height = bottom + 70;
  const maxSales = Math.max(...points.map(row => row.gross_sales), 1) * 1.08;
  const minKeep = Math.min(0, ...points.map(row => row.keep_rate!));
  const maxKeep = Math.max(1, ...points.map(row => row.keep_rate!)) * 1.03;
  const x = (value: number) => left + value / maxSales * (right - left);
  const y = (value: number) => bottom - (value - minKeep) / (maxKeep - minKeep) * (bottom - top);
  const ordered = [...points].sort((a, b) => b.keep_rate! - a.keep_rate! || a.outlet.localeCompare(b.outlet));
  const labelY = ordered.map((row, i) => Math.max(y(row.keep_rate!), i ? top + i * 24 : top));
  for (let i = 1; i < labelY.length; i++) labelY[i] = Math.max(labelY[i], labelY[i - 1] + 24);
  if (labelY.at(-1)! > bottom) {
    labelY[labelY.length - 1] = bottom;
    for (let i = labelY.length - 2; i >= 0; i--) labelY[i] = Math.min(labelY[i], labelY[i + 1] - 24);
  }
  const marked = ordered.filter(row => row.quadrant === 'sells_a_lot_keeps_little');
  const hasMedians = medians.gross_sales !== null && medians.keep_rate !== null;
  const activeOutlet = ordered.some(row => row.outlet === focusedOutlet) ? focusedOutlet : ordered[0].outlet;
  return <div><p className="insights-chart-hint insights-muted">Scroll the chart to see every outlet label.</p><div className="insights-chart-scroll" role="region" aria-label="Outlet scatter chart; scroll horizontally on small screens">
    <svg className="insights-scatter" viewBox={`0 0 780 ${height}`} role="group" aria-label="Gross sales and money kept in the bank by outlet" aria-describedby={`${id}-description`}>
      <desc id={`${id}-description`}>Each labelled point is an outlet. Right means more gross sales; up means a higher share kept in bank. Arrow keys move between outlets; Enter opens the evidence.</desc>
      {medians.gross_sales !== null && medians.keep_rate !== null && <>
        {!!marked.length && <rect x={x(medians.gross_sales)} y={y(medians.keep_rate)} width={right - x(medians.gross_sales)} height={bottom - y(medians.keep_rate)} className="insights-quadrant-shade"/>}
        <line x1={x(medians.gross_sales)} x2={x(medians.gross_sales)} y1={top} y2={bottom} className="insights-median"/>
        <line x1={left} x2={right} y1={y(medians.keep_rate)} y2={y(medians.keep_rate)} className="insights-median"/>
      </>}
      {[0, .25, .5, .75, 1].map(step => {
        const value = minKeep + step * (maxKeep - minKeep);
        return <g key={step}><line x1={left - 4} x2={right} y1={y(value)} y2={y(value)} className="insights-chart-grid"/><text x={left - 10} y={y(value) + 4} textAnchor="end">{percent(value * 100)}</text></g>;
      })}
      <line x1={left} x2={right} y1={bottom} y2={bottom} className="insights-chart-axis"/>
      {[0, .5, 1].map(step => <text key={step} x={x(step * maxSales)} y={bottom + 22} textAnchor="middle">{money(step * maxSales)}</text>)}
      <text x={left} y={18}>Kept in bank (%)</text><text x={(left + right) / 2} y={bottom + 52} textAnchor="middle">Gross sales</text>
      {ordered.map((row, i) => <g key={row.outlet} role="button" tabIndex={row.outlet === activeOutlet ? 0 : -1} className="insights-point-target"
        aria-label={`${row.outlet}, ${money(row.gross_sales)} gross sales, ${percent(row.keep_rate! * 100)} kept in bank, ${money(row.to_check)} to check. Open Match analysis.`}
        aria-describedby={active?.row.outlet === row.outlet ? `${id}-tooltip` : undefined}
        onFocus={event => {setFocusedOutlet(row.outlet); setFocused({row,anchor:event.currentTarget}); setDismissed(false);}}
        onBlur={() => setFocused(null)}
        onMouseEnter={event => {setHovered({row,anchor:event.currentTarget}); setDismissed(false);}}
        onMouseLeave={() => setHovered(null)}
        onClick={() => onSelect(row)}
        onKeyDown={event => {
          if (event.key === 'Escape') {setDismissed(true); return;}
          if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); onSelect(row); return;}
          const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
          if (!delta && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? ordered.length - 1 : (i + delta + ordered.length) % ordered.length;
          event.currentTarget.parentElement?.querySelectorAll<SVGGElement>('[role="button"]')[next]?.focus();
        }}>
        <circle cx={x(row.gross_sales)} cy={y(row.keep_rate!)} r={14} fill="transparent"/>
        <path d={`M ${x(row.gross_sales) + 5} ${y(row.keep_rate!)} L 490 ${labelY[i]} L 500 ${labelY[i]}`} className="insights-label-line"/>
        <circle cx={x(row.gross_sales)} cy={y(row.keep_rate!)} r={5} className={row.quadrant === 'sells_a_lot_keeps_little' ? 'insights-point insights-point-review' : 'insights-point'}/>
        <text x={508} y={labelY[i] + 4}>{row.outlet.replace(/^Zestly\s+/, '')}</text>
      </g>)}
    </svg>
  </div>
    <div className="insights-chart-legend" aria-label="Chart legend">
      {marked.length < points.length && <span><i className="insights-legend-dot" aria-hidden="true"/>Green dot: other outlets</span>}
      {!!marked.length && <span><i className="insights-legend-dot is-review" aria-hidden="true"/>{hasMedians && <i className="insights-legend-area" aria-hidden="true"/>}Amber dot{hasMedians ? ' and shaded area' : ''}: sells a lot, keeps little</span>}
      {hasMedians && <span><i className="insights-legend-line is-dashed" aria-hidden="true"/>Dashed lines: selection medians</span>}
      <span><i className="insights-legend-line" aria-hidden="true"/>Fine lines: outlet labels</span>
    </div>
    <p className="visual-summary">{marked.length ? <>{count(marked.length)} {marked.length === 1 ? 'outlet sells' : 'outlets sell'} above the median and {marked.length === 1 ? 'keeps' : 'keep'} below it: <strong>{marked.map(row => row.outlet.replace(/^Zestly\s+/, '')).join(', ')}</strong>;</> : <>{hasMedians ? 'No outlets sell above the median and keep below it;' : 'Median comparison is unavailable for this selection;'}</>} <strong>{count(points.length)}</strong> outlets plotted{hasMedians ? <>; median sales <strong>{money(medians.gross_sales!)}</strong>, median kept <strong>{percent(medians.keep_rate! * 100)}</strong></> : ''}.</p>
    {active && <EvidenceTooltip id={`${id}-tooltip`} anchor={active.anchor} title={active.row.outlet} subtitle={`Kept in bank ${percent(active.row.keep_rate! * 100)}`} rows={[
      {label:'POS sales',value:money(active.row.gross_sales)}, {label:'Nett settled',value:money(active.row.nett_settled)},
      {label:'Bank credit',value:money(active.row.bank_received)}, {label:'Payment cost',value:money(active.row.deduction)},
      {label:'End to end',value:percent(active.row.match_rate)},
    ]} flags={[
      ...(active.row.to_check > 0 ? [{tone:'red' as const,text:`${money(active.row.to_check)} to check`}] : [{tone:'green' as const,text:'No money to check for this outlet.'}]),
      ...(active.row.pending_bank > 0 ? [{tone:'amber' as const,text:`${money(active.row.pending_bank)} waiting for the bank`}] : []),
    ]} action="Click to open this outlet in Match analysis"/>}
  </div>;
}
