import {Link} from 'react-router-dom';
import {ArrowUpRight} from 'lucide-react';
import {Empty, StatusChip} from '../../components';
import {clientPath, query} from '../../lib/api';
import {money} from '../../lib/format';
import type {AnomaliesResponse} from './api';

const names: Record<string, string> = {
  missing_money: 'Missing money', low_match: 'Low match rate', high_deduction: 'High payment cost',
  sales_drop: 'Sales drop', sales_spike: 'Sales spike',
};

export default function AnomalyList({anomalies, skipped}: AnomaliesResponse) {
  const checks = new Map<string, string[]>();
  for (const check of skipped) {
    const kinds = checks.get(check.why) || [];
    const name = names[check.kind] || check.kind;
    if (!kinds.includes(name)) kinds.push(name);
    checks.set(check.why, kinds);
  }
  return <>
    {anomalies.length ? <ul className="insights-anomalies" aria-label="Outlet anomalies">
      {anomalies.map((item, index) => <li key={`${item.kind}-${item.outlet}-${item.period.from}-${index}`}>
        <Link to={clientPath('/analysis?' + query(item.filter))} className="insights-anomaly">
          <div className="insights-anomaly-heading"><strong>{names[item.kind] || item.kind}</strong><StatusChip tone={item.severity === 'high' ? 'red' : 'amber'}>{item.severity === 'high' ? 'High' : 'Low'}</StatusChip></div>
          <div className="insights-anomaly-copy"><strong>{item.outlet}</strong><p>{item.why}</p></div>
          <strong className="numeric">{money(item.rupiah)}</strong><ArrowUpRight size={17} aria-hidden="true"/>
        </Link>
      </li>)}
    </ul> : <Empty title="No anomalies in this selection">All available checks passed for the reconciled results shown.</Empty>}
    {!!checks.size && <p className="insights-muted insights-skipped">Checks skipped: {Array.from(checks, ([why, kinds]) => `${kinds.join(' and ')}: ${why}`).join('; ')}.</p>}
  </>;
}
