import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

const styles: Record<Variant, string> = {
  primary:
    'bg-gradient-accent text-white shadow-accent hover:-translate-y-px hover:shadow-accent-hover active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-accent',
  secondary:
    'bg-surface text-ink-2 border border-line hover:bg-surface-2 hover:text-ink disabled:opacity-50',
  danger:
    'bg-[oklch(0.95_0.06_18)] text-[oklch(0.40_0.18_18)] border border-[oklch(0.85_0.10_18)] hover:bg-[oklch(0.92_0.08_18)] disabled:opacity-50',
  ghost:
    'bg-transparent text-ink-2 border border-line hover:bg-surface-2 hover:text-ink disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-btn px-3.5 py-2 text-[13px] font-semibold transition-[background,transform,box-shadow] duration-150 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
