'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '../lib/supabase';
import Login from '../components/Login';
import Board from '../components/Board';

export default function Home() {
  const sb = getBrowserClient();
  const [session, setSession] = useState(undefined); // undefined = loading
  const [player, setPlayer] = useState(undefined);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!session) {
      setPlayer(session === null ? null : undefined);
      return;
    }
    sb.rpc('whoami').then(({ data, error }) => setPlayer(error ? null : data || null));
  }, [session, sb]);

  if (session === undefined || (session && player === undefined)) {
    return <div className="splash">THE LINES</div>;
  }

  if (!session) return <Login />;

  if (!player) {
    return (
      <div className="center-wrap">
        <div className="panel">
          <h1 className="brand">THE LINES</h1>
          <p>This account isn&apos;t on the roster yet. Ask Chris to add you.</p>
          <button className="btn ghost" onClick={() => sb.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Board player={player} />;
}
