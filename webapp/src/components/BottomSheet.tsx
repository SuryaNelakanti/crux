import { useCallback, useEffect, useRef, type ReactNode } from 'react';

export interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
}

export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const firstFocusable = useRef<HTMLElement | null>(null);

    // Focus trap and keyboard handling
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
            if (event.key === 'Tab' && sheetRef.current) {
                const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const first = focusables[0];
                const last = focusables[focusables.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        },
        [onClose]
    );

    // Lock scroll when open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
            document.addEventListener('keydown', handleKeyDown);

            // Focus first element
            setTimeout(() => {
                const first = sheetRef.current?.querySelector<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                first?.focus();
                firstFocusable.current = first ?? null;
            }, 50);
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="bottom-sheet-backdrop"
                onClick={onClose}
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(16, 24, 39, 0.4)',
                    zIndex: 'var(--z-modal)',
                    animation: 'fadeIn var(--duration-fast) var(--ease-standard)',
                }}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="bottom-sheet"
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
                    padding: 'var(--space-5)',
                    paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom, 0px))',
                    zIndex: 'var(--z-modal)',
                    boxShadow: 'var(--shadow-modal)',
                    animation: 'slideUp var(--duration-normal) var(--ease-emphasized)',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                }}
            >
                {/* Drag handle */}
                <div
                    style={{
                        width: 40,
                        height: 4,
                        background: 'var(--color-border-strong)',
                        borderRadius: 'var(--radius-pill)',
                        margin: '0 auto var(--space-4)',
                    }}
                />

                {title && (
                    <h2
                        style={{
                            fontSize: 'var(--text-lg)',
                            fontWeight: 600,
                            marginBottom: 'var(--space-4)',
                        }}
                    >
                        {title}
                    </h2>
                )}

                {children}
            </div>

            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
        </>
    );
}
