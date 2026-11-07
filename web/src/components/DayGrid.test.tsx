import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayGrid, dayAriaLabel, rampStep, type DayGridRateRow } from './DayGrid';
import { positionTooltip } from './EvidenceTooltip';
afterEach(cleanup);
const row = (period: string, outlet = 'Harbor Square Surabaya', full = 0, pos = 142): DayGridRateRow => ({ period, outlet, pos, full, pos_linked: pos, bank_credit: 0 });
const gap = { day: '2026-10-24', outlet: 'Harbor Square Surabaya', to_check: 9031421, not_in_bank: 9031421, review: 0 };
describe('daily match grid', () => {
  it.each([[100,'high'],[99.5,'high'],[99.49,'strong'],[98,'strong'],[97.99,'good'],[96,'good'],[95.99,'healthy'],[95,'healthy'],[94.99,'amber'],[80,'amber'],[79.99,'red'],[0,'red']])('uses the documented ramp for %s', (value, step) => expect(rampStep(Number(value))).toBe(step));
  it('keeps money corners independent of the fill and marks waiting settlements', () => {
    render(<DayGrid rows={[row('2026-10-24'),row('2026-10-25', undefined, 142)]} gaps={[gap,{...gap,day:'2026-10-25',not_in_bank:0}]} onSelect={vi.fn()}/>);
    const cells = screen.getAllByRole('button', {name:/end to end/});
    expect(cells[0]).toHaveClass('day-grid-cell--red');
    expect(cells[1]).toHaveClass('day-grid-cell--high');
    expect(cells[0].querySelector('.day-grid-corner--red')).toBeInTheDocument();
    expect(cells[1].querySelector('.day-grid-corner--red')).toBeInTheDocument();
    expect(cells[0].querySelector('.day-grid-waiting')).toBeInTheDocument();
    expect(cells[1].querySelector('.day-grid-waiting')).not.toBeInTheDocument();
  });
  it('uses an amber corner only for review without money to check', () => {
    render(<DayGrid rows={[row('2026-10-24',undefined,142)]} gaps={[{...gap,to_check:0,not_in_bank:0,review:2}]} onSelect={vi.fn()}/>);
    expect(screen.getByRole('button',{name:/end to end/}).querySelector('.day-grid-corner--amber')).toBeInTheDocument();
  });
  it('leaves missing days empty and out of the tab order', () => {
    render(<DayGrid rows={[row('2026-10-24'),row('2026-10-26')]} gaps={[]} onSelect={vi.fn()}/>);
    expect(screen.getByLabelText('Harbor Square Surabaya, Sun 25 Oct 2026, no data')).not.toHaveAttribute('tabindex');
    expect(screen.getByLabelText('Harbor Square Surabaya, Sun 25 Oct 2026, no data')).toHaveTextContent('');
    expect(screen.getAllByRole('button',{name:/end to end/})).toHaveLength(2);
  });
  it('roves across available dates, keeps columns vertically and opens with Enter', () => {
    const onSelect = vi.fn();
    render(<DayGrid rows={['Harbor Square Surabaya','Riverside Jakarta'].flatMap(outlet => [row('2026-10-24',outlet),row('2026-10-26',outlet)])} gaps={[]} onSelect={onSelect}/>);
    const cells=screen.getAllByRole('button',{name:/end to end/});
    expect(cells.filter(c=>c.tabIndex===0)).toHaveLength(1);
    cells[0].focus(); fireEvent.keyDown(cells[0],{key:'ArrowRight'}); expect(cells[1]).toHaveFocus();
    fireEvent.keyDown(cells[1],{key:'ArrowDown'}); expect(cells[3]).toHaveFocus();
    fireEvent.keyDown(cells[3],{key:'Home'}); expect(cells[2]).toHaveFocus();
    fireEvent.keyDown(cells[2],{key:'End'}); expect(cells[3]).toHaveFocus();
    fireEvent.keyDown(cells[3],{key:'Enter'}); expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({day:'2026-10-26',outlet:'Riverside Jakarta'}));
    expect(cells.filter(c=>c.tabIndex===0)).toHaveLength(1);
  });
  it('reads a complete sentence and shows the same evidence on keyboard focus', () => {
    render(<DayGrid rows={[row('2026-10-24')]} gaps={[gap]} latestDay="2026-10-26" bankAsOf="2026-10-27" onSelect={vi.fn()}/>);
    const cell=screen.getByRole('button',{name:'Harbor Square Surabaya, Sat 24 Oct 2026, end to end 0 percent, Rp 9.031.421 to check, without an approved bank link.'});
    fireEvent.focus(cell);
    const tooltip=screen.getByRole('tooltip');
    expect(within(tooltip).getByText('End to end 0,0%')).toBeInTheDocument();
    expect(within(tooltip).getByText('Rp 9.031.421 settled without an approved bank link (3 days)')).toBeInTheDocument();
    expect(within(tooltip).getByText('Click to open this day')).toBeInTheDocument();
    expect(dayAriaLabel({...row('2026-10-24'),...gap,day:gap.day,rate:0,mismatched:142})).toBe(cell.getAttribute('aria-label'));
  });
  it('summarises weighted rates and every real money exception', () => {
    render(<DayGrid rows={[row('2026-10-24'),row('2026-10-25',undefined,1000,1000)]} gaps={[gap,{...gap,day:'2026-10-25',to_check:171000,not_in_bank:0}]} onSelect={vi.fn()}/>);
    expect(screen.getByTestId('day-grid-summary')).toHaveTextContent('1 outlet-day is below 80%');
    expect(screen.getByTestId('day-grid-summary')).toHaveTextContent('Rp 9.031.421 without an approved bank link');
    expect(screen.getByTestId('day-grid-summary')).toHaveTextContent('2 outlet-days carry money to check, 1 of them above 95% on matching');
    expect(screen.getByTestId('day-grid-summary')).toHaveTextContent('Rp 171.000');
    expect(screen.getByText('87,6%')).toBeInTheDocument();
  });
  it.each([20,100])('bounds 110 exceptions at a %s percent rate and lets users expand and collapse them', (rate) => {
    const rows=Array.from({length:110},(_,i)=>row('2026-10-24',`Outlet ${i}`,rate,100));
    const gaps=rows.map((r,i)=>({...gap,outlet:r.outlet,to_check:110-i,not_in_bank:0}));
    render(<DayGrid rows={rows} gaps={gaps} onSelect={vi.fn()}/>);
    const summary=within(screen.getByTestId('day-grid-summary'));
    expect(screen.getByTestId('day-grid-summary')).toHaveTextContent('110 outlet-days carry money to check');
    expect(summary.getAllByRole('listitem')).toHaveLength(3);
    expect(summary.getAllByRole('listitem')[0]).toHaveTextContent('Outlet 0');
    const toggle=summary.getByRole('button',{name:'Show all 110 outlet-days'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded','true');
    expect(summary.getAllByRole('listitem')).toHaveLength(110);
    fireEvent.click(summary.getByRole('button',{name:'Show fewer'}));
    expect(summary.getAllByRole('listitem')).toHaveLength(3);
  });
  it('makes month rows with 31 columns and blanks for nonexistent dates', () => {
    render(<DayGrid rows={[row('2026-02-27',undefined,142),row('2026-02-28',undefined,142)]} gaps={[]} onSelect={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:'By month'}));
    expect(screen.getByText('Feb 26')).toBeInTheDocument();
    expect(document.querySelectorAll('.day-grid-calendar-blank')).toHaveLength(3);
    expect(screen.getAllByRole('button',{name:/end to end/})).toHaveLength(2);
  });
});
describe('viewport tooltip positioning',()=>{
  const size={width:240,height:220}, viewport={width:1000,height:800};
  it('prefers above, then below at the top edge',()=>{
    expect(positionTooltip({left:400,right:440,top:400,bottom:440},size,viewport)).toMatchObject({side:'above',top:168});
    expect(positionTooltip({left:400,right:440,top:8,bottom:48},size,viewport)).toMatchObject({side:'below',top:60});
  });
  it('uses a side without covering the anchor when neither vertical side fits',()=>{
    const position=positionTooltip({left:400,right:440,top:100,bottom:140},{width:240,height:180},{width:1000,height:240});
    expect(position.side).toBe('right'); expect(position.left).toBe(452); expect(position.top).toBeGreaterThanOrEqual(8);
  });
  it('clamps against the viewport edges',()=>{
    const p=positionTooltip({left:970,right:998,top:400,bottom:428},size,viewport);
    expect(p.left+p.width).toBeLessThanOrEqual(992); expect(p.left).toBeGreaterThanOrEqual(8);
  });
});

describe('grid evidence boundaries',()=>{
  it('preserves settlement-only evidence without inventing a POS rate',()=>{
    render(<DayGrid rows={[{...row('2026-10-24'),pos:0,pos_linked:0,full:0,stl:1}]} gaps={[gap]} onSelect={vi.fn()}/>);
    const cell=screen.getByRole('button',{name:/end to end unavailable \(no POS sales\)/});
    expect(cell).toHaveClass('day-grid-cell--unavailable');
    expect(cell.querySelector('.day-grid-corner--red')).toBeInTheDocument();
    expect(screen.getByTestId('day-grid-summary')).not.toHaveTextContent('below 80%');
  });
  it('does not assign bank-only credits to a fictitious outlet',()=>{
    render(<DayGrid rows={[row('2026-10-24'),row('2026-10-24','')]} gaps={[{...gap,outlet:''}]} onSelect={vi.fn()}/>);
    expect(screen.getAllByRole('button',{name:/end to end/})).toHaveLength(1);
    expect(screen.getByRole('button',{name:/end to end/}).querySelector('.day-grid-corner')).not.toBeInTheDocument();
  });
  it('marks the latest and selected cell and connects the focused tooltip',()=>{
    render(<DayGrid rows={[row('2026-10-24')]} gaps={[]} latestDay="2026-10-24" selected={{day:'2026-10-24'}} onSelect={vi.fn()}/>);
    const cell=screen.getByRole('button',{name:/end to end/});
    expect(cell).toHaveClass('day-grid-latest','day-grid-selected');
    fireEvent.focus(cell);
    expect(cell).toHaveAttribute('aria-describedby',screen.getByRole('tooltip').id);
    fireEvent.keyDown(cell,{key:'Escape'});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('keeps the six label/fill token pairs above AA contrast',()=>{
    const luminance=(hex:string)=>{const channels=hex.match(/[a-f0-9]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
    for(const [fill,label] of [['285d47','ffffff'],['4b7954','ffffff'],['8dbb78','202c29'],['d2ecaf','202c29'],['f1ce83','202c29'],['a44e43','ffffff']]){
      const values=[luminance(fill),luminance(label)].sort((a,b)=>b-a);
      expect((values[0]+.05)/(values[1]+.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
