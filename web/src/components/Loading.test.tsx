import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {SummaryBandSkeleton, TableSkeleton, GridSkeleton, ChartSkeleton} from './Loading';

afterEach(() => {cleanup(); vi.useRealTimers();});
it('reserves summary space but only reveals loading placeholders after 250 ms', () => {
  vi.useFakeTimers();
  const {container} = render(<SummaryBandSkeleton/>);
  expect(container.firstChild).toHaveAttribute('data-visible', 'false');
  act(() => vi.advanceTimersByTime(249));
  expect(container.firstChild).toHaveAttribute('data-visible', 'false');
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toHaveAttribute('data-visible', 'true');
});
it('keeps real table labels and supplies distinct grid and chart layouts', () => {
  const {container} = render(<><TableSkeleton headers={['Outlet', 'POS sales', 'Bank credit']}/><GridSkeleton/><ChartSkeleton/></>);
  expect(screen.getByText('Bank credit')).toBeInTheDocument();
  expect(container.querySelector('.loading-grid')).toBeInTheDocument();
  expect(container.querySelector('.loading-chart')).toBeInTheDocument();
});
