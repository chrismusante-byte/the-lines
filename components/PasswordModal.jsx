'use client';

import { useState } from 'react';
import { getBrowserClient } from '../lib/supabase';

export default function PasswordModal({ onClose }) {
  const sb = getBrowserClient();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('Passwords don’t match.');
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Change password</h2>
        {done ? (
          <>
            <p>Password updated.</p>
            <button type="button" className="btn primary block" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>New password</span>
              <input type="password" autoComplete="new-password" value={pw} onChange={(e) => (setPw(e.target.value), setErr(''))} />
            </label>
            <label className="field">
              <span>Confirm</span>
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => (setPw2(e.target.value), setErr(''))} />
            </label>
            {err && <div className="error">{err}</div>}
            <button className="btn primary block" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn ghost block" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </form>
    </div>
  );
}
