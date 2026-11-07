import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import FollowUps from './FollowUps';
import {followResponse} from './test-fixtures';
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows the human approver exactly as saved and exposes a persistent bulk-save action for one edited note',async()=>{
  const response=followResponse(true);response.records=response.records.slice(0,1);response.total=1;response.records[0].follow_up!.by='Kira (approved by Taufiq)';
  const fetch=vi.fn(async()=>json(response));vi.stubGlobal('fetch',fetch);
  render(<MemoryRouter><FollowUps scope=""/></MemoryRouter>);
  expect(await screen.findByText(/Saved by Kira \(approved by Taufiq\)/)).toBeVisible();
  expect(screen.getByText('1 record',{exact:true})).toBeVisible();
  fireEvent.change(screen.getByRole('textbox',{name:/Note for/}),{target:{value:'Please trace this payout'}});
  const bar=screen.getByRole('region',{name:'Unsaved follow-up notes'});
  expect(bar).toHaveTextContent('1 unsaved note');expect(within(bar).getByRole('button',{name:'Save 1 note'})).toBeEnabled();
  expect(fetch.mock.calls).toHaveLength(1);
  fireEvent.click(within(bar).getByRole('button',{name:'Discard drafts'}));expect(screen.queryByRole('region',{name:'Unsaved follow-up notes'})).not.toBeInTheDocument();
});
