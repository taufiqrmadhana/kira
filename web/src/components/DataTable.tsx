import {useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode} from 'react';
import {flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type Column, type ColumnDef, type RowData, type SortingState, type VisibilityState} from '@tanstack/react-table';
import {ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download} from 'lucide-react';
import {count} from '../lib/format';
import {Button, Empty, ErrorState} from './primitives';
import {Popover} from './overlays';
import {TableSkeleton} from './Loading';
import {useRovingFocus} from './useRovingFocus';

declare module '@tanstack/react-table' {
    interface ColumnMeta<TData extends RowData, TValue> {
        typeLabel?: string;
        reference?: boolean;
    }
}
export interface ServerPage {
    offset: number;
    limit: number;
    total: number;
    sort?: string;
    desc?: boolean;
    onPage: (offset: number, limit: number) => void;
    onSort?: (id: string, desc: boolean) => void;
}
export type AggregateOperation = 'sum' | 'average' | 'min' | 'max' | 'count';
export interface TableAggregate {
    label: string;
    /** Supply totals for the full selection, not just the current server page. */
    values: Partial<Record<AggregateOperation, number>>;
    format?: (value: number) => string;
}
interface Props<T> {
    data: T[];
    columns: ColumnDef<T, unknown>[];
    caption: string;
    total?: number;
    loading?: boolean;
    error?: string;
    retry?: () => void;
    footer?: ReactNode;
    aggregate?: TableAggregate;
    onExport?: () => void;
    density?: 'compact' | 'evidence';
    /** Number of data columns to pin. A selection checkbox is pinned alongside them. */
    stickyColumns?: number;
    getRowId?: (row: T) => string;
    selectable?: boolean;
    onSelectionChange?: (rows: T[]) => void;
    selectedIds?: Record<string, boolean>;
    server?: ServerPage;
    columnPicker?: boolean;
    defaultHiddenColumns?: string[];
    emptyTitle?: string;
    emptyDescription?: string;
}
const aggregateLabels: Record<AggregateOperation,string> = {sum:'Sum',average:'Average',min:'Minimum',max:'Maximum',count:'Count'};
function fieldLabel(id: string) {
    const known:Record<string,string> = {id:'ID',pos:'POS sales',stl:'Settlement',bank:'Bank',nett_amount:'Nett amount',bank_credit:'Bank credit',transaction_id:'Transaction ID'};
    if (known[id]) return known[id];
    const text=id.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').toLowerCase();
    return text.charAt(0).toUpperCase()+text.slice(1);
}
function readableColumns<T>(columns: ColumnDef<T,unknown>[]): ColumnDef<T,unknown>[] {
    return columns.map(column => {
        const raw=column.header ?? fieldLabel(column.id ?? ('accessorKey' in column ? String(column.accessorKey) : 'Value'));
        const header=typeof raw==='string'&&raw.includes('_')?fieldLabel(raw):raw;
        return ('columns' in column ? {...column,header,columns:readableColumns(column.columns ?? [])} : {...column,header}) as ColumnDef<T,unknown>;
    });
}
export function DataTable<T>({data,columns,caption,loading,error,retry,footer,aggregate,onExport,density='compact',stickyColumns=0,getRowId,selectable=false,onSelectionChange,selectedIds,server,columnPicker=false,defaultHiddenColumns=[],emptyTitle,emptyDescription}: Props<T>) {
    const [sorting,setSorting]=useState<SortingState>([]);
    const [selection,setSelection]=useState<Record<string,boolean>>({});
    const [visibility,setVisibility]=useState<VisibilityState>({});
    const [showColumns,setShowColumns]=useState(false);
    const [operation,setOperation]=useState<AggregateOperation>('sum');
    const columnsButton=useRef<HTMLButtonElement>(null);
    const activeVisibility={...Object.fromEntries(defaultHiddenColumns.map(id=>[id,false])),...visibility};
    const activeSelection=selectedIds ?? selection;
    const [focusedTick,setFocusedTick]=useState('__all__');
    function moveTick(event: KeyboardEvent<HTMLInputElement>) {
        const delta=event.key==='ArrowDown'||event.key==='ArrowRight'?1:event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:0;
        if (!delta&&event.key!=='Home'&&event.key!=='End') return;
        event.preventDefault();
        const ticks=Array.from(event.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>('[data-row-tick]')||[]);
        const index=ticks.indexOf(event.currentTarget);
        const next=event.key==='Home'?0:event.key==='End'?ticks.length-1:Math.max(0,Math.min(ticks.length-1,index+delta));
        ticks[next]?.focus();
    }
    const normalizedColumns=useMemo(()=>readableColumns(columns),[columns]);
    const selectionColumn:ColumnDef<T,unknown>={id:'select',header:'Select',size:40,enableSorting:false,enableHiding:false};
    const table=useReactTable({data,columns:selectable?[selectionColumn,...normalizedColumns]:normalizedColumns,
        state:{sorting:server?.sort?[{id:server.sort,desc:!!server.desc}]:sorting,rowSelection:activeSelection,columnVisibility:activeVisibility},getRowId,
        onColumnVisibilityChange:updater=>setVisibility(typeof updater==='function'?updater(activeVisibility):updater),
        onSortingChange:updater=>{const next=typeof updater==='function'?updater(server?.sort?[{id:server.sort,desc:!!server.desc}]:sorting):updater;if(server?.onSort)server.onSort(next[0]?.id||'',next[0]?.desc||false);else setSorting(next);},
        onRowSelectionChange:updater=>{const next=typeof updater==='function'?updater(activeSelection):updater;setSelection(next);onSelectionChange?.(data.filter((row,i)=>next[getRowId?.(row)??String(i)]));},
        manualPagination:!!server,manualSorting:!!server,
        getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel(),initialState:{pagination:{pageSize:20}}});
    const activeTick=table.getRowModel().rows.some(row=>row.id===focusedTick)?focusedTick:'__all__';
    const local=table.getState().pagination;
    const offset=server?.offset??local.pageIndex*local.pageSize,limit=server?.limit??local.pageSize,total=server?.total??data.length;
    const hideable=table.getAllLeafColumns().filter(column=>column.getCanHide());
    const columnFocus=useRovingFocus(hideable.map(column=>column.id));
    const pinned=table.getVisibleLeafColumns().slice(0,Math.max(0,stickyColumns)+(selectable&&stickyColumns>0?1:0));
    function pinnedStyle(column:Column<T,unknown>):CSSProperties|undefined {
        const index=pinned.findIndex(item=>item.id===column.id);
        if(index<0)return;
        return {position:'sticky',left:pinned.slice(0,index).reduce((sum,item)=>sum+item.getSize(),0),width:column.getSize(),minWidth:column.getSize(),maxWidth:column.getSize()};
    }
    const operations=aggregate?Object.keys(aggregate.values) as AggregateOperation[]:[];
    const activeOperation=operations.includes(operation)?operation:operations[0];
    const aggregateValue=aggregate&&activeOperation?aggregate.values[activeOperation]:undefined;
    return <section className="table-block" data-density={density} aria-label={caption} aria-busy={!!loading}>
        {loading&&data.length>0&&<p className="updating" role="status">Updating…</p>}
        {error&&data.length>0&&<ErrorState message={error} retry={retry||(()=>{})}/>}
        {(columnPicker||onExport)&&<div className="table-actions">{columnPicker&&<button ref={columnsButton} className="button secondary" type="button" aria-expanded={showColumns} aria-haspopup="dialog" onClick={()=>setShowColumns(!showColumns)}><Columns3 size={16} aria-hidden="true"/>Columns</button>}{onExport&&<Button aria-label={`Export ${caption}`} onClick={onExport}><Download size={16} aria-hidden="true"/>Export</Button>}</div>}
        {columnPicker&&showColumns&&<Popover label={`${caption} columns`} anchorRef={columnsButton} align="end" width={260} onClose={()=>setShowColumns(false)}><div className="table-column-options">{hideable.map(column=><label className="inline" key={column.id}><input type="checkbox" {...columnFocus(column.id)} checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()}/>{typeof column.columnDef.header==='string'?column.columnDef.header:fieldLabel(column.id)}</label>)}</div></Popover>}
        {loading&&!data.length?<TableSkeleton headers={table.getVisibleLeafColumns().filter(column=>column.id!=='select').map(column=>typeof column.columnDef.header==='string'?column.columnDef.header:fieldLabel(column.id))}/>:error&&!data.length?<ErrorState message={error} retry={retry||(()=>{})}/>:!data.length?<Empty title={emptyTitle||'No rows for this selection'}>{emptyDescription||'Try another period or clear the filters.'}</Empty>:
            <div className="table-scroll" tabIndex={selectable?-1:0} role="region" aria-label={`${caption} scrollable table`}><table><caption className="sr-only">{caption}</caption>
                <thead>{table.getHeaderGroups().map(group=><tr key={group.id} className={group.headers.some(header=>header.column.columns.length>0)?'table-group-band':undefined}>{group.headers.map(header=>{
                    const style=pinnedStyle(header.column),type=header.column.columnDef.meta?.typeLabel;
                    const label=flexRender(header.column.columnDef.header,header.getContext());
                    return <th key={header.id} scope={header.column.columns.length>0?'colgroup':'col'} colSpan={header.colSpan} style={style} data-pinned={!!style} aria-sort={header.column.getIsSorted()==='asc'?'ascending':header.column.getIsSorted()==='desc'?'descending':undefined}>
                        {header.column.id==='select'&&!header.isPlaceholder?<input type="checkbox" data-row-tick="__all__" tabIndex={activeTick==='__all__'?0:-1} onFocus={()=>setFocusedTick('__all__')} onKeyDown={moveTick} aria-label={`Select all ${caption} rows on this page`} checked={data.length>0&&table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()}/>:header.isPlaceholder?null:<>{header.column.getCanSort()?<button type="button" onClick={header.column.getToggleSortingHandler()}>{label}{header.column.getIsSorted()==='asc'?<ArrowUp size={12} aria-hidden="true"/>:header.column.getIsSorted()==='desc'?<ArrowDown size={12} aria-hidden="true"/>:null}</button>:label}{type&&<small className="table-type">{type}</small>}</>}
                    </th>;
                })}</tr>)}</thead>
                <tbody>{table.getRowModel().rows.map(row=><tr key={row.id} data-selected={row.getIsSelected()}>{row.getVisibleCells().map(cell=>{
                    const style=pinnedStyle(cell.column),reference=cell.column.columnDef.meta?.reference??/(?:^|_)(?:reference|ref|id)$/.test(cell.column.id);
                    return <td key={cell.id} style={style} data-pinned={!!style} className={reference?'table-reference':undefined} title={reference?String(cell.getValue()??''):undefined}>
                        {cell.column.id==='select'?<input type="checkbox" data-row-tick={row.id} tabIndex={activeTick===row.id?0:-1} onFocus={()=>setFocusedTick(row.id)} onKeyDown={moveTick} aria-label={`Select ${caption} row ${row.index+1}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()}/>:flexRender(cell.column.columnDef.cell,cell.getContext())}
                    </td>;
                })}</tr>)}</tbody>
            </table></div>}
        {(!loading||data.length>0)&&(!error||data.length>0)&&(footer||aggregateValue!==undefined)&&<div className="table-total">{footer}{aggregate&&aggregateValue!==undefined&&<div className="table-aggregate"><label><span className="sr-only">{caption} aggregate</span><select aria-label={`${caption} aggregate`} value={activeOperation} onChange={event=>setOperation(event.target.value as AggregateOperation)}>{operations.map(item=><option key={item} value={item}>{aggregateLabels[item]}</option>)}</select></label><span>{aggregate.label}</span><strong>{(activeOperation==='count'?count:aggregate.format??count)(aggregateValue)}</strong></div>}</div>}
        {(!loading||data.length>0)&&(!error||data.length>0)&&total>0&&<div className="pagination"><span>{count(data.length?offset+1:0)}–{count(Math.min(offset+table.getRowModel().rows.length,total))} of {count(total)}</span><div><label className="inline">Rows per page<select aria-label={`${caption} rows per page`} value={limit} onChange={event=>{const size=Number(event.target.value);if(server)server.onPage(0,size);else table.setPageSize(size);}}>{[20,50,100].map(size=><option key={size}>{size}</option>)}</select></label><Button aria-label={`${caption} previous page`} disabled={offset===0} onClick={()=>server?server.onPage(Math.max(0,offset-limit),limit):table.previousPage()}><ChevronLeft size={16} aria-hidden="true"/></Button><Button aria-label={`${caption} next page`} disabled={offset+limit>=total} onClick={()=>server?server.onPage(offset+limit,limit):table.nextPage()}><ChevronRight size={16} aria-hidden="true"/></Button></div></div>}
    </section>;
}
