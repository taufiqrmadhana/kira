import {expect, it} from 'vitest';
import {dayEvidenceParams} from './dayEvidence';

it('opens Harbor missing payouts in stage two while retaining the workspace and provider', () => {
  const next = dayEvidenceParams(new URLSearchParams('c=zestly-demo&provider=SHOPEEPAY&reason=Other&period=month&from=2026-10-01'), {
    day: '2026-10-24', outlet: 'Zestly Harbor Square Surabaya', pos: 142, pos_linked: 142, not_in_bank: 9031421,
  });
  expect(Object.fromEntries(next)).toEqual({c:'zestly-demo',provider:'SHOPEEPAY',period:'month',tab:'map',stage:'l2',date_from:'2026-10-24',date_to:'2026-10-24',outlet:'Zestly Harbor Square Surabaya',reason:'Not in bank yet'});
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
