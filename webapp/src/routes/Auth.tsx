import { useState } from 'react';
import { Card, Button, Input, Badge } from '@/components/ui';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { initSupabaseClient } from '@/lib/supabase';

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
    <div className="app-shell">
      <div className="header">
        <div className="brand">
          <Sparkle />
          <div>
            <h1>Crux</h1>
            <p>Web capture for the bouldering log</p>
          </div>
        </div>
        <DoodleWave />
      </div>

      <Card>
        <div className="grid" style={{ gap: '16px' }}>
          <div>
            <h2 className="section-title">Sign in</h2>
            <p className="muted">
              Enter your email to receive a magic link. No passwords, no fuss.
            </p>
          </div>
          <Input
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="footer-actions">
            <Button variant="primary" onClick={handleSend} disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending...' : 'Send magic link'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setEmail('')}
              disabled={!email}
            >
              Clear
            </Button>
          </div>
          {status === 'sent' ? (
            <Badge label="Check your email for the link" variant="brand" />
          ) : null}
          {error ? <Badge label={error} variant="warning" /> : null}
        </div>
      </Card>
    </div>
  );
}
