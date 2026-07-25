import { LoaderCircle, Mountain } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function AuthRoute() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      setStatus('error');
      return;
    }
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
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send the sign-in link.');
      setStatus('error');
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex h-12 items-center gap-2 font-semibold">
          <Mountain aria-hidden="true" className="size-5 text-primary" />
          Crux
        </div>

        <div className="mx-auto grid min-h-[calc(100vh-96px)] max-w-md place-items-center py-8">
          <section className="w-full" aria-labelledby="sign-in-title">
            <div className="mb-8">
              <p className="mb-2 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                Indoor bouldering journal
              </p>
              <h1 id="sign-in-title" className="text-2xl font-semibold tracking-tight">
                Sign in to Crux
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We will email you a secure sign-in link. No password required.
              </p>
            </div>

            <form
              className="space-y-6 rounded-lg border border-border bg-card p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <Field data-invalid={status === 'error'}>
                <FieldLabel htmlFor="auth-email">Email</FieldLabel>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  aria-invalid={status === 'error'}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (status === 'error') {
                      setStatus('idle');
                      setError(null);
                    }
                  }}
                  required
                />
                <FieldDescription>
                  Use the address linked to your climbing journal.
                </FieldDescription>
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>

              <Button type="submit" disabled={status === 'sending'} className="w-full">
                {status === 'sending' ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : null}
                {status === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
              </Button>

              {status === 'sent' ? (
                <Alert>
                  <AlertTitle>Check your inbox</AlertTitle>
                  <AlertDescription>
                    The sign-in link has been sent to {email.trim()}.
                  </AlertDescription>
                </Alert>
              ) : null}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
