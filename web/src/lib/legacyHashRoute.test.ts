import { describe, expect, it } from 'vitest';
import { legacyHashRoute } from './legacyHashRoute';

describe('legacy hash bookmarks', () => {
    it('keeps the workspace and selection from the outer query', () => {
        expect(legacyHashRoute('https://kira.madgun.us/?c=zestly-demo&from=2026-10-20#/overview'))
            .toBe('/overview?c=zestly-demo&from=2026-10-20');
    });

    it('lets the bookmarked route override matching query parameters', () => {
        expect(legacyHashRoute('https://kira.madgun.us/?c=old-client&from=2026-10-20#/analysis?c=zestly-demo&tab=rate'))
            .toBe('/analysis?c=zestly-demo&from=2026-10-20&tab=rate');
    });

    it('keeps repeated route filters while replacing their outer values', () => {
        expect(legacyHashRoute('https://kira.madgun.us/?c=zestly-demo&outlet=old#/analysis?outlet=harbor&outlet=garden'))
            .toBe('/analysis?c=zestly-demo&outlet=harbor&outlet=garden');
    });

    it('converts simple hash routes without adding an empty query', () => {
        expect(legacyHashRoute('https://kira.madgun.us/#/insights')).toBe('/insights');
    });

    it('leaves native routes and ordinary fragments alone', () => {
        expect(legacyHashRoute('https://kira.madgun.us/overview?c=zestly-demo')).toBeNull();
        expect(legacyHashRoute('https://kira.madgun.us/overview#latest-close')).toBeNull();
    });

    it('rejects a hash route that points to another origin', () => {
        expect(legacyHashRoute('https://kira.madgun.us/#//other.example/overview')).toBeNull();
    });
});
