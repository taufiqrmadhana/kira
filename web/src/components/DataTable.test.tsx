import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';
afterEach(cleanup);
it('keeps the rows and totals visible while updating', () => {
  render(<DataTable caption="Payments" data={[{reference:'PAY-42'}]} columns={[{accessorKey:'reference',header:'Reference'}]} loading footer="Rp 500"/>);
  expect(screen.getByText('PAY-42')).toBeInTheDocument();
  expect(screen.getByText('Rp 500')).toBeInTheDocument();
  expect(screen.getByRole('region', {name:'Payments'})).toHaveAttribute('aria-busy','true');
  expect(screen.getByText('Updating…')).toBeInTheDocument();
});

it('keeps loaded evidence and totals available after a refresh fails',()=>{
  render(<DataTable caption="Payments" data={[{reference:'PAY-42'}]} columns={[{accessorKey:'reference',header:'Reference'}]} error="Refresh failed" footer="Rp 500"/>);
  expect(screen.getByText('PAY-42')).toBeInTheDocument();
  expect(screen.getByText('Rp 500')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Refresh failed');
});

it('offers density, sticky reference columns, human field labels and type captions', () => {
  render(<DataTable caption="Bank evidence" density="evidence" stickyColumns={1} data={[{reference:'M2-0001-VERY-LONG-REFERENCE',nett_amount:500}]} columns={[{accessorKey:'reference',header:'Reference',size:180},{accessorKey:'nett_amount',meta:{typeLabel:'Rupiah'}}]}/>);
  expect(screen.getByRole('region', {name:'Bank evidence'})).toHaveAttribute('data-density','evidence');
  expect(screen.getByRole('columnheader', {name:'Nett amount Rupiah'})).toBeInTheDocument();
  expect(screen.getByText('M2-0001-VERY-LONG-REFERENCE').closest('td')).toHaveStyle({position:'sticky',left:'0px'});
  expect(screen.getByText('M2-0001-VERY-LONG-REFERENCE').closest('td')).toHaveAttribute('title','M2-0001-VERY-LONG-REFERENCE');
});

it('uses dark bands only for grouped headers and retains an explicit aggregate and export action', () => {
  const exported=vi.fn();
  render(<DataTable caption="Rates" data={[{count:2}]} columns={[{header:'POS to settlement',columns:[{accessorKey:'count',header:'POS sales'}]}]} onExport={exported} aggregate={{label:'POS sales',values:{sum:2400,average:1200,count:2}}}/>);
  expect(screen.getByRole('columnheader', {name:'POS to settlement'}).parentElement).toHaveClass('table-group-band');
  expect(screen.getByRole('columnheader', {name:'POS sales'}).parentElement).not.toHaveClass('table-group-band');
  expect(screen.getByText('2.400')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', {name:'Rates aggregate'}), {target:{value:'average'}});
  expect(screen.getByText('1.200')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Export Rates'}));
  expect(exported).toHaveBeenCalledOnce();
});
it('reports only the visible local page range', () => {
  render(<DataTable caption="History" data={Array.from({length:45}, (_,id)=>({id}))} columns={[{accessorKey:'id',header:'ID'}]} />);
  expect(screen.getByText('1–20 of 45')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'History next page'}));
  expect(screen.getByText('21–40 of 45')).toBeInTheDocument();
});
it('keeps selection ticks in one keyboard stop with arrows and Home/End', () => {
  render(<DataTable caption="Sales" selectable data={[{id:'a'}, {id:'b'}, {id:'c'}]} getRowId={row => row.id} columns={[{accessorKey:'id',header:'ID'}]}/>);
  const ticks = screen.getAllByRole('checkbox');
  expect(ticks.map(tick => tick.tabIndex)).toEqual([0, -1, -1, -1]);
  ticks[0].focus();
  fireEvent.keyDown(ticks[0], {key:'ArrowDown'});
  expect(ticks[1]).toHaveFocus();
  expect(ticks.map(tick => tick.tabIndex)).toEqual([-1, 0, -1, -1]);
  fireEvent.keyDown(ticks[1], {key:'End'});
  expect(ticks[3]).toHaveFocus();
  fireEvent.keyDown(ticks[3], {key:'ArrowUp'});
  expect(ticks[2]).toHaveFocus();
  fireEvent.click(ticks[2]);
  expect(ticks[2]).toBeChecked();
  fireEvent.keyDown(ticks[2], {key:'Home'});
  expect(ticks[0]).toHaveFocus();
});
it('restores a reachable collection after pagination removes the focused row', () => {
  render(<DataTable caption="Sales" selectable data={Array.from({length:25}, (_,id) => ({id}))} getRowId={row => String(row.id)} columns={[{accessorKey:'id',header:'ID'}]}/>);
  const ticks = screen.getAllByRole('checkbox');
  fireEvent.keyDown(ticks[0], {key:'End'});
  fireEvent.click(screen.getByRole('button', {name:'Sales next page'}));
  expect(screen.getAllByRole('checkbox').filter(tick => tick.tabIndex === 0)).toHaveLength(1);
});
it('roves the column-picker ticks without hiding a column on arrow movement',()=>{
  render(<DataTable caption="Sales" columnPicker data={[{id:'a',amount:100}]} columns={[{accessorKey:'id',header:'ID'},{accessorKey:'amount',header:'Amount'}]}/>);
  fireEvent.click(screen.getByText('Columns'));
  const ticks=screen.getAllByRole('checkbox');
  expect(ticks.map(tick=>tick.tabIndex)).toEqual([0,-1]);
  fireEvent.keyDown(ticks[0],{key:'ArrowDown'});expect(ticks[1]).toHaveFocus();expect(ticks[1]).toBeChecked();
  fireEvent.click(ticks[1]);expect(screen.queryByRole('columnheader',{name:'Amount'})).not.toBeInTheDocument();
});

it('hides optional source columns as they arrive and retains an explicit visibility choice', () => {
  const columns = [{accessorKey:'id',header:'Reference'}, {accessorKey:'source',header:'Source ID'}];
  const view = render(<DataTable caption="Evidence" columnPicker data={[]} columns={columns.slice(0, 1)} defaultHiddenColumns={[]}/>);
  view.rerender(<DataTable caption="Evidence" columnPicker data={[{id:'PAY-001',source:'raw-uuid'}]} columns={columns} defaultHiddenColumns={['source']}/>);
  expect(screen.getByRole('columnheader', {name:'Reference'})).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', {name:'Source ID'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Columns'));
  fireEvent.click(screen.getByLabelText('Source ID'));
  expect(screen.getByRole('columnheader', {name:'Source ID'})).toBeInTheDocument();
  view.rerender(<DataTable caption="Evidence" columnPicker data={[{id:'PAY-002',source:'next-uuid'}]} columns={columns} defaultHiddenColumns={['source']}/>);
  expect(screen.getByText('next-uuid')).toBeInTheDocument();
});

it('opens row evidence without triggering it from tick or inline action controls',()=>{
  const open=vi.fn(),action=vi.fn();
  render(<DataTable caption="Payments" selectable onRowClick={open} data={[{id:'PAY-1'}]} columns={[{accessorKey:'id',header:'Reference'},{id:'action',cell:()=> <button type="button" onClick={action}>Link</button>}]}/>);
  fireEvent.click(screen.getByText('PAY-1'));expect(open).toHaveBeenCalledOnce();
  expect(open.mock.calls[0][0]).toEqual({id:'PAY-1'});
  fireEvent.click(screen.getByRole('checkbox',{name:'Select Payments row 1'}));
  fireEvent.click(screen.getByRole('button',{name:'Link'}));
  expect(open).toHaveBeenCalledOnce();expect(action).toHaveBeenCalledOnce();
});
