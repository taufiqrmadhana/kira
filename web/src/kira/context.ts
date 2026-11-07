import {date} from '../lib/format';
import type {ScreenContext} from './protocol';
export function screenContext(pathname:string,search:string,extras:ScreenContext={}):ScreenContext{
 const params=new URLSearchParams(search),page=pathname.startsWith('/analysis')?'Match analysis':pathname.startsWith('/insights')?'Insights':pathname.startsWith('/workflow')?'Workflow':'Overview';
 return {page,tab:params.get('tab')||(page==='Match analysis'?'rates':''),view:params.get('map_view')||params.get('rate_view')||(page==='Match analysis'?(params.get('tab')==='map'?'linked':!params.get('tab')||params.get('tab')==='rates'?'grid':''):''),stage:params.get('stage')||(page==='Match analysis'&&params.get('tab')==='map'?'l1':''),outlet:params.get('outlet')||'',provider:params.get('provider')||'',date_from:params.get('date_from')||'',date_to:params.get('date_to')||'',selected_record_keys:params.get('keys')||params.get('ids')||'',tutorial:null,...extras};
}
export function contextLabel(context:ScreenContext){
 const tab=({rates:'Match rate',map:'Match map',records:'Records',follow:'Follow-up'} as Record<string,string>)[String(context.tab)]||context.tab;
 const stage=context.stage==='l1'?'POS → Settlement':context.stage==='l2'?'Settlement → Bank':context.stage;
 const period=context.date_from===context.date_to?(context.date_from?date(String(context.date_from)):''):[context.date_from,context.date_to].filter(Boolean).map(value=>date(String(value))).join(' to ');
 return [context.page,tab,context.view,stage,context.outlet,context.provider,period,context.guided_step?`Guided close: ${context.guided_step}`:'',context.tutorial].filter(Boolean).join(': ');
}
export function suggestions(context:ScreenContext,data?:{lowest?:{outlet:string;rate:number};toCheck?:number}){
 const percent=(value:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value)+'%';
 if(context.page==='Workflow')return ["Do today's close with me",'How do I upload files?','How does matching work?','Give me the full tour'];
 if(context.page==='Match analysis')return ["Why aren't these matched?",'Which outlet-day is worst?','Highlight the records to check',data?.toCheck===undefined?'Explain the money differences':`Where does the Rp ${new Intl.NumberFormat('id-ID').format(data.toCheck)} to check come from?`];
 if(context.page==='Insights')return ['Which outlet keeps the least?',context.outlet?`Explain the payment cost at ${context.outlet}`:'Explain the payment cost for the lowest-keeping outlet','How do I use Insights?'];
 return [data?.lowest?`Why is ${data.lowest.outlet} at ${percent(data.lowest.rate)}?`:'Which outlet needs attention?', 'What changed since the last close?', 'What did KIRA learn?',"Do today's close with me"];
}
