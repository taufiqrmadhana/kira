import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import Components from './Components';
afterEach(cleanup);
it('shows the shared components and the loaded, updating, empty, error and loading table states',()=>{
  render(<Components/>);
  expect(screen.getByRole('heading',{level:1,name:'Components'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Compact payments'})).toHaveAttribute('data-density','compact');
  expect(screen.getByRole('region',{name:'Evidence payments'})).toHaveAttribute('data-density','evidence');
  expect(within(screen.getByRole('region',{name:'Updating payments'})).getByText('Updating…')).toBeInTheDocument();
  expect(within(screen.getByRole('region',{name:'Empty payments'})).getByText('No rows for this selection')).toBeInTheDocument();
  expect(within(screen.getByRole('region',{name:'Failed payments'})).getByRole('alert')).toHaveTextContent('The sample request failed');
  expect(screen.getByRole('region',{name:'Loading payments'})).toHaveAttribute('aria-busy','true');
});
it('provides working overlay and toggle examples',()=>{
  render(<Components/>);
  fireEvent.click(screen.getByRole('button',{name:'Open modal'}));
  expect(screen.getByRole('dialog',{name:'Review 2 selected records'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));
  fireEvent.click(screen.getByRole('button',{name:'Outlet',pressed:true}));
  expect(screen.getByRole('button',{name:'Outlet',pressed:false})).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByRole('button',{name:'Show toast'}));
  expect(screen.getByText('2 records saved')).toBeInTheDocument();
});
