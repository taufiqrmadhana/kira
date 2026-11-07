import { Link } from 'react-router-dom';
import { useResource } from '../lib/useResource';
import { money } from '../lib/format';
import { ErrorState, Loading } from '../components';

interface RecordRow { rid: string; key: string; outlet: string; day: string; reason: string; status: string; amount: number }
export function HighlightedRecords({ keys, note }: { keys: string[]; note: string }) {
  const resource = useResource<{ total: number; records: RecordRow[] }>(`/analysis/records?${new URLSearchParams({ keys: keys.join(','), limit: '1000' })}`);
  return <section>
    <div className="page-head"><div><h1>Highlighted records</h1><p>{note || 'Records Kira selected from the current matching results.'}</p></div><Link to="/analysis">Clear highlights</Link></div>
    {resource.loading ? <Loading /> : resource.error ? <ErrorState message={resource.error} retry={resource.retry} /> : <>
      <p className="table-note">{resource.data?.total.toLocaleString('id-ID')} records in this selection.</p>
      <div className="table-scroll"><table><caption className="sr-only">Records highlighted by Kira</caption><thead><tr><th>Reference</th><th>Outlet</th><th>Sales date</th><th>Status</th><th>Reason</th><th>Amount</th></tr></thead><tbody>{resource.data?.records.map(row => <tr key={row.rid}><td>{row.key}</td><td>{row.outlet}</td><td>{row.day}</td><td>{row.status}</td><td>{row.reason}</td><td className="numeric">{money(row.amount)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
