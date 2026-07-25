import { ArrowLeft, BookOpen, Camera, Database, Home, Mountain, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isLocalMockMode, resetLocalDemo } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export function AppShell({
  children,
  width = 'standard',
}: {
  children: ReactNode;
  width?: 'standard' | 'wide' | 'editor';
}) {
  const navigate = useNavigate();

  const handleAccountAction = async () => {
    if (isLocalMockMode) {
      await resetLocalDemo();
      navigate('/tonight');
      window.location.reload();
      return;
    }
    await getSupabaseClient().auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" asChild className="-ml-2 gap-2 px-2 font-semibold">
            <Link to="/tonight" aria-label="Crux tonight">
              <Mountain aria-hidden="true" className="text-primary" />
              <span>Crux</span>
            </Link>
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {isLocalMockMode ? (
              <Badge variant="outline" className="hidden gap-1.5 text-muted-foreground sm:flex">
                <Database aria-hidden="true" data-icon="inline-start" />
                Saved on this device
              </Badge>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleAccountAction()}
                  aria-label={isLocalMockMode ? 'Reset local demo' : 'Sign out'}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLocalMockMode ? 'Reset local demo' : 'Sign out'}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full px-4 py-8 sm:px-6 sm:py-10',
          width === 'standard' && 'max-w-[820px]',
          width === 'wide' && 'max-w-[1120px]',
          width === 'editor' && 'max-w-none px-0 py-0 sm:px-0 sm:py-0'
        )}
      >
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  backTo,
  backLabel = 'Back',
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 grid gap-6 border-b border-border pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        {backTo ? (
          <Button variant="ghost" asChild className="-ml-3 mb-3 text-muted-foreground">
            <Link to={backTo}>
              <ArrowLeft aria-hidden="true" />
              {backLabel}
            </Link>
          </Button>
        ) : null}
        {eyebrow ? (
          <p className="mb-2 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CaptureDock({
  onCapture,
  uploading,
  active,
}: {
  onCapture: () => void;
  uploading: boolean;
  active?: 'tonight' | 'journal';
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[520px] grid-cols-3 border-t border-border bg-background/96 p-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur-md sm:bottom-4 sm:rounded-lg sm:border"
    >
      <Button
        variant={active === 'tonight' ? 'secondary' : 'ghost'}
        asChild
        className={cn('h-12 flex-col gap-0.5 text-xs', active === 'tonight' && 'text-primary')}
      >
        <NavLink to="/tonight">
          <Home aria-hidden="true" />
          Tonight
        </NavLink>
      </Button>
      <Button onClick={onCapture} disabled={uploading} className="h-12">
        <Camera aria-hidden="true" />
        {uploading ? 'Tracing…' : 'Capture'}
      </Button>
      <Button
        variant={active === 'journal' ? 'secondary' : 'ghost'}
        asChild
        className={cn('h-12 flex-col gap-0.5 text-xs', active === 'journal' && 'text-primary')}
      >
        <NavLink to="/journal">
          <BookOpen aria-hidden="true" />
          Journal
        </NavLink>
      </Button>
    </nav>
  );
}
