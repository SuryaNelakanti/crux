import { AUTO_MASK_CONFIDENCE_THRESHOLD, type Outcome } from '@crux/shared';
import { ChevronDown, PencilLine, Route, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/AppShell';
import { GradePicker, OutcomePicker } from '@/components/OutcomePicker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { fetchProblemDetail, saveProblemLog } from '@/lib/api';

export function ProblemDetailRoute() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchProblemDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState<Outcome | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [grade, setGrade] = useState<number | null>(null);
  const [attempts, setAttempts] = useState('');
  const [note, setNote] = useState('');

  const loadDetail = useCallback(async () => {
    if (!problemId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await fetchProblemDetail(problemId);
      setDetail(data);
      if (data?.log) {
        setGrade(data.log.gradeMin ?? data.log.gradeMax ?? null);
        setAttempts(data.log.attemptsCount?.toString() ?? '');
        setNote(data.log.note ?? '');
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const persistLog = async (outcome: Outcome) => {
    if (!problemId || !detail?.sessionId) return;
    await saveProblemLog({
      problemId,
      sessionId: detail.sessionId,
      outcome,
      attemptsCount: attempts ? Number(attempts) : null,
      gradeMin: grade,
      gradeMax: grade,
      note: note.trim() || null,
    });
  };

  const saveOutcome = async (outcome: Outcome) => {
    if (!detail?.sessionId || savingOutcome) return;
    setSavingOutcome(outcome);
    try {
      await persistLog(outcome);
      toast.success(
        outcome === 'flash' ? 'Flash saved' : outcome === 'send' ? 'Send saved' : 'Attempt saved'
      );
      navigate(`/session/${detail.sessionId}`);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'The outcome was not saved.');
    } finally {
      setSavingOutcome(null);
    }
  };

  const saveDetails = async () => {
    const currentOutcome = detail?.log?.outcome;
    if (!currentOutcome || savingDetails) return;
    setSavingDetails(true);
    try {
      await persistLog(currentOutcome);
      setDetail((current) =>
        current
          ? {
              ...current,
              log: {
                outcome: currentOutcome,
                attemptsCount: attempts ? Number(attempts) : null,
                gradeMin: grade,
                gradeMax: grade,
                note: note.trim() || null,
              },
            }
          : current
      );
      toast.success('Climb details updated');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'The details were not saved.');
    } finally {
      setSavingDetails(false);
    }
  };

  if (loading) {
    return (
      <AppShell width="wide">
        <PageHeader title="Log outcome" backTo="/" backLabel="Sessions" />
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="min-h-[560px] lg:col-span-7" />
          <Skeleton className="h-80 lg:col-span-5" />
        </div>
      </AppShell>
    );
  }

  if (!detail || loadFailed) {
    return (
      <AppShell>
        <PageHeader title="Climb unavailable" backTo="/" backLabel="Sessions" />
        <Alert variant="destructive">
          <AlertTitle>This climb could not be loaded</AlertTitle>
          <AlertDescription>Return to your sessions and try opening it again.</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const needsFix =
    detail.maskConfidence !== null && detail.maskConfidence < AUTO_MASK_CONFIDENCE_THRESHOLD;
  const currentOutcome = detail.log?.outcome ?? null;
  const sessionPath = detail.sessionId ? `/session/${detail.sessionId}` : '/';
  const maskPath = problemId ? `/problem/${problemId}/mask` : sessionPath;

  return (
    <AppShell width="wide">
      <PageHeader
        title="Log outcome"
        description="Choose the result. Attempts, grade, and notes can wait."
        backTo={sessionPath}
        backLabel="Session"
        eyebrow="Climb"
        actions={
          <Button variant="outline" onClick={() => navigate(maskPath)}>
            <PencilLine aria-hidden="true" />
            Fix route
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <section
          className="capture-media lg:col-span-7"
          aria-label="Captured climb with detected route"
        >
          {detail.imageUrl ? (
            <img src={detail.imageUrl} alt="Captured bouldering problem" />
          ) : (
            <div className="grid size-full min-h-[420px] place-items-center text-sm text-muted-foreground">
              Photo unavailable
            </div>
          )}
          {detail.maskUrl ? <img src={detail.maskUrl} alt="" /> : null}
        </section>

        <aside className="space-y-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Route aria-hidden="true" className="size-4 text-primary" />
              <span className="text-sm font-medium">Route mask</span>
            </div>
            <Badge
              variant="outline"
              className={needsFix ? 'text-destructive' : 'text-status-flash'}
            >
              {needsFix ? 'Check route' : 'Route detected'}
            </Badge>
          </div>

          {needsFix ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>The route may need a correction</AlertTitle>
              <AlertDescription>
                Review the selected holds before recording the outcome.
              </AlertDescription>
            </Alert>
          ) : null}

          <section aria-labelledby="outcome-heading">
            <h2 id="outcome-heading" className="text-base font-semibold">
              How did it go?
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Your choice saves immediately.
            </p>
            <OutcomePicker
              value={currentOutcome}
              saving={savingOutcome}
              onChange={(outcome) => void saveOutcome(outcome)}
            />
          </section>

          <Collapsible open={showMore} onOpenChange={setShowMore}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-3">
                Attempts, grade, and notes
                <ChevronDown
                  aria-hidden="true"
                  className={`transition-transform duration-150 ${showMore ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-5">
              <FieldGroup>
                <Field>
                  <FieldLabel>Grade</FieldLabel>
                  <FieldDescription>Use your best estimate.</FieldDescription>
                  <GradePicker value={grade} onChange={setGrade} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="attempts-input">Attempts</FieldLabel>
                  <Input
                    id="attempts-input"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    placeholder="Optional"
                    value={attempts}
                    onChange={(event) => setAttempts(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="notes-input">Notes</FieldLabel>
                  <Textarea
                    id="notes-input"
                    placeholder="Beta, crux, or what to try next"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </Field>

                <Button
                  onClick={() => void saveDetails()}
                  disabled={!currentOutcome || savingDetails}
                  className="w-full"
                >
                  {savingDetails ? 'Updating…' : 'Update details'}
                </Button>
                {!currentOutcome ? (
                  <p className="text-xs text-muted-foreground">
                    Choose Tried, Sent, or Flash before saving optional details.
                  </p>
                ) : null}
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
        </aside>
      </div>
    </AppShell>
  );
}
