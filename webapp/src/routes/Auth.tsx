import { useState } from 'react';
import { Button, Input } from '@/components/ui';

export function AuthRoute() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus('sending');
    setError(null);
    try {
      const { initSupabaseClient } = await import('@/lib/supabase');
      const client = initSupabaseClient();
      const { error: signInError } = await client.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (signInError) {
        throw new Error(signInError.message);
      }
      setStatus('sent');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send magic link';
      setError(message);
      setStatus('error');
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-scene" aria-labelledby="auth-promise">
        <div className="auth-brand">
          <span className="crux-mark" aria-hidden="true" />
          <span>Crux</span>
        </div>
        <div className="auth-promise">
          <p className="eyebrow">Indoor bouldering journal</p>
          <h1 id="auth-promise">Log the climb. Get back on the wall.</h1>
          <p>Photo, route mask, outcome. Done in a few taps.</p>
        </div>
      </section>

      <section className="auth-entry" aria-labelledby="sign-in-title">
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2 id="sign-in-title">Sign in</h2>
            <p className="auth-supporting">No password required.</p>
          </div>

          <label className="auth-label" htmlFor="auth-email">
            Email
          </label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Button variant="primary" type="submit" disabled={status === 'sending' || !email.trim()}>
            {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </Button>

          <div className="auth-status" aria-live="polite">
            {status === 'sent' && <p>Check your inbox. Your link is on the way.</p>}
            {error && <p className="auth-error">{error}</p>}
          </div>
        </form>
      </section>
    </main>
  );
}
