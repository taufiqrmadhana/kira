import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Preview } from './preview';

vi.mock('./ChatPanel', () => ({ ChatPanel: () => <aside>Workspace chat</aside> }));

const request = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const status = {
  step: 1, next: { say: 'Upload your files.' }, files: { pos: 0, settlement: 0, bank: 0 },
  converted: false, cleaning: { open: 0, rules_version: null },
  matching: { l1: { done: false, rules: 0 }, l2: { done: false, rules: 0 } },
};

function mockSession(login: () => Promise<Response> = async () => response({ ok: true })) {
  let authenticated = false;
  request.mockImplementation(async (input) => {
    if (input === '/api/login') {
      const result = await login();
      authenticated = result.ok;
      return result;
    }
    if (input === '/api/me') return response({ user: authenticated ? 'andrew' : null, auth: true });
    if (input === '/api/clients') return response([]);
    if (input === '/api/status') return response(status);
    throw new Error(`Unexpected request: ${String(input)}`);
  });
}

async function enterCredentials() {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'andrew' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
}

beforeEach(() => {
  request.mockReset();
  vi.stubGlobal('fetch', request);
  mockSession();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('workspace sign-in', () => {
  it('focuses the username and waits for the person to submit credentials', async () => {
    const onAuthenticated = vi.fn();
    render(<Preview onAuthenticated={onAuthenticated} />);
    const username = await screen.findByLabelText('Username');
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    await waitFor(() => expect(username).toHaveFocus());
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(request.mock.calls.some(([path]) => path === '/api/login')).toBe(false);
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('shows and hides the password without changing it or submitting', async () => {
    render(<Preview />);
    await enterCredentials();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('correct-password');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('correct-password');
    expect(request.mock.calls.some(([path]) => path === '/api/login')).toBe(false);
  });

  it('disables the form while pending, posts the entered credentials, and reports verified identity', async () => {
    let finish!: (value: Response) => void;
    mockSession(() => new Promise(resolve => { finish = resolve; }));
    const onAuthenticated = vi.fn();
    render(<Preview onAuthenticated={onAuthenticated} />);
    await enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(screen.getByLabelText('Username')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    expect(request).toHaveBeenCalledWith('/api/login', {
      credentials: 'same-origin', method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'andrew', password: 'correct-password' }),
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
    await act(async () => { finish(response({ ok: true })); });
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ user: 'andrew', auth: true }));
  });

  it('focuses the error, keeps entered values, and lets the person correct and retry', async () => {
    let attempt = 0;
    mockSession(async () => ++attempt === 1
      ? response({ detail: 'Username or password is incorrect.' }, 401)
      : response({ ok: true }));
    const onAuthenticated = vi.fn();
    render(<Preview onAuthenticated={onAuthenticated} />);
    await enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Username or password is incorrect.');
    await waitFor(() => expect(error).toHaveFocus());
    expect(screen.getByLabelText('Username')).toHaveValue('andrew');
    expect(screen.getByLabelText('Password')).toHaveValue('correct-password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(onAuthenticated).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'corrected-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ user: 'andrew', auth: true }));
    const loginCalls = request.mock.calls.filter(([path]) => path === '/api/login');
    expect(JSON.parse(String(loginCalls[1][1]?.body))).toEqual({ username: 'andrew', password: 'corrected-password' });
  });

  it('does not authenticate when the server cannot verify the new session', async () => {
    request.mockImplementation(async input => input === '/api/me'
      ? response({ user: null, auth: true }) : response({ ok: true }));
    const onAuthenticated = vi.fn();
    render(<Preview onAuthenticated={onAuthenticated} />);
    await enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in could not be verified. Please try again.');
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('preserves the already authenticated preview workspace', async () => {
    request.mockImplementation(async input => {
      if (input === '/api/me') return response({ user: 'demo', auth: false });
      if (input === '/api/clients') return response([]);
      return response(status);
    });
    const onAuthenticated = vi.fn();
    render(<Preview onAuthenticated={onAuthenticated} />);
    expect(await screen.findByRole('heading', { name: 'Workspace status' })).toBeInTheDocument();
    expect(screen.getByText('Workspace chat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(onAuthenticated).toHaveBeenCalledWith({ user: 'demo', auth: false });
    expect(request.mock.calls.some(([path]) => path === '/api/login')).toBe(false);
  });
});
