import { count, date, money } from '../lib/format';
import { EvidenceTooltip } from './EvidenceTooltip';
import type { DayGridCell } from './day-grid-model';
export function DayGridTooltip({id,anchor,cell,latestDay}:{id:string;anchor:Element|null;cell:DayGridCell|null;latestDay?:string}) {
    if (!cell) return null;
    const age = latestDay ? Math.max(0, Math.round((Date.parse(latestDay)-Date.parse(cell.day))/86400000)) : 0;
    const flags: {tone:'red'|'amber'|'green';text:string}[]=[];
    if (cell.not_in_bank>0) flags.push({tone:'amber',text:`${money(cell.not_in_bank)} settled, not in the bank yet${age ? ` (${count(age)} ${age===1?'day':'days'})` : ''}`});
    const other = Math.max(0,cell.to_check-cell.not_in_bank);
    if (other>0) flags.push({tone:'red',text:`${money(other)} to check: missing or differing payment evidence`});
    if (cell.review>0) flags.push({tone:'amber',text:`${count(cell.review)} ${cell.review===1?'record needs':'records need'} review`});
    if (!cell.to_check && !cell.review) flags.push({tone:'green',text:'No money to check on this day.'});
    return <EvidenceTooltip id={id} anchor={anchor} title={<>{date(cell.day)}<br/>{cell.outlet || 'All outlets'}</>} subtitle={cell.rate===null?'End to end unavailable: no POS sales':`End to end ${new Intl.NumberFormat('id-ID',{minimumFractionDigits:1,maximumFractionDigits:1}).format(cell.rate)}%`} rows={[
        {label:'POS sales',value:count(cell.pos)},
        {label:'Linked to settlement',value:count(cell.pos_linked)},
        {label:'In the bank',value:count(cell.full)},
        {label:'Needs review',value:count(cell.review)},
        {label:'Mismatched POS',value:count(cell.mismatched)},
        {label:'Bank credit (Rp)',value:count(cell.bank_credit)},
    ]} flags={flags} action="Click to open this day"/>;
}
