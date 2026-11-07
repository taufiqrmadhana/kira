import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {EvidenceText} from './EvidenceText';
afterEach(cleanup);
it('shows the same shared evidence on hover and focus, and dismisses with Escape',()=>{
  render(<EvidenceText title="Outlet: cleaning evidence" rows={[{label:'Before cleaning',value:'Central Plz'},{label:'After cleaning',value:'Central Plaza Jakarta'}]} action="Use Show before cleaning to compare the whole table.">Central Plaza Jakarta</EvidenceText>);
  const value=screen.getByText('Central Plaza Jakarta');
  expect(value).not.toHaveAttribute('title');
  fireEvent.mouseEnter(value);expect(within(screen.getByRole('tooltip')).getByText('Central Plz')).toBeInTheDocument();
  fireEvent.mouseLeave(value);expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(value);expect(value).toHaveAttribute('aria-describedby',screen.getByRole('tooltip').id);
  fireEvent.keyDown(value,{key:'Escape'});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
