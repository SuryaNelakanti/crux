import type { Outcome } from '@crux/shared';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

/* --------------------------------------------------------------------------
   BUTTON
   -------------------------------------------------------------------------- */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <button
      {...props}
      type={type}
      className={`button ${variant}${className ? ` ${className}` : ''}`}
    />
  );
}

/* --------------------------------------------------------------------------
   CARD
   -------------------------------------------------------------------------- */
export function Card({
  children,
  className,
  variant = 'default',
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'flat' | 'inverse';
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const variantClass = variant === 'default' ? '' : `card-${variant}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={`card ${variantClass} ${className ?? ''}`}
        style={style}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={`card ${variantClass} ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
   BADGE
   -------------------------------------------------------------------------- */
export function Badge({
  label,
  variant = 'default',
  className,
}: {
  label: string;
  variant?: 'default' | 'neutral' | 'success' | 'warning' | 'brand';
  className?: string;
}) {
  // Map 'brand' to 'default' for backwards compatibility
  const variantClass = variant === 'default' || variant === 'brand' ? '' : variant;
  return <span className={`badge ${variantClass} ${className ?? ''}`}>{label}</span>;
}

/* --------------------------------------------------------------------------
   INPUT
   -------------------------------------------------------------------------- */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />;
}

/* --------------------------------------------------------------------------
   TEXTAREA
   -------------------------------------------------------------------------- */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${className ?? ''}`} />;
}

/* --------------------------------------------------------------------------
   SEGMENTED CONTROL
   -------------------------------------------------------------------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   OUTCOME CHIPS (horizontal radio-style)
   -------------------------------------------------------------------------- */
const OUTCOME_LABELS: Record<Outcome, string> = {
  tried: 'Tried',
  send: 'Sent',
  flash: 'Flash',
  project: 'Project',
};

export function OutcomeChips({
  value,
  onChange,
}: {
  value: Outcome | null;
  onChange: (outcome: Outcome) => void;
}) {
  const outcomes: Outcome[] = ['tried', 'send', 'flash'];

  return (
    <div className="outcome-chips" role="radiogroup" aria-label="Outcome">
      {outcomes.map((outcome) => (
        <button
          key={outcome}
          type="button"
          aria-pressed={outcome === value}
          data-outcome={outcome}
          className="outcome-chip"
          onClick={() => onChange(outcome)}
        >
          {OUTCOME_LABELS[outcome]}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   GRADE SELECTOR (single stepper with optional range display)
   -------------------------------------------------------------------------- */
export function GradeSelector({
  value,
  onChange,
  rangeMin,
  rangeMax,
}: {
  value: number | null;
  onChange: (grade: number | null) => void;
  rangeMin?: number | null;
  rangeMax?: number | null;
}) {
  const displayValue = value ?? 0;
  const hasRange = rangeMin != null && rangeMax != null && rangeMin !== rangeMax;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <button
        type="button"
        className="button secondary"
        onClick={() => onChange(Math.max(0, displayValue - 1))}
        aria-label="Decrease grade"
        style={{ padding: 'var(--space-2) var(--space-3)', minWidth: 40 }}
      >
        −
      </button>

      <span
        style={{ fontWeight: 600, fontSize: 'var(--text-lg)', minWidth: 48, textAlign: 'center' }}
      >
        V{displayValue}
      </span>

      <button
        type="button"
        className="button secondary"
        onClick={() => onChange(displayValue + 1)}
        aria-label="Increase grade"
        style={{ padding: 'var(--space-2) var(--space-3)', minWidth: 40 }}
      >
        +
      </button>

      {hasRange && (
        <span className="badge neutral" style={{ marginLeft: 'var(--space-2)' }}>
          V{rangeMin}–V{rangeMax}
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   STAT CHIP
   -------------------------------------------------------------------------- */
export function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="stat-chip"
      style={{
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <strong style={{ display: 'block', fontSize: 'var(--text-lg)' }}>{value}</strong>
      <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
        {label}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   TOAST (for auto-save feedback)
   -------------------------------------------------------------------------- */
export function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;

  return (
    <output className="toast" aria-live="polite">
      {message}
    </output>
  );
}

/* --------------------------------------------------------------------------
   COLLAPSIBLE
   -------------------------------------------------------------------------- */
export function Collapsible({
  trigger,
  children,
  defaultOpen = false,
}: {
  trigger: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        className="collapsible-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown />
        {trigger}
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

import { useState } from 'react';
