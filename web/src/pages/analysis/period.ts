export function periodRange(value: string, group: string): [
    string,
    string
] | null {
    if (group === 'all' || !value)
        return null;
    if (group === 'month' && /^\d{4}-\d{2}$/.test(value)) {
        const [year, month] = value.split('-').map(Number);
        return [value + '-01', new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const end = new Date(value + 'T12:00:00Z');
        if (group === 'week')
            end.setUTCDate(end.getUTCDate() + 6);
        return [value, end.toISOString().slice(0, 10)];
    }
    return null;
}
