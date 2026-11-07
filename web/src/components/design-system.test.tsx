import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {Wallet} from 'lucide-react';
import {IconTile, LinkChip, PageHeader, RateCell, SummaryBand, ToggleChip} from './design-system';
import {KpiCard, Ring, StatusChip, Switch, Tabs} from './primitives';

afterEach(() => {cleanup(); vi.unstubAllGlobals();});

it('starts the page tutorial with its chapter and keeps the title in sentence form', () => {
  const tutorial = vi.fn();
  window.addEventListener('kira:start-tutorial', tutorial);
  render(<PageHeader title="Match analysis." subtitle="7 days, 10 outlets, 8.784 POS sales." tutorial="analysis"/>);
  expect(screen.getByRole('heading', {level:1})).toHaveTextContent('Match analysis');
  expect(screen.getByRole('heading', {level:1})).not.toHaveTextContent(/\.$/);
  fireEvent.click(screen.getByRole('button', {name:'Start Match analysis tutorial'}));
  expect(tutorial.mock.calls[0][0].detail).toEqual({chapter:'analysis'});
  window.removeEventListener('kira:start-tutorial', tutorial);
});

it('renders summary figures and direct stage labels with distinct ring sizes', () => {
  render(<SummaryBand rate={99.97} animate={false} kpis={[{label:'POS sales',value:'8.784',detail:'Rp 1.250.000'}]} stages={[{label:'POS to settlement',value:100},{label:'Settlement to bank',value:98.3}]}/>);
  expect(screen.getByRole('img', {name:'Match rate: 99,97%'})).toHaveStyle({width:'160px'});
  expect(screen.getByRole('img', {name:'POS to settlement: 100%'})).toHaveStyle({width:'72px'});
  expect(screen.getByText('8.784')).toBeInTheDocument();
  expect(screen.getByText('Settlement to bank')).toHaveClass('ring-caption');
  expect(screen.getByText('99,97%')).toHaveAttribute('data-long','true');
});

it('shows the final animated ring and KPI immediately with reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener(){},removeEventListener(){}}));
  render(<><Ring value={99.97} label="Matched"/><KpiCard label="Sales" value={8784}/></>);
  expect(screen.getByText('99,97%')).toBeInTheDocument();
  expect(screen.getByText('8.784', {selector:'[aria-hidden=true]'})).toBeInTheDocument();
  expect(screen.getByText('8.784', {selector:'.sr-only'})).toBeInTheDocument();
  expect(screen.getByRole('img').querySelector('.value')).toHaveAttribute('stroke-dasharray','99.97 100');
});

it('does not imply matched progress for a zero rate',()=>{
  render(<Ring value={0} label="Matched" animate={false}/>);
  expect(screen.getByRole('img',{name:'Matched: 0%'}).querySelector('.value')).toHaveAttribute('stroke-opacity','0');
});

it.each([[100,'green'],[95,'green'],[94.9,'amber'],[80,'amber'],[79.9,'red']] as const)('gives %s a named flat rate bar in %s', (value,tone) => {
  render(<RateCell value={value} label="Match rate"/>);
  expect(screen.getByRole('img', {name:/Match rate:/})).toHaveAttribute('data-tone',tone);
  expect(screen.getByRole('img').querySelector('.rate-cell-track')).toBeInTheDocument();
});

it('explains status and linked evidence without relying on colour', () => {
  render(<><StatusChip tone="amber" reason="Expected the next banking day">Needs review</StatusChip><LinkChip reference="M2-0001" rule="SM1" pays={92}/><IconTile icon={Wallet} label="Bank credit"/></>);
  expect(screen.getByText('Needs review').closest('.status')).toContainHTML('<svg');
  expect(screen.getByText('Expected the next banking day')).toBeInTheDocument();
  expect(screen.getByText('SM1')).toHaveClass('link-chip-rule');
  expect(screen.getByText('pays 92')).toBeInTheDocument();
  expect(screen.getByRole('img', {name:'Bank credit'})).toHaveClass('icon-tile');
});

it('provides toggle, switch and subtitle tab states to assistive technology', () => {
  const changed=vi.fn();
  render(<><ToggleChip checked label="Outlet" onChange={changed}/><Switch checked={false} label="Only rows under 100%" onChange={changed}/><Tabs value="rates" onChange={changed} items={[{value:'rates',label:'Rates',subtitle:'By outlet and day'},{value:'map',label:'Match map',subtitle:'Trace the evidence'}]}/></>);
  fireEvent.click(screen.getByRole('button', {name:'Outlet'}));
  expect(changed).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole('switch', {name:'Only rows under 100%'}));
  expect(changed).toHaveBeenCalledWith(true);
  expect(screen.getByRole('tab', {name:'Match map Trace the evidence'})).toHaveAttribute('aria-selected','false');
});
