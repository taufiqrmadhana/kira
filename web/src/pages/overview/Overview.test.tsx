import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Overview from './Overview';
import {useResource} from '../../lib/useResource';

vi.mock('../../lib/useResource', () => ({useResource: vi.fn()}));

const byDay = {
  '2026-10-20': {pos:100, matched:95},
  '2026-10-21': {pos:100, matched:80},
  '2026-10-23': {pos:100, matched:79},
  '2026-10-24': {pos:20, matched:0},
  '2026-10-25': {pos:0, matched:0},
};
const overview = {
  status:{matching:{l1:{done:true,matched:320,total:320},l2:{done:true,matched:254,total:320}}},
  results:{totals:{pos:320,full:254,matched:254,mismatched:66,review:0,credits:5,credits_linked:4,cash:1000000},by_day:byDay,open_items:[]},
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(useResource).mockImplementation((path: string | null) => ({
    path, data:path === '/overview' ? overview : {closes:[],knowledge:{}}, loading:false,updating:false,updatedAt:0,error:'',retry:vi.fn(),
  }) as ReturnType<typeof useResource>);
});
afterEach(() => {cleanup(); vi.clearAllMocks(); localStorage.clear();});
function mount() { return render(<MemoryRouter><Overview/></MemoryRouter>); }

describe('Overview monthly history', () => {
  it('opens the latest data month in a Monday-to-Sunday calendar with real dates', () => {
    mount();
    const calendar = screen.getByRole('grid', {name:'Match history for October 2026'});
    expect(within(calendar).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
    expect(within(calendar).getAllByRole('gridcell')).toHaveLength(35);
    expect(within(calendar).getByRole('link',{name:/Tue 20 Oct 2026: 95% matched/})).toHaveAttribute('href','/analysis?date_from=2026-10-20&date_to=2026-10-20');
    expect(within(calendar).queryByText('32')).not.toBeInTheDocument();
  });

  it('navigates calendar months and shows an honest empty month', () => {
    mount();
    fireEvent.click(screen.getByRole('button',{name:'Previous month'}));
    expect(screen.getByRole('grid',{name:'Match history for September 2026'})).toBeInTheDocument();
    expect(screen.getByText('No reconciled POS sales in September 2026.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Next month'}));
    expect(screen.getByRole('grid',{name:'Match history for October 2026'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Next month'}));
    expect(screen.getByRole('grid',{name:'Match history for November 2026'})).toBeInTheDocument();
  });

  it('distinguishes no data, zero matched sales, and no POS denominator', () => {
    mount();
    const calendar = screen.getByRole('grid');
    const absent = within(calendar).getByLabelText('Thu 22 Oct 2026: No data');
    expect(absent).not.toHaveAttribute('href');
    expect(within(absent).queryByText('0%')).not.toBeInTheDocument();
    expect(within(calendar).getByRole('link',{name:/Sat 24 Oct 2026: 0% matched, 0 of 20/})).toHaveClass('overview-day-red');
    expect(within(calendar).getByRole('link',{name:/Sun 25 Oct 2026: No POS sales/})).toHaveTextContent('—');
  });

  it('uses exact 95 and 80 percent threshold boundaries with visible values', () => {
    mount();
    expect(screen.getByRole('link',{name:/Tue 20 Oct 2026: 95% matched/})).toHaveClass('overview-day-green');
    expect(screen.getByRole('link',{name:/Wed 21 Oct 2026: 80% matched/})).toHaveClass('overview-day-amber');
    expect(screen.getByRole('link',{name:/Fri 23 Oct 2026: 79% matched/})).toHaveClass('overview-day-red');
  });

  it('preserves the workspace on evidence and workflow links', () => {
    localStorage.setItem('kira-client','zestly');
    mount();
    expect(screen.getByRole('link',{name:'Open workflow'})).toHaveAttribute('href','/workflow?c=zestly');
    expect(screen.getByRole('link',{name:/Sat 24 Oct 2026: 0% matched/})).toHaveAttribute('href','/analysis?date_from=2026-10-24&date_to=2026-10-24&c=zestly');
  });

  it('keeps one calendar tab stop and moves focus across days with evidence', () => {
    mount();
    const calendar = screen.getByRole('grid');
    const links = within(calendar).getAllByRole('link');
    expect(links.filter(el => el.tabIndex === 0)).toHaveLength(1);
    const first = links[0];
    first.focus();
    fireEvent.keyDown(first,{key:'ArrowRight'});
    expect(links[1]).toHaveFocus();
    fireEvent.keyDown(links[1],{key:'End'});
    expect(links.at(-1)).toHaveFocus();
  });
});
