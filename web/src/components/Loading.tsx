import {useEffect, useState, type ReactNode} from 'react';
import './loading.css';

function Frame({kind, children}: {kind: string; children: ReactNode}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {const timer = setTimeout(() => setVisible(true), 250); return () => clearTimeout(timer);}, []);
  return <div className={`loading-layout loading-${kind}`} data-ready="false" role="status" aria-label="Loading…" data-visible={visible}>
    {visible && <span className="sr-only">Loading…</span>}
    <div className="loading-shapes" aria-hidden="true">{children}</div>
  </div>;
}
export function SummaryBandSkeleton() {
  return <Frame kind="summary"><div className="loading-ring"/><div className="loading-kpis">{Array.from({length: 4}, (_, i) => <div key={i}><span/><span/></div>)}</div></Frame>;
}
export function TableSkeleton({headers = ['Record', 'Outlet', 'Status', 'Amount']}: {headers?: string[]}) {
  return <Frame kind="table"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{Array.from({length: 5}, (_, i) => <tr key={i}>{headers.map(header => <td key={header}><span/></td>)}</tr>)}</tbody></table></Frame>;
}
export function GridSkeleton({rows = 10}: {rows?: number}) {
  return <Frame kind="grid"><div className="loading-grid-heading"/><div className="loading-grid-cells" style={{gridTemplateRows: `repeat(${rows}, 40px)`}}>{Array.from({length: rows * 8}, (_, i) => <span key={i}/>)}</div></Frame>;
}
export function ChartSkeleton() {
  return <Frame kind="chart"><div/><span/></Frame>;
}
