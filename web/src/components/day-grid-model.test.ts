import {expect,it} from 'vitest';
import {aggregateDay,dailyCells} from './day-grid-model';
import {dayEvidenceParams} from '../lib/dayEvidence';
it('carries missing POS evidence through outlet and month aggregation',()=>{
  const cells=dailyCells([
    {period:'2026-10-23',outlet:'Bay View',pos:100,pos_linked:100,full:100,bank_credit:1000,stl:103,stl_pos:100},
    {period:'2026-10-23',outlet:'Central Plaza',pos:200,pos_linked:200,full:200,bank_credit:2000,stl:200,stl_pos:200},
  ],[{day:'2026-10-23',outlet:'Bay View',to_check:151000,not_in_bank:0,review:0}]);
  expect(cells[0].rate).toBe(100);
  expect(cells[0].stl_unlinked_pos).toBe(3);
  expect(dayEvidenceParams(new URLSearchParams(),cells[0]).get('stage')).toBe('l1');
  const month=aggregateDay(cells)!;
  expect(month.stl_unlinked_pos).toBe(3);
  expect(month.outlet).toBe('');
  expect(dayEvidenceParams(new URLSearchParams(),month).get('stage')).toBe('l1');
});
it('opens a settlement-only day in stage one without inventing a POS rate',()=>{
  const [cell]=dailyCells([{period:'2026-10-23',outlet:'Bay View',pos:0,pos_linked:0,full:0,bank_credit:0,stl:1,stl_pos:0}],[]);
  expect(cell.rate).toBeNull();
  expect(cell.stl_unlinked_pos).toBe(1);
  expect(dayEvidenceParams(new URLSearchParams(),cell).get('stage')).toBe('l1');
});
