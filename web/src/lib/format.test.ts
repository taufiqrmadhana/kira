import {expect,it} from 'vitest';
import {money,count,percent,date} from './format';
it('formats Indonesian money, counts and percentages consistently',()=>{expect(money(9031421)).toBe('Rp 9.031.421');expect(count(8639)).toBe('8.639');expect(percent(8639/8784*100)).toBe('98,3%');expect(percent(null)).toBe('—');});
it('keeps an ISO sale date on the same calendar day',()=>{expect(date('2026-10-24')).toBe('Sat 24 Oct 2026');expect(date('')).toBe('—');});
