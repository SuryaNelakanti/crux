import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthRoute } from '@/routes/Auth';
import { SessionsRoute } from '@/routes/Sessions';
import { SessionDetailRoute } from '@/routes/SessionDetail';
import { ProblemDetailRoute } from '@/routes/ProblemDetail';
import { MaskEditorRoute } from '@/routes/MaskEditor';
import { ensureUserProfile } from '@/lib/api';
import { initSupabaseClient } from '@/lib/supabase';

export function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const client = initSupabaseClient();
      const load = async () => {
        const { data } = await client.auth.getSession();
        setSignedIn(Boolean(data.session));
        if (data.session) {
          await ensureUserProfile();
        }
        setReady(true);
      };
      void load();
      const { data: listener } = client.auth.onAuthStateChange(async (_event, session) => {
        setSignedIn(Boolean(session));
        if (session) {
          await ensureUserProfile();
        }
      });
      return () => {
        listener.subscription.unsubscribe();
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Supabase init failed';
      setError(message);
      setReady(true);
      return undefined;
    }
  }, []);

  if (!ready) {
    return null;
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="card">
          <h2 className="section-title">Configuration required</h2>
          <p className="muted">{error}</p>
          <p className="muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return <AuthRoute />;
  }

  return (
    <Routes>
      <Route path="/" element={<SessionsRoute />} />
      <Route path="/session/:sessionId" element={<SessionDetailRoute />} />
      <Route path="/problem/:problemId" element={<ProblemDetailRoute />} />
      <Route path="/problem/:problemId/mask" element={<MaskEditorRoute />} />
      <Route path="*" element={<SessionsRoute />} />
    </Routes>
  );
}
