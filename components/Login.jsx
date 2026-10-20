'use client';

import { useState } from 'react';
import { getBrowserClient } from '../lib/supabase';

export default function Login() {
  const sb = getBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  }

  return (
    <div className="center-wrap">
      <form className="panel" onSubmit={submit}>
        <h1 className="brand">THE LINES</h1>
        <p className="muted">Guess the number. Then see what Vegas says.</p>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr('');
            }}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErr('');
            }}
          />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
