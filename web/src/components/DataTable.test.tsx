import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';
afterEach(cleanup);
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
