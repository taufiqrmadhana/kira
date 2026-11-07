import {expect, it} from 'vitest';
import {dayEvidenceParams} from './dayEvidence';

it('opens Harbor missing payouts in stage two while retaining the workspace and provider', () => {
  const next = dayEvidenceParams(new URLSearchParams('c=zestly-demo&provider=SHOPEEPAY&reason=Other&period=month&from=2026-10-01'), {
    day: '2026-10-24', outlet: 'Zestly Harbor Square Surabaya', pos: 142, pos_linked: 142, not_in_bank: 9031421,
  });
  expect(Object.fromEntries(next)).toEqual({c:'zestly-demo',provider:'SHOPEEPAY',period:'month',tab:'map',stage:'l2',date_from:'2026-10-24',date_to:'2026-10-24',outlet:'Zestly Harbor Square Surabaya',reason:'No approved bank link'});
});

it('opens missing settlement evidence in stage one and clears an outlet for an aggregate month cell', () => {
  const next = dayEvidenceParams(new URLSearchParams('outlet=Harbor&keys=old&highlight=old'), {
    day:'2026-10-22',outlet:'',pos:100,pos_linked:99,not_in_bank:0,
  });
  expect(next.get('stage')).toBe('l1');
  expect(next.get('outlet')).toBeNull();
  expect(next.get('keys')).toBeNull();
  expect(next.get('reason')).toBeNull();
});

it('opens settlement-without-POS evidence in stage one even when every POS sale matches',()=>{
  const next=dayEvidenceParams(new URLSearchParams(),{day:'2026-10-23',outlet:'Zestly Bay View Cilegon',pos:100,pos_linked:100,not_in_bank:0,stl_unlinked_pos:3});
  expect(next.get('stage')).toBe('l1');
  expect(next.get('reason')).toBeNull();
});

it('keeps a mixed missing-POS and pending-bank day unfiltered in stage one',()=>{
  const next=dayEvidenceParams(new URLSearchParams('reason=Not+in+bank+yet'),{day:'2026-10-23',outlet:'Bay View',pos:0,pos_linked:0,not_in_bank:151000,stl_unlinked_pos:1});
  expect(next.get('stage')).toBe('l1');
  expect(next.get('reason')).toBeNull();
});

it('opens linked sales with an unexplained amount difference in stage one',()=>{
  const next=dayEvidenceParams(new URLSearchParams(),{day:'2026-10-21',outlet:'Riverside',pos:100,pos_linked:100,not_in_bank:0,to_check:68000,gap_sale:68000});
  expect(next.get('stage')).toBe('l1');
});
it('keeps expected deductions without money to check on stage two',()=>{
  const next=dayEvidenceParams(new URLSearchParams(),{day:'2026-10-26',outlet:'Lakeside',pos:100,pos_linked:100,not_in_bank:0,to_check:0,gap_sale:2500});
  expect(next.get('stage')).toBe('l2');
});
