import type { ButtonHTMLAttributes } from 'react';

const CameraIcon = () => (
  <svg
    aria-hidden="true"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export interface FABProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function FAB({ label = 'Capture', onClick, ...props }: FABProps) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label} {...props}>
      <CameraIcon />
    </button>
  );
}
