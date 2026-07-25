import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell, PageHeader } from '@/components/AppShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isLocalMockMode } from '@/lib/runtime';
import { initSupabaseClient } from '@/lib/supabase';

const AuthRoute = lazy(() =>
  import('@/routes/Auth').then((module) => ({ default: module.AuthRoute }))
);
const MaskEditorRoute = lazy(() =>
  import('@/routes/MaskEditor').then((module) => ({ default: module.MaskEditorRoute }))
);
const ProblemDetailRoute = lazy(() =>
  import('@/routes/ProblemDetail').then((module) => ({ default: module.ProblemDetailRoute }))
);
const SessionDetailRoute = lazy(() =>
  import('@/routes/SessionDetail').then((module) => ({ default: module.SessionDetailRoute }))
);
const SessionsRoute = lazy(() =>
  import('@/routes/Sessions').then((module) => ({ default: module.SessionsRoute }))
);

function RouteFallback() {
  return (
    <AppShell>
      <PageHeader title="Crux" description="Opening your climbing journal." />
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </AppShell>
  );
}

export function App() {
  const [ready, setReady] = useState(isLocalMockMode);
  const [signedIn, setSignedIn] = useState(isLocalMockMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLocalMockMode) return undefined;
    try {
      const client = initSupabaseClient();
      const load = async () => {
        const { data } = await client.auth.getSession();
        setSignedIn(Boolean(data.session));
        if (data.session) {
          const { ensureUserProfile } = await import('@/lib/api');
          await ensureUserProfile();
        }
        setReady(true);
      };
      void load();
      const { data: listener } = client.auth.onAuthStateChange(async (_event, session) => {
        setSignedIn(Boolean(session));
        if (session) {
          const { ensureUserProfile } = await import('@/lib/api');
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
    return (
      <TooltipProvider delayDuration={250}>
        <AppShell>
          <PageHeader title="Sessions" description="Loading your climbing journal." />
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </AppShell>
      </TooltipProvider>
    );
  }

  if (error) {
    return (
      <TooltipProvider delayDuration={250}>
        <AppShell>
          <PageHeader
            title="Configuration required"
            description="Crux could not connect to its configured data source."
          />
          <Alert variant="destructive">
            <AlertTitle>Supabase is not configured</AlertTitle>
            <AlertDescription>
              {error}. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use the local demo.
            </AlertDescription>
          </Alert>
        </AppShell>
      </TooltipProvider>
    );
  }

  if (!signedIn) {
    return (
      <TooltipProvider delayDuration={250}>
        <Suspense fallback={<RouteFallback />}>
          <AuthRoute />
        </Suspense>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<SessionsRoute />} />
          <Route path="/session/:sessionId" element={<SessionDetailRoute />} />
          <Route path="/problem/:problemId" element={<ProblemDetailRoute />} />
          <Route path="/problem/:problemId/mask" element={<MaskEditorRoute />} />
          <Route path="*" element={<SessionsRoute />} />
        </Routes>
      </Suspense>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
