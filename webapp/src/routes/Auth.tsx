import { useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';

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
    <div className="app-shell" style={{ justifyContent: 'center', minHeight: '100vh' }}>
      {/* Brand */}
      <header className="top-bar" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="top-bar-brand">
          <div className="brand-mark">🧗</div>
          <span className="brand-title">Crux</span>
        </div>
      </header>

      {/* Auth card */}
      <Card style={{ maxWidth: 400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, margin: 0 }}>
              Get your magic link
            </h1>
            <p className="muted text-sm" style={{ marginTop: 'var(--space-1)' }}>
              No passwords. We'll email you.
            </p>
          </div>

          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />

          <Button variant="primary" onClick={handleSend} disabled={status === 'sending' || !email.trim()}>
            {status === 'sending' ? 'Sending…' : 'Send link →'}
          </Button>

          {status === 'sent' && (
            <Badge label="Check your inbox ✓" variant="success" />
          )}
          {error && <Badge label={error} variant="warning" />}
        </div>
      </Card>

      {/* Minimal tagline */}
      <p className="muted text-sm" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
        Snap → Auto-mask → Log
      </p>
    </div>
  );
}
