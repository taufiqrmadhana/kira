import { count, date, money } from '../lib/format';
export interface DayGridRateRow {
    period: string; outlet: string; pos: number; pos_linked: number; full: number; bank_credit: number;
    stl?: number; stl_bank?: number; review?: number; mismatched?: number;
}
export interface DayGridGap {day: string; outlet: string; to_check: number; not_in_bank: number; review: number}
export interface DayGridCell {
    day: string; outlet: string; rate: number | null; pos: number; pos_linked: number; full: number; bank_credit: number;
    to_check: number; not_in_bank: number; review: number; mismatched: number;
}
export type RampStep = 'high' | 'strong' | 'good' | 'healthy' | 'amber' | 'red';
export function rampStep(rate: number): RampStep {
    if (rate >= 99.5) return 'high';
    if (rate >= 98) return 'strong';
    if (rate >= 96) return 'good';
    if (rate >= 95) return 'healthy';
    if (rate >= 80) return 'amber';
    return 'red';
}
export function dayAriaLabel(cell: DayGridCell) {
    const flags = cell.to_check > 0 ? `${money(cell.to_check)} to check` : cell.review > 0 ? `${count(cell.review)} needs review` : 'no money to check';
    return `${cell.outlet || 'All outlets'}, ${date(cell.day)}, end to end ${cell.rate===null?'unavailable (no POS sales)':`${count(cell.rate)} percent`}, ${flags}${cell.not_in_bank > 0 ? ', waiting for the bank' : ''}.`;
}
export function dailyCells(rows: DayGridRateRow[], gaps: DayGridGap[]) {
    const groups = new Map<string, DayGridCell>();
    for (const row of rows) {
        // A bank credit with no outlet must not create a fictitious outlet in the grid.
        if (!row.outlet || !/^\d{4}-\d{2}-\d{2}$/.test(row.period)) continue;
        const key = `${row.period}\0${row.outlet}`;
        const cell = groups.get(key) ?? {day:row.period,outlet:row.outlet,rate:0,pos:0,pos_linked:0,full:0,bank_credit:0,to_check:0,not_in_bank:0,review:0,mismatched:0};
        cell.pos += row.pos; cell.pos_linked += row.pos_linked; cell.full += row.full;
        cell.bank_credit += row.bank_credit || 0;
        cell.mismatched += row.mismatched ?? Math.max(0,row.pos-row.full-(row.review || 0));
        groups.set(key,cell);
    }
    for (const gap of gaps) {
        const cell=groups.get(`${gap.day}\0${gap.outlet}`);
        if (!cell) continue;
        cell.to_check += gap.to_check; cell.not_in_bank += gap.not_in_bank; cell.review += gap.review;
    }
    return [...groups.values()].map(cell=>({...cell,rate:cell.pos?cell.full/cell.pos*100:null,mismatched:Math.max(0,cell.pos-cell.full-cell.review)}));
}
export function aggregateDay(cells: DayGridCell[]): DayGridCell | null {
    if (!cells.length) return null;
    const result = cells.reduce((sum,cell)=>({...sum,pos:sum.pos+cell.pos,pos_linked:sum.pos_linked+cell.pos_linked,full:sum.full+cell.full,bank_credit:sum.bank_credit+cell.bank_credit,to_check:sum.to_check+cell.to_check,not_in_bank:sum.not_in_bank+cell.not_in_bank,review:sum.review+cell.review,mismatched:sum.mismatched+cell.mismatched}),{...cells[0],outlet:cells.every(c=>c.outlet===cells[0].outlet)?cells[0].outlet:'',pos:0,pos_linked:0,full:0,bank_credit:0,to_check:0,not_in_bank:0,review:0,mismatched:0});
    result.rate=result.pos?result.full/result.pos*100:null;
    return result;
}
export function calendarDays(from:string,to:string) {
    const days:string[]=[]; const cursor = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`);
    while (cursor<=end) { days.push(cursor.toISOString().slice(0,10)); cursor.setUTCDate(cursor.getUTCDate()+1); }
    return days;
}
