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
