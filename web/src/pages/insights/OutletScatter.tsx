import {useId} from 'react';
import {money, percent} from '../../lib/format';
import type {Outlet, PerformanceResponse} from './api';

export default function OutletScatter({rows, medians}: {rows: Outlet[]; medians: PerformanceResponse['medians']}) {
  const id = useId();
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
  return <div><p className="insights-chart-hint insights-muted">Scroll the chart to see every outlet label.</p><div className="insights-chart-scroll" tabIndex={0} role="region" aria-label="Outlet scatter chart; scroll horizontally on small screens">
    <svg className="insights-scatter" viewBox={`0 0 780 ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Gross sales and money kept in the bank by outlet</title>
      <desc id={`${id}-description`}>Each labelled point is an outlet. Dashed lines show median gross sales and keep rate. The lower right quadrant sells above the median and keeps below the median. Exact amounts are in the outlet table below.</desc>
      {medians.gross_sales !== null && medians.keep_rate !== null && <>
        <rect x={x(medians.gross_sales)} y={y(medians.keep_rate)} width={right - x(medians.gross_sales)} height={bottom - y(medians.keep_rate)} className="insights-quadrant-shade"/>
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
      {ordered.map((row, i) => <g key={row.outlet}>
        <title>{`${row.outlet}: ${money(row.gross_sales)} gross sales; ${percent(row.keep_rate! * 100)} kept in bank`}</title>
        <path d={`M ${x(row.gross_sales) + 5} ${y(row.keep_rate!)} L 490 ${labelY[i]} L 500 ${labelY[i]}`} className="insights-label-line"/>
        <circle cx={x(row.gross_sales)} cy={y(row.keep_rate!)} r={row.quadrant === 'sells_a_lot_keeps_little' ? 6 : 4} className={row.quadrant === 'sells_a_lot_keeps_little' ? 'insights-point insights-point-review' : 'insights-point'}/>
        <text x={508} y={labelY[i] + 4}>{row.outlet.replace(/^Zestly\s+/, '')}</text>
      </g>)}
    </svg>
  </div></div>;
}
