import {useEffect,useMemo,useState} from 'react';
import {type ColumnDef} from '@tanstack/react-table';
import {CheckCircle2,Download,XCircle} from 'lucide-react';
import {Button,DataTable,LinkChip,StatusChip} from '../../components';
import {download,identity} from '../../lib/api';
import {date,money,plural} from '../../lib/format';
import {useEndpoint} from '../../lib/query';
import RecordFilters,{type RecordFacets} from './RecordFilters';
import './records-table.css';

export type EvidenceRow=Record<string,unknown>;
export interface ResultRecord {
  i:number;g:number;rid:string;key:string;day:string;outlet:string;provider:string;
  status:string;reason:string;r1:string;r2:string;group_size:number;group_nett:number|null;
  pos:EvidenceRow|null;stl:EvidenceRow|null;bank_i:number|null;amount?:number;
}
export interface RecordsResponse {
  total:number;offset:number;limit:number;
  status_counts:Record<string,number>;
  columns:Record<string,{name:string;type:string}[]>;
  records:ResultRecord[];
  banks:Record<string,EvidenceRow>;
}
export type CompareRecord=(record:ResultRecord,banks:Record<string,EvidenceRow>,origin?:HTMLElement)=>void;
export interface RecordsTableProps {scope?:string;caption?:string;client?:string;onTotal?:(total:number)=>void;view?:'combined'|'records'|'chains';facets?:RecordFacets;onScopeChange?:(scope:string)=>void;onCompare?:CompareRecord}
const allowedFilters=new Set(['date_from','date_to','outlet','provider','status','reason','q','amount_min','amount_max','keys','ids','pos_only','only_differences']);
function scopeParameters(scope:string){return new URLSearchParams([...new URLSearchParams(scope)].filter(([key,value])=>allowedFilters.has(key)&&value!==''));}
export function exportRecords(scope='',client=identity.client()){
  const params=scopeParameters(scope).toString();
  return download(`/analysis/export${params?'?'+params:''}`,'kira-records.csv',client);
}
function text(row:EvidenceRow|null|undefined,...fields:string[]){
  for(const field of fields){const value=row?.[field];if(value!==null&&value!==undefined&&String(value).trim())return String(value);}
  return '';
}
function amount(row:EvidenceRow|null|undefined,field:string){
  const value=row?.[field];return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):undefined;
}
function Amount({value}:{value:number|undefined}){return <span className="numeric">{value===undefined?'—':money(value)}</span>;}
function Reference({value,missing,onCompare}:{value:string;missing:string;onCompare?:(origin:HTMLElement)=>void}){return value?onCompare?<button type="button" className="records-reference records-compare-trigger" data-tour="record-compare" title={value} aria-label={`Compare ${value}`} onClick={event=>onCompare(event.currentTarget)}>{value}</button>:<span className="records-reference" title={value}>{value}</span>:<span className="records-absent">{missing}</span>;}

/** Server-paged result evidence. Bank credits are shown once per bank on each page. */
export default function RecordsTable({scope='',caption='Records',client=identity.client(),onTotal,view='combined',facets,onScopeChange,onCompare}:RecordsTableProps){
  const [localFilters,setLocalFilters]=useState({external:scope,value:scope});
  const activeScope=onScopeChange||view==='combined'?scope:localFilters.external===scope?localFilters.value:scope;
  const changeScope=(next:string)=>onScopeChange?onScopeChange(next):setLocalFilters({external:scope,value:next});
  const [groupByBank,setGroupByBank]=useState(true);
  const grouped=view!=='chains'&&groupByBank;
  const filterKey=scopeParameters(activeScope);filterKey.sort();
  const scopeKey=`${client}:${filterKey}`;
  const [settings,setSettings]=useState({scopeKey,offset:0,limit:20,sort:'',desc:false});
  const page=settings.scopeKey===scopeKey?settings:{...settings,scopeKey,offset:0};
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const params=scopeParameters(activeScope);
  params.set('offset',String(page.offset));params.set('limit',String(page.limit));
  if(page.sort)params.set('sort',page.sort);params.set('desc',String(page.desc));
  const records=useEndpoint<RecordsResponse>(`/analysis/records?${params}`,client);
  const data=records.data;
  useEffect(()=>{if(data&&!records.updating)onTotal?.(data.total);},[data?.total,onTotal,records.updating]);
  const firstBankRow=useMemo(()=>{
    const first=new Map<number,number>();
    for(const record of data?.records??[])if(record.bank_i!==null&&record.bank_i!==undefined&&!first.has(record.bank_i))first.set(record.bank_i,record.i);
    return first;
  },[data?.records]);
  const bankFor=(record:ResultRecord)=>record.bank_i===null||record.bank_i===undefined?undefined:data?.banks[String(record.bank_i)];
  const firstForBank=(record:ResultRecord)=>!grouped||record.bank_i!==null&&firstBankRow.get(record.bank_i)===record.i;
  const compare=(record:ResultRecord,origin:HTMLElement)=>onCompare?.(record,data?.banks??{},origin);
  const columns:ColumnDef<ResultRecord,unknown>[]=[
    {header:'Result',columns:[
      {id:'status',accessorFn:row=>row.status,header:'Status',size:144,cell:({row})=><span title={row.original.reason||row.original.status}><StatusChip tone={row.original.status==='Matched'?'green':row.original.status==='Needs review'?'amber':'red'}>{row.original.status}</StatusChip></span>},
      {id:'reason',accessorFn:row=>row.reason,header:'Why'},
      {id:'day',accessorFn:row=>row.day,header:'Record date',cell:({row})=>date(row.original.day)},
      {id:'outlet',accessorFn:row=>row.outlet,header:'Outlet',cell:({getValue})=><Reference value={String(getValue()||'')} missing="Unassigned"/>},
      {id:'provider',accessorFn:row=>row.provider,header:'Provider'},
    ]},
    {header:'POS sale',columns:[
      {id:'pos.sales_number',accessorFn:row=>text(row.pos,'sales_number','bill_number','trace_number'),header:'Sale reference',meta:{reference:true},cell:({row})=><Reference value={text(row.original.pos,'sales_number','bill_number','trace_number')} missing={row.original.pos?'Reference unavailable':'No POS sale'} onCompare={onCompare?origin=>compare(row.original,origin):undefined}/>},
      {id:'pos.payment_amount',accessorFn:row=>amount(row.pos,'payment_amount'),header:'Sale amount',cell:({row})=><Amount value={amount(row.original.pos,'payment_amount')}/>},
      {id:'r1',accessorFn:row=>row.r1,header:'POS match rule',cell:({getValue})=>getValue()||'—'},
    ]},
    {header:'Settlement',columns:[
      {id:'stl.reference',accessorFn:row=>text(row.stl,'reference','transaction_id','reference_id','external_reference_id'),header:'Settlement reference',meta:{reference:true},cell:({row})=><Reference value={text(row.original.stl,'reference','transaction_id','reference_id','external_reference_id')} missing={row.original.stl?'Reference unavailable':'No settlement'} onCompare={onCompare?origin=>compare(row.original,origin):undefined}/>},
      {id:'stl.nett_amount',accessorFn:row=>amount(row.stl,'nett_amount'),header:'Nett amount',cell:({row})=><Amount value={amount(row.original.stl,'nett_amount')}/>},
    ]},
    {header:'Bank credit',columns:[
      {id:'bank.keterangan',accessorFn:row=>text(bankFor(row),'reference','bank_reference','keterangan'),header:'Bank reference',meta:{reference:true},cell:({row})=>{
        const record=row.original,bank=bankFor(record);
        if(record.bank_i===null||record.bank_i===undefined)return <span className="records-absent">No bank credit</span>;
        if(!bank)return <span className="records-absent">Bank evidence unavailable</span>;
        return firstForBank(record)?<Reference value={text(bank,'reference','bank_reference','keterangan')} missing="Reference unavailable"/>:<span className="records-bank-repeat" title={`Same bank credit: ${text(bank,'reference','bank_reference','keterangan')}`}>Same bank credit (M2-{String(record.bank_i+1).padStart(4,'0')})</span>;
      }},
      {id:'bank.kredit',accessorFn:row=>amount(bankFor(row),'kredit'),header:'Credit amount',cell:({row})=>firstForBank(row.original)?<Amount value={amount(bankFor(row.original),'kredit')}/>:<span className="numeric records-absent">—</span>},
      {id:'bank.tanggal_transaksi',accessorFn:row=>text(bankFor(row),'tanggal_transaksi','tanggal_transaksi_string'),header:'Credit date',cell:({row})=>firstForBank(row.original)?date(text(bankFor(row.original),'tanggal_transaksi','tanggal_transaksi_string')):'—'},
      {id:'bank_link',header:'Payout link',enableSorting:false,cell:({row})=>{
        const record=row.original;
        return record.bank_i!==null&&record.bank_i!==undefined&&bankFor(record)&&firstForBank(record)?<LinkChip reference={`M2-${String(record.bank_i+1).padStart(4,'0')}`} rule={record.r2||undefined} pays={record.stl?record.group_size:undefined}/>:<span className="records-absent">—</span>;
      }},
    ]},
  ];
  const leaf=(id:string)=>columns.flatMap(column=>'columns' in column?column.columns??[]:[]).find(column=>column.id===id)!;
  function stageCell(record:ResultRecord,stage:1|2){
    const rule=stage===1?record.r1:record.r2,linked=stage===1?!!record.stl:record.bank_i!==null&&record.bank_i!==undefined;
    const Icon=linked?CheckCircle2:XCircle;
    return <span className={`chain-stage ${linked?'is-linked':'is-missing'}`} aria-label={`Stage ${stage} ${linked?`linked${rule?' by '+rule:''}`:'missing'}`}><Icon size={14} aria-hidden="true"/>{rule||'Not linked'}</span>;
  }
  function chainReason(record:ResultRecord){
    if(record.reason)return record.reason;
    const differences:string[]=[],bank=bankFor(record);
    const differs=(a:unknown,b:unknown)=>a!==null&&a!==undefined&&a!==''&&b!==null&&b!==undefined&&b!==''&&a!==b;
    if(differs(record.pos?.branch,record.stl?.branch))differences.push('Outlet differs');
    if(differs(record.pos?.payment_amount,record.stl?.gross_amount))differences.push('Sale and settlement amounts differ');
    if(differs(record.group_nett,bank?.kredit))differences.push('Payout values differ');
    return differences.join('; ')||'Linked through both stages';
  }
  const displayColumns:ColumnDef<ResultRecord,unknown>[]=view==='records'?[{header:'Result',columns:[leaf('status'),leaf('pos.sales_number'),leaf('pos.payment_amount'),leaf('day'),leaf('outlet'),leaf('reason'),leaf('provider'),leaf('stl.reference'),leaf('stl.nett_amount'),leaf('r1')]},columns[3]]:view==='chains'?[
    leaf('status'),{id:'reason',header:'Reason',accessorFn:row=>row.reason,cell:({row})=><span title={chainReason(row.original)}>{chainReason(row.original)}</span>},
    leaf('pos.sales_number'),{id:'stage1',header:'POS to settlement',enableSorting:false,cell:({row})=>stageCell(row.original,1)},leaf('stl.reference'),
    {id:'stage2',header:'Settlement to bank',enableSorting:false,cell:({row})=>stageCell(row.original,2)},
    {id:'bank.keterangan',header:'Bank credit',accessorFn:row=>text(bankFor(row),'reference','bank_reference','keterangan'),cell:({row})=>row.original.bank_i===null||row.original.bank_i===undefined?<span className="records-absent">No bank credit yet</span>:<Reference value={text(bankFor(row.original),'reference','bank_reference','keterangan')} missing="Bank evidence unavailable"/>},
  ]:columns;
  async function exportSelection(){
    if(exporting)return;setExporting(true);setExportError('');
    try{await exportRecords(activeScope,client);}catch(error){setExportError(error instanceof Error?error.message:'Could not export these records. Try again.');}finally{setExporting(false);}
  }
  return <section className={`records-table records-table--${view}`} data-tour={view==='chains'?'chains':'records-table'} aria-label={`${caption} evidence`} data-ready={!records.loading&&!records.error&&!!data}>
    {view!=='combined'&&<RecordFilters scope={activeScope} counts={data?.status_counts} onChange={changeScope} facets={facets} chains={view==='chains'} grouped={grouped} onGroup={value=>{setGroupByBank(value);setSettings({...page,offset:0,sort:value?'':'day',desc:false});}}/>}
    <div className="records-table-heading"><p>{view==='chains'?'One row per POS sale, including its settlement and bank evidence.':<>{page.sort?'Records follow the selected column order.':'POS sales and settlements are grouped under their bank credit.'} {grouped?'A credit amount appears once per bank on this page.':'Bank credits can appear beside several sales.'}</>}</p><Button onClick={()=>void exportSelection()} disabled={exporting||!data?.total}><Download size={16} aria-hidden="true"/>{exporting?'Exporting…':view==='combined'?'Export records':`Export ${plural(data?.total??0,'row')}`}</Button></div>
    {exportError&&<p role="alert" className="records-export-error">{exportError}</p>}
    <DataTable caption={caption} data={data?.records??[]} columns={displayColumns} onRowClick={onCompare?(record,origin)=>compare(record,origin):undefined} getRowId={row=>String(row.i)} density="compact" stickyColumns={1} columnPicker defaultHiddenColumns={view==='chains'?[]:view==='records'?['provider','r1','bank.tanggal_transaksi']:['reason','day','outlet','provider','r1','bank.tanggal_transaksi']} loading={records.loading||records.updating} error={records.error} retry={records.retry}
      server={{offset:page.offset,limit:page.limit,total:data?.total??0,sort:page.sort,desc:page.desc,onPage:(offset,limit)=>setSettings({...page,offset,limit}),onSort:(sort,desc)=>{setGroupByBank(false);setSettings({...page,offset:0,sort,desc});}}}
      footer={data?<span>{plural(data.total,view==='chains'?'POS sale':'record')} in this selection</span>:undefined}
      emptyTitle="No records in this selection" emptyDescription="Clear a filter or choose another sales period."/>
  </section>;
}
