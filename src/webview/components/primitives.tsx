import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-btn-bg text-btn-fg hover:bg-btn-hover border border-transparent',
  secondary:
    'bg-btn-secondary-bg text-btn-secondary-fg hover:bg-[var(--vscode-button-secondaryHoverBackground)] border border-transparent',
  ghost:
    'bg-transparent text-fg hover:bg-hover border border-transparent',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-[24px] px-2 text-xs gap-1',
  md: 'h-[28px] px-3 text-sm gap-1.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded font-sans transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed select-none',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {icon && <span className={`codicon codicon-${icon}`} aria-hidden="true" />}
      {children && <span>{children}</span>}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  /** When true, swap the glyph for a spinning loader and disable
   *  the button. Used by self-contained async actions (e.g. the
   *  thread refresh button) that want in-place progress feedback. */
  busy?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, className, busy, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy || disabled}
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded text-fg/80 hover:text-fg hover:bg-hover transition-colors duration-100',
        'disabled:opacity-60 disabled:cursor-default disabled:hover:bg-transparent',
        className,
      )}
      {...rest}
    >
      <span
        className={cn('codicon', busy ? 'codicon-loading animate-spin' : `codicon-${icon}`)}
        aria-hidden="true"
      />
    </button>
  );
});

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'success' | 'accent' | 'muted';
  className?: string;
}): JSX.Element {
  const toneClasses: Record<typeof tone, string> = {
    default: 'bg-badge text-badge-fg',
    success: 'bg-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_18%,transparent)] text-success',
    accent: 'bg-[color-mix(in_srgb,var(--vscode-textLink-foreground)_15%,transparent)] text-accent',
    muted: 'bg-[var(--vscode-list-hoverBackground)] text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 h-[18px] rounded-sm text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Divider(props: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...props}
      className={cn('h-px w-full bg-[var(--vscode-widget-border,var(--vscode-panel-border))]', props.className)}
    />
  );
}

export function Avatar({
  src,
  alt,
  size = 28,
}: {
  src: string | undefined | null;
  alt: string;
  size?: number;
}): JSX.Element {
  const initials = alt.slice(0, 2).toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="rounded-full bg-[var(--vscode-list-hoverBackground)]"
        loading="lazy"
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[var(--vscode-list-hoverBackground)] text-muted text-xs font-medium"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 text-muted ag-fade-in">
      <span className={`codicon codicon-${icon} text-2xl mb-3 opacity-60`} aria-hidden="true" />
      <div className="text-md text-fg/80">{title}</div>
      {hint && <div className="text-sm mt-1">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2 text-muted text-sm">
      <span className="codicon codicon-loading" aria-hidden="true" />
      {label}
    </div>
  );
}

export interface DropdownMenuItem {
  icon?: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function DropdownMenu({
  items,
  triggerLabel,
  align = 'end',
}: {
  items: DropdownMenuItem[];
  triggerLabel: string;
  align?: 'start' | 'end';
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center justify-center w-6 h-6 rounded transition-colors duration-100',
          open ? 'bg-hover text-fg' : 'text-fg/60 hover:text-fg hover:bg-hover',
        )}
      >
        <span className="codicon codicon-kebab-vertical" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 min-w-[180px] rounded-md py-1',
            'bg-[var(--vscode-menu-background,var(--vscode-editor-background))]',
            'border border-[var(--vscode-menu-border,var(--vscode-widget-border,var(--vscode-panel-border)))]',
            'shadow-[var(--ag-shadow-pop)]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex items-center gap-2 w-full px-3 h-[26px] text-left text-sm transition-colors duration-100',
                'text-[var(--vscode-menu-foreground,var(--vscode-foreground))]',
                'hover:bg-[var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))]',
                'hover:text-[var(--vscode-menu-selectionForeground,var(--vscode-foreground))]',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                item.destructive && 'text-error hover:text-error',
              )}
            >
              {item.icon && (
                <span
                  className={`codicon codicon-${item.icon} shrink-0`}
                  aria-hidden="true"
                />
              )}
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MenuTriggerSlot({ children }: { children: ReactNode }): JSX.Element {
  // Small wrapper to keep the menu trigger from getting compressed by
  // flex parents that distribute width — used in card headers.
  return <div className="shrink-0">{children}</div>;
}
