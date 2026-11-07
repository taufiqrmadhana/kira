import { expect, it } from 'vitest';
import { periodRange } from './period';
it('drills a weekly or monthly rate into the whole period rather than just its first day', () => {
    expect(periodRange('2026-10-19', 'week')).toEqual(['2026-10-19', '2026-10-25']);
    expect(periodRange('2026-10', 'month')).toEqual(['2026-10-01', '2026-10-31']);
    expect(periodRange('2028-02', 'month')).toEqual(['2028-02-01', '2028-02-29']);
    expect(periodRange('2026-10-24', 'day')).toEqual(['2026-10-24', '2026-10-24']);
    expect(periodRange('', 'all')).toBeNull();
});
