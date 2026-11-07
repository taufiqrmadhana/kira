import {useEffect,useMemo,useState} from 'react';
import {type ColumnDef} from '@tanstack/react-table';
import {Download} from 'lucide-react';
import {Button,DataTable,LinkChip,StatusChip} from '../../components';
import {download,identity} from '../../lib/api';
import {date,money,plural} from '../../lib/format';
import {useEndpoint} from '../../lib/query';
import './records-table.css';

type EvidenceRow=Record<string,unknown>;
export interface ResultRecord {
  i:number;g:number;rid:string;key:string;day:string;outlet:string;provider:string;
  status:string;reason:string;r1:string;r2:string;group_size:number;group_nett:number|null;
  pos:EvidenceRow|null;stl:EvidenceRow|null;bank_i:number|null;
}
export interface RecordsResponse {
  total:number;offset:number;limit:number;
  status_counts:Record<string,number>;
  columns:Record<string,{name:string;type:string}[]>;
  records:ResultRecord[];
  banks:Record<string,EvidenceRow>;
}
export interface RecordsTableProps {scope?:string;caption?:string;client?:string;onTotal?:(total:number)=>void}
const allowedFilters=new Set(['date_from','date_to','outlet','provider','status','reason','q','amount_min','amount_max','keys','ids']);
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
function Reference({value,missing}:{value:string;missing:string}){return value?<span className="records-reference" title={value}>{value}</span>:<span className="records-absent">{missing}</span>;}

/** Server-paged result evidence. Bank credits are shown once per bank on each page. */
export default function RecordsTable({scope='',caption='Records',client=identity.client(),onTotal}:RecordsTableProps){
  const filterKey=scopeParameters(scope);filterKey.sort();
  const scopeKey=`${client}:${filterKey}`;
  const [settings,setSettings]=useState({scopeKey,offset:0,limit:20,sort:'',desc:false});
  const page=settings.scopeKey===scopeKey?settings:{...settings,scopeKey,offset:0};
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const params=scopeParameters(scope);
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
  const firstForBank=(record:ResultRecord)=>record.bank_i!==null&&firstBankRow.get(record.bank_i)===record.i;
  const columns:ColumnDef<ResultRecord,unknown>[]=[
    {header:'Result',columns:[
      {id:'status',accessorFn:row=>row.status,header:'Status',size:144,cell:({row})=><span title={row.original.reason||row.original.status}><StatusChip tone={row.original.status==='Matched'?'green':row.original.status==='Needs review'?'amber':'red'}>{row.original.status}</StatusChip></span>},
      {id:'reason',accessorFn:row=>row.reason,header:'Why'},
      {id:'day',accessorFn:row=>row.day,header:'Record date',cell:({row})=>date(row.original.day)},
      {id:'outlet',accessorFn:row=>row.outlet,header:'Outlet',cell:({getValue})=><Reference value={String(getValue()||'')} missing="Unassigned"/>},
      {id:'provider',accessorFn:row=>row.provider,header:'Provider'},
    ]},
    {header:'POS sale',columns:[
      {id:'pos.sales_number',accessorFn:row=>text(row.pos,'sales_number','bill_number','trace_number'),header:'Sale reference',meta:{reference:true},cell:({row})=><Reference value={text(row.original.pos,'sales_number','bill_number','trace_number')} missing={row.original.pos?'Reference unavailable':'No POS sale'}/>},
      {id:'pos.payment_amount',accessorFn:row=>amount(row.pos,'payment_amount'),header:'Sale amount',cell:({row})=><Amount value={amount(row.original.pos,'payment_amount')}/>},
      {id:'r1',accessorFn:row=>row.r1,header:'POS match rule',cell:({getValue})=>getValue()||'—'},
    ]},
    {header:'Settlement',columns:[
      {id:'stl.reference',accessorFn:row=>text(row.stl,'reference','transaction_id','reference_id','external_reference_id'),header:'Settlement reference',meta:{reference:true},cell:({row})=><Reference value={text(row.original.stl,'reference','transaction_id','reference_id','external_reference_id')} missing={row.original.stl?'Reference unavailable':'No settlement'}/>},
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
  async function exportSelection(){
    if(exporting)return;setExporting(true);setExportError('');
    try{await exportRecords(scope,client);}catch(error){setExportError(error instanceof Error?error.message:'Could not export these records. Try again.');}finally{setExporting(false);}
  }
  return <section className="records-table" aria-label={`${caption} evidence`} data-ready={!records.loading&&!records.error&&!!data}>
    <div className="records-table-heading"><p>{page.sort?'Records follow the selected column order.':'POS sales and settlements are grouped under their bank credit.'} A credit amount appears once per bank on this page.</p><Button onClick={()=>void exportSelection()} disabled={exporting||!data?.total}><Download size={16} aria-hidden="true"/>{exporting?'Exporting…':'Export records'}</Button></div>
    {exportError&&<p role="alert" className="records-export-error">{exportError}</p>}
    <DataTable caption={caption} data={data?.records??[]} columns={columns} getRowId={row=>String(row.i)} density="compact" stickyColumns={1} columnPicker defaultHiddenColumns={['reason','day','outlet','provider','r1','bank.tanggal_transaksi']} loading={records.loading||records.updating} error={records.error} retry={records.retry}
      server={{offset:page.offset,limit:page.limit,total:data?.total??0,sort:page.sort,desc:page.desc,onPage:(offset,limit)=>setSettings({...page,offset,limit}),onSort:(sort,desc)=>setSettings({...page,offset:0,sort,desc})}}
      footer={data?<span>{plural(data.total,'record')} in this selection</span>:undefined}
      emptyTitle="No records in this selection" emptyDescription="Clear a filter or choose another sales period."/>
  </section>;
}
