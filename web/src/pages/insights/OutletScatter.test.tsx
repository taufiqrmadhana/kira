import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import OutletScatter from './OutletScatter';
import type {Outlet} from './api';
afterEach(cleanup);
const outlet: Outlet = {outlet:'Harbor Square Surabaya', orders:142, gross_sales:10000000, avg_ticket:70423, provider_gross:10000000, mdr:0, promo_provider:0, fees:0, nett_settled:10000000, bank_received:968579, pending_bank:9031421, to_check:9031421, expected_diff:0, deduction:0, deduction_rate:0, keep_rate:.0968579, keep_rate_expected:1, match_rate:0, city:'Surabaya', region:'', quadrant:'sells_a_lot_keeps_little', reason:'Payout waiting for the bank'};
const normal:Outlet = {...outlet, outlet:'Garden Mall', gross_sales:5000000, keep_rate:.99, pending_bank:0, to_check:0, quadrant:'sells_less_keeps_more'};
it('shows the shared evidence tooltip on keyboard focus and opens evidence', () => {
  const onSelect=vi.fn();
  render(<OutletScatter rows={[outlet,normal]} medians={{gross_sales:7500000,keep_rate:.5}} onSelect={onSelect}/>);
  const buttons=screen.getAllByRole('button');
  expect(buttons.map(button=>button.getAttribute('tabindex'))).toEqual(['0','-1']);
  fireEvent.focus(buttons[1]);
  const tooltip=screen.getByRole('tooltip');
  expect(within(tooltip).getByText('Harbor Square Surabaya')).toBeInTheDocument();
  expect(within(tooltip).getByText('Rp 9.031.421 to check')).toBeInTheDocument();
  expect(within(tooltip).getByText('Click to open this outlet in Match analysis')).toBeInTheDocument();
  fireEvent.keyDown(buttons[1],{key:'Enter'});
  expect(onSelect).toHaveBeenCalledWith(outlet);
});
it('supports roving point focus, matching legends and a real-number summary', () => {
  render(<OutletScatter rows={[outlet,normal]} medians={{gross_sales:7500000,keep_rate:.5}} onSelect={()=>{}}/>);
  const buttons=screen.getAllByRole('button');
  fireEvent.keyDown(buttons[0],{key:'ArrowDown'});
  expect(buttons[1]).toHaveFocus();
  fireEvent.keyDown(buttons[1],{key:'Home'});
  expect(buttons[0]).toHaveFocus();
  expect(screen.getByText('Dashed lines: selection medians')).toBeInTheDocument();
  expect(screen.getByText(/1 outlet sells above the median and keeps below it/)).toHaveTextContent('Harbor Square Surabaya');
});
it('does not invent legend marks for absent quadrants or medians', () => {
  render(<OutletScatter rows={[normal]} medians={{gross_sales:null,keep_rate:null}} onSelect={()=>{}}/>);
  expect(screen.queryByText('Dashed lines: selection medians')).not.toBeInTheDocument();
  expect(screen.queryByText(/Amber dot and shaded area/)).not.toBeInTheDocument();
});
