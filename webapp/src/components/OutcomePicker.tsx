import type { Outcome } from '@crux/shared';
import { LoaderCircle, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';

const choices: Array<{ value: Outcome; label: string }> = [
  { value: 'tried', label: 'Tried' },
  { value: 'send', label: 'Sent' },
  { value: 'flash', label: 'Flash' },
];

export function OutcomePicker({
  value,
  saving,
  onChange,
}: {
  value: Outcome | null;
  saving: Outcome | null;
  onChange: (outcome: Outcome) => void;
}) {
  return (
    <ButtonGroup className="grid w-full grid-cols-3" aria-label="Climb outcome">
      {choices.map((choice) => {
        const selected = value === choice.value;
        const isSaving = saving === choice.value;
        return (
          <Button
            key={choice.value}
            variant={selected ? 'default' : 'outline'}
            className="min-w-0"
            aria-pressed={selected}
            disabled={saving !== null}
            onClick={() => onChange(choice.value)}
          >
            {isSaving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
            {choice.label}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}

export function GradePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (grade: number | null) => void;
}) {
  const grade = value ?? 0;
  return (
    <ButtonGroup aria-label="Grade" className="w-fit">
      <Button
        variant="outline"
        size="icon"
        aria-label="Decrease grade"
        disabled={grade === 0}
        onClick={() => onChange(Math.max(0, grade - 1))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <ButtonGroupText className="h-11 min-w-16 justify-center bg-background tabular-nums">
        V{grade}
      </ButtonGroupText>
      <Button
        variant="outline"
        size="icon"
        aria-label="Increase grade"
        onClick={() => onChange(grade + 1)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </ButtonGroup>
  );
}
