export const count = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
export function parseDisplayDate(value:string):string|null {
    if(!value.trim())return '';
    const parts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if(!parts)return null;
    const [,day,month,year]=parts;
    const iso=`${year}-${month}-${day}`;
    const parsed=new Date(iso+'T12:00:00Z');
    return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso?iso:null;
}
export const money = (value: number) => `Rp ${count(value)}`;
export const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: value > 99.95 && value < 100 ? 2 : 1 }).format(value)}%`;
export const date = (value: string) => { if (!value)
    return '—'; const parsed = new Date(value.length === 10 ? value + 'T12:00:00+07:00' : value); if (Number.isNaN(parsed.getTime()))
    return '—'; const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).formatToParts(parsed); return ['weekday', 'day', 'month', 'year'].map(type => parts.find(p => p.type === type)?.value).join(' '); };
export const plural = (value:number, singular:string, pluralForm=singular+'s') => `${count(value)} ${value===1?singular:pluralForm}`;
