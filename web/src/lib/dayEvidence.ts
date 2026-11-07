interface DayEvidence {day:string; outlet:string; pos:number; pos_linked:number; not_in_bank:number;stl_unlinked_pos?:number;gap_sale?:number;to_check?:number}

/** Match-table URL vocabulary, with the evidence stage chosen from the missing link. */
export function dayEvidenceParams(current: URLSearchParams, cell: DayEvidence) {
  const next = new URLSearchParams(current);
  for (const key of ['from','to','selection_period','reason','keys','ids','highlight','outlet']) next.delete(key);
  next.set('tab','map');
  const saleIssue=cell.pos_linked<cell.pos || (cell.stl_unlinked_pos||0)>0 || Math.abs(cell.gap_sale||0)>0 && (cell.to_check||0)>cell.not_in_bank;
  next.set('stage',saleIssue ? 'l1' : 'l2');
  next.set('date_from',cell.day);
  next.set('date_to',cell.day);
  if (cell.outlet) next.set('outlet',cell.outlet);
  if (cell.not_in_bank > 0 && !saleIssue) next.set('reason','Not in bank yet');
  return next;
}
