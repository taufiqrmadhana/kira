export const count=(value:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(value);
export const money=(value:number)=>`Rp ${count(value)}`;
export const percent=(value:number|null|undefined)=>value==null||!Number.isFinite(value)?'—':`${new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value)}%`;
export const date=(value:string)=>{if(!value)return '—';const parsed=new Date(value.length===10?value+'T12:00:00+07:00':value);if(Number.isNaN(parsed.getTime()))return '—';const parts=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).formatToParts(parsed);return ['weekday','day','month','year'].map(type=>parts.find(p=>p.type===type)?.value).join(' ');};
