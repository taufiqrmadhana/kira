import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, Eye, EyeOff} from 'lucide-react';
import {api} from '../lib/api';
import {Button} from '../components';

interface Identity {user: string; auth: boolean}

/** The app owns identity checks and return navigation; this form only signs in. */
export default function Login({onAuthenticated}: {onAuthenticated: (identity: Identity) => void}) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {if (error) errorRef.current?.focus({preventScroll:true});}, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      await api('/login', {method:'POST', body:JSON.stringify({username:form.get('username'), password:form.get('password')})});
      const identity = await api<{user:string | null; auth:boolean}>('/me');
      if (!identity.user) throw new Error('Sign-in could not be verified. Please try again.');
      onAuthenticated({user:identity.user, auth:identity.auth});
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');}
    finally {setBusy(false);}
  }

  return <main className="login">
    <section className="login-story" aria-labelledby="login-story-title">
      <Link className="brand" to="/" translate="no" aria-label="KIRA home">KIRA</Link>
      <div><h2 id="login-story-title">Trace sales to the money received</h2><p>Compare POS sales, provider settlements and bank credits. See where they agree and what needs a closer look.</p>
        <div className="journey" aria-label="The reconciliation trail"><span>POS sales</span><ArrowRight aria-hidden="true"/><span>Settlement</span><ArrowRight aria-hidden="true"/><span>Bank credit</span></div>
      </div><small>Payment reconciliation for Indonesian merchants</small>
    </section>
    <section className="login-form" aria-labelledby="login-title"><form onSubmit={submit} aria-busy={busy}>
      <h1 id="login-title">Sign in to your workspace</h1><p>Continue your reconciliation with KIRA.</p>
      <label htmlFor="login-username">Username</label><input id="login-username" name="username" autoComplete="username" spellCheck={false} required disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined}/>
      <label htmlFor="login-password">Password</label><div className="password"><input id="login-password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined}/><Button variant="quiet" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</Button></div>
      {error && <p ref={errorRef} id="login-error" role="alert" tabIndex={-1} className="error-text">{error}</p>}
      <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} aria-hidden="true"/></Button>
      <p><small>Use the credentials shared by your workspace owner.</small></p>
    </form></section>
  </main>;
}
