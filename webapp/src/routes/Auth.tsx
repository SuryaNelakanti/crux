import { useState } from 'react';
import { DoodleArrow, DoodleBolt, DoodleLoop, DoodleWave, Sparkle } from '@/components/Doodle';
import { Badge, Button, Card, Input } from '@/components/ui';
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
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">
            <Sparkle />
          </div>
          <div>
            <div className="brand-title">Crux</div>
            <p className="brand-subtitle">Photo-first bouldering journal</p>
          </div>
        </div>
        <div className="nav-actions">
          <Badge label="Web MVP" variant="brand" />
          <DoodleWave />
        </div>
      </header>

      <section className="hero-grid">
        <div className="reveal">
          <div className="section-kicker">Capture flow</div>
          <h1 className="hero-title">Shoot the wall. We do the routing.</h1>
          <p className="hero-subtitle">
            Fast capture with auto-mask and a lightweight log. No spreadsheets, no long forms, just
            the climb.
          </p>
          <div className="flow-steps">
            <div className="flow-step">
              <span>1</span> Snap
            </div>
            <div className="flow-step">
              <span>2</span> Auto-mask
            </div>
            <div className="flow-step">
              <span>3</span> Tap outcome
            </div>
          </div>
          <div className="footer-actions">
            <div className="floating-badge">
              <DoodleBolt className="badge-icon" />
              Mask in seconds
            </div>
            <div className="floating-badge">
              <DoodleLoop className="badge-icon" />
              Fix with brush edits
            </div>
          </div>
          <div style={{ marginTop: '18px' }}>
            <DoodleArrow />
          </div>
        </div>
        <Card className="card-glass reveal">
          <div className="grid" style={{ gap: '16px' }}>
            <div>
              <div className="section-kicker">Sign in</div>
              <h2 className="section-title">Get a magic link</h2>
              <p className="muted">We will email you a link. No passwords, no fuss.</p>
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
              <Button variant="ghost" onClick={() => setEmail('')} disabled={!email}>
                Clear
              </Button>
            </div>
            {status === 'sent' ? (
              <Badge label="Check your email for the link" variant="brand" />
            ) : null}
            {error ? <Badge label={error} variant="warning" /> : null}
          </div>
        </Card>
      </section>

      <section className="grid three">
        <Card className="card-soft reveal">
          <div className="section-kicker">Auto mask</div>
          <h3 className="section-title">Hold colors, isolated</h3>
          <p className="muted">We pick the dominant hold color and clean it up automatically.</p>
        </Card>
        <Card className="card-soft reveal">
          <div className="section-kicker">Fast edits</div>
          <h3 className="section-title">Brush in seconds</h3>
          <p className="muted">Fix the mask with a brush. Every edit is versioned.</p>
        </Card>
        <Card className="card-soft reveal">
          <div className="section-kicker">Shared logs</div>
          <h3 className="section-title">Climb together</h3>
          <p className="muted">Share problem cards so partners can log their outcomes too.</p>
        </Card>
      </section>
    </div>
  );
}
