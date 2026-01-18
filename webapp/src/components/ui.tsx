import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

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

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function Badge({
  label,
  variant = 'neutral',
  className,
}: {
  label: string;
  variant?: 'neutral' | 'warning' | 'brand';
  className?: string;
}) {
  const variantClass = variant === 'brand' ? '' : variant;
  return (
    <span className={`badge ${variantClass}${className ? ` ${className}` : ''}`}>{label}</span>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input${props.className ? ` ${props.className}` : ''}`} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input${className ? ` ${className}` : ''}`} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-chip">
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}
