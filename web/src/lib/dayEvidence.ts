interface DayEvidence {day:string; outlet:string; pos:number; pos_linked:number; not_in_bank:number}

/** Match-table URL vocabulary, with the evidence stage chosen from the missing link. */
export function dayEvidenceParams(current: URLSearchParams, cell: DayEvidence) {
  const next = new URLSearchParams(current);
  for (const key of ['from','to','selection_period','reason','keys','ids','highlight','outlet']) next.delete(key);
  next.set('tab','map');
  next.set('stage',cell.pos_linked < cell.pos ? 'l1' : 'l2');
  next.set('date_from',cell.day);
  next.set('date_to',cell.day);
  if (cell.outlet) next.set('outlet',cell.outlet);
  if (cell.not_in_bank > 0 && cell.pos_linked === cell.pos) next.set('reason','Not in bank yet');
  return next;
}
