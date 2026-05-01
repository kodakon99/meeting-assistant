import type { HTMLAttributes, ReactNode } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  className?: string
  interactive?: boolean
}

export function Card({
  children,
  className = '',
  interactive = false,
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      className={`bg-surface border border-line rounded-card shadow-sm transition-[border-color,box-shadow,transform] duration-200 ${
        interactive
          ? 'hover:border-line-2 hover:shadow hover:-translate-y-px cursor-pointer'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}
