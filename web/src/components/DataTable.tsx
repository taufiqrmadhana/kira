import {useRovingFocus} from './useRovingFocus';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Empty, ErrorState, Loading } from './index';
export interface ServerPage {
    offset: number;
    limit: number;
    total: number;
    sort?: string;
    desc?: boolean;
    onPage: (offset: number, limit: number) => void;
    onSort?: (id: string, desc: boolean) => void;
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
    getRowId?: (row: T) => string;
    selectable?: boolean;
    onSelectionChange?: (rows: T[]) => void;
    selectedIds?: Record<string, boolean>;
    server?: ServerPage;
    columnPicker?: boolean;
    /** Optional evidence fields stay available in the picker, including async columns. */
    defaultHiddenColumns?: string[];
    emptyTitle?: string;
    emptyDescription?: string;
}
export function DataTable<T>({ data, columns, caption, loading, error, retry, footer, getRowId, selectable = false, onSelectionChange, selectedIds, server, columnPicker = false, defaultHiddenColumns = [], emptyTitle, emptyDescription }: Props<T>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [selection, setSelection] = useState<Record<string, boolean>>({});
    const [visibility, setVisibility] = useState<VisibilityState>({});
    const activeVisibility = { ...Object.fromEntries(defaultHiddenColumns.map(id => [id, false])), ...visibility };
    const activeSelection = selectedIds ?? selection;
    const [focusedTick, setFocusedTick] = useState('__all__');
    function moveTick(event: KeyboardEvent<HTMLInputElement>) {
        const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
        if (!delta && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const ticks = Array.from(event.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>('[data-row-tick]') || []);
        const index = ticks.indexOf(event.currentTarget);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? ticks.length - 1 : Math.max(0, Math.min(ticks.length - 1, index + delta));
        ticks[next]?.focus();
    }
    const selectionColumn: ColumnDef<T, unknown> = { id: 'select', header: 'Select', enableSorting: false, enableHiding: false };
    const table = useReactTable({ data, columns: selectable ? [selectionColumn, ...columns] : columns,
        state: { sorting: server?.sort ? [{ id: server.sort, desc: !!server.desc }] : sorting, rowSelection: activeSelection, columnVisibility: activeVisibility }, getRowId,
        onColumnVisibilityChange: updater => setVisibility(typeof updater === 'function' ? updater(activeVisibility) : updater),
        onSortingChange: updater => { const next = typeof updater === 'function' ? updater(server?.sort ? [{ id: server.sort, desc: !!server.desc }] : sorting) : updater; if (server?.onSort)
            server.onSort(next[0]?.id || '', next[0]?.desc || false);
        else
            setSorting(next); },
        onRowSelectionChange: updater => { const next = typeof updater === 'function' ? updater(activeSelection) : updater; setSelection(next); onSelectionChange?.(data.filter((row, i) => next[getRowId?.(row) ?? String(i)])); },
        manualPagination: !!server, manualSorting: !!server,
        getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 20 } } });
    const activeTick = table.getRowModel().rows.some(row => row.id === focusedTick) ? focusedTick : '__all__';
    const local = table.getState().pagination;
    const offset = server?.offset ?? local.pageIndex * local.pageSize, limit = server?.limit ?? local.pageSize, total = server?.total ?? data.length;
    const columnFocus=useRovingFocus(table.getAllLeafColumns().filter(column=>column.getCanHide()).map(column=>column.id));
    return <section className="table-block" aria-label={caption}>
    {columnPicker && <details className="column-picker"><summary>Columns</summary><div>{table.getAllLeafColumns().filter(column => column.getCanHide()).map(column => <label className="inline" key={column.id}><input type="checkbox" {...columnFocus(column.id)} checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()}/>{typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}</label>)}</div></details>}
    {loading ? <Loading /> : error ? <ErrorState message={error} retry={retry || (() => { })}/> : !data.length ? <Empty title={emptyTitle || 'No rows for this selection'}>{emptyDescription || 'Try another period or clear the filters.'}</Empty> :
            <div className="table-scroll" tabIndex={selectable ? -1 : 0} role="region" aria-label={`${caption} scrollable table`}><table><caption className="sr-only">{caption}</caption><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope={header.colSpan > 1 ? 'colgroup' : 'col'} colSpan={header.colSpan} aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>{header.column.id === 'select' ? <input type="checkbox" data-row-tick="__all__" tabIndex={activeTick === '__all__' ? 0 : -1} onFocus={() => setFocusedTick('__all__')} onKeyDown={moveTick} aria-label={`Select all ${caption} rows on this page`} checked={data.length > 0 && table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()}/> : header.isPlaceholder ? null : header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? <ArrowUp size={12}/> : header.column.getIsSorted() === 'desc' ? <ArrowDown size={12}/> : null}</button> : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id} data-selected={row.getIsSelected()}>{row.getVisibleCells().map(cell => <td key={cell.id}>{cell.column.id === 'select' ? <input type="checkbox" data-row-tick={row.id} tabIndex={activeTick === row.id ? 0 : -1} onFocus={() => setFocusedTick(row.id)} onKeyDown={moveTick} aria-label={`Select ${caption} row ${row.index + 1}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()}/> : flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>}
    {!loading && !error && footer && <div className="table-total">{footer}</div>}
    {!loading && !error && total > 0 && <div className="pagination"><span>{data.length ? offset + 1 : 0}–{Math.min(offset + table.getRowModel().rows.length, total)} of {total}</span><div><label className="inline">Rows per page<select aria-label={`${caption} rows per page`} value={limit} onChange={e => { const size = Number(e.target.value); if (server)
        server.onPage(0, size);
    else
        table.setPageSize(size); }}>{[20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><Button aria-label={`${caption} previous page`} disabled={offset === 0} onClick={() => server ? server.onPage(Math.max(0, offset - limit), limit) : table.previousPage()}><ChevronLeft size={16}/></Button><Button aria-label={`${caption} next page`} disabled={offset + limit >= total} onClick={() => server ? server.onPage(offset + limit, limit) : table.nextPage()}><ChevronRight size={16}/></Button></div></div>}
  </section>;
}
