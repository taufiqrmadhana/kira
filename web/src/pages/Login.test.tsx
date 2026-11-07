import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Login from './Login';

afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function fill() {
  fireEvent.change(screen.getByLabelText('Username'), {target:{value:'taufiq'}});
  fireEvent.change(screen.getByLabelText('Password', {exact:true}), {target:{value:'secret'}});
}
it('signs in once, verifies identity and hands control to the app', async () => {
  const authenticated=vi.fn();
  const fetch=vi.fn(async (path:string) => new Response(JSON.stringify(path==='/api/login'?{ok:true}:{user:'Taufiq',auth:true})));
  vi.stubGlobal('fetch',fetch);
  render(<MemoryRouter><Login onAuthenticated={authenticated}/></MemoryRouter>);
  expect(fetch).not.toHaveBeenCalled();
  fill();fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
  await waitFor(()=>expect(authenticated).toHaveBeenCalledWith({user:'Taufiq',auth:true}));
  expect(fetch.mock.calls.map(([path])=>path)).toEqual(['/api/login','/api/me']);
});
it('keeps credentials and focuses an actionable error when sign-in fails', async () => {
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({detail:'Check your username and password, then try again.'}),{status:401})));
  render(<MemoryRouter><Login onAuthenticated={vi.fn()}/></MemoryRouter>);
  fill();fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your username');
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveFocus());
  expect(screen.getByLabelText('Username')).toHaveValue('taufiq');
  expect(screen.getByRole('button',{name:'Sign in'})).toBeEnabled();
});
it('shows the password without submitting credentials', () => {
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  render(<MemoryRouter><Login onAuthenticated={vi.fn()}/></MemoryRouter>);
  fill();fireEvent.click(screen.getByRole('button',{name:'Show password'}));
  expect(screen.getByLabelText('Password',{exact:true})).toHaveAttribute('type','text');
  expect(fetch).not.toHaveBeenCalled();
});
