import { expect, it } from 'vitest';
import { money, count, percent, date } from './format';
import {parseDisplayDate} from './format';
it('does not round an incomplete matching stage up to 100 percent',()=>{
    expect(percent(8781/8784*100)).toBe('99,97%');
});
it('rejects impossible display dates and accepts leap days without shifting timezone',()=>{
    expect(parseDisplayDate('24/10/2026')).toBe('2026-10-24');
    expect(parseDisplayDate('29/02/2028')).toBe('2028-02-29');
    expect(parseDisplayDate('30/02/2026')).toBeNull();
    expect(parseDisplayDate('10/24/2026')).toBeNull();
});
it('formats Indonesian money, counts and percentages consistently', () => { expect(money(9031421)).toBe('Rp 9.031.421'); expect(count(8639)).toBe('8.639'); expect(percent(8639 / 8784 * 100)).toBe('98,3%'); expect(percent(null)).toBe('—'); });
it('keeps an ISO sale date on the same calendar day', () => { expect(date('2026-10-24')).toBe('Sat 24 Oct 2026'); expect(date('')).toBe('—'); });
