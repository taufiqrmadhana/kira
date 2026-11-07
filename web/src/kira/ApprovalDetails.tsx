import { approvalDescription, type PendingApproval } from './protocol';

const text = (value: unknown) => typeof value === 'string' ? value : '';
const states: Record<string, string> = { open: 'Open', investigating: 'Investigating', resolved: 'Resolved' };

export function ApprovalDetails({ item }: { item: PendingApproval }) {
  if (item.tool !== 'save_follow_ups') return <p className="kira-approval-description">{approvalDescription(item)}</p>;
  const args = item.args;
  const keys = Array.isArray(args.keys) ? args.keys.filter(key => typeof key === 'string') : [];
  const scope = [text(args.outlet), text(args.day), text(args.reason)].filter(Boolean).join(' / ');
  return <>
    <p className="kira-approval-description">Save a follow-up note{keys.length ? ` on ${keys.length.toLocaleString('id-ID')} records` : ''}.</p>
    {scope && <p className="kira-approval-scope">{scope}</p>}
    <dl className="kira-approval-fields">
      <div><dt>Status</dt><dd>{states[text(args.status) || 'investigating'] || text(args.status)}</dd></div>
      <div><dt>Assignee</dt><dd>{text(args.assignee) || 'Unassigned'}</dd></div>
    </dl>
    <div className="kira-note"><span>Note to save</span><p>{text(args.note)}</p></div>
  </>;
}
