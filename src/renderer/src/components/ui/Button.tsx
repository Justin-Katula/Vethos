import React from 'react'
import { cn } from '@/lib/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'solid' | 'ghost' | 'danger'
  size?: 'default' | 'sm' | 'lg'
  neon?: boolean
  accentColor?: string
  contentClassName?: string
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      neon = false,
      accentColor,
      contentClassName,
      children,
      ...props
    },
    ref,
  ) => {
    if (neon) {
      const neonVariantClasses = {
        default: 'bg-blue-500/5 hover:bg-blue-500/0 border-blue-500/20 text-text-primary',
        solid:
          'bg-blue-500 hover:bg-blue-600 text-white border-transparent hover:border-white/50',
        ghost:
          'border-transparent bg-transparent text-text-primary hover:border-zinc-600 hover:bg-white/10',
        danger: 'bg-red-500/5 hover:bg-red-500/0 border-red-500/20 text-red-400',
      }[variant]

      const neonSizeClasses = {
        default: 'px-7 py-1.5',
        sm: 'px-4 py-0.5 text-xs',
        lg: 'px-10 py-2.5 text-base',
      }[size]

      return (
        <button
          ref={ref}
          className={cn(
            'relative group mx-auto inline-flex items-center justify-center gap-2 rounded-full border text-center font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50',
            neonVariantClasses,
            neonSizeClasses,
            className,
          )}
          {...props}
        >
          <span className="absolute inset-x-0 inset-y-0 mx-auto h-px w-3/4 bg-gradient-to-r from-transparent via-blue-600 to-transparent opacity-0 transition-all duration-500 ease-in-out group-hover:opacity-100 dark:via-blue-500" />
          <span className={cn('relative z-10 flex items-center justify-center gap-2', contentClassName)}>
            {children}
          </span>
          <span className="absolute inset-x-0 -bottom-px mx-auto h-px w-3/4 bg-gradient-to-r from-transparent via-blue-600 to-transparent opacity-0 transition-all duration-500 ease-in-out group-hover:opacity-30 dark:via-blue-500" />
        </button>
      )
    }

    const bentoVariantClasses = {
      default:
        'border-border-subtle bg-bg-elevated/60 text-text-primary hover:border-border-strong hover:bg-bg-card-hover/80',
      solid:
        'border-accent/40 bg-accent text-black hover:border-white/20 hover:bg-accent-hover',
      ghost:
        'border-transparent bg-transparent text-text-secondary shadow-none hover:border-border-subtle hover:bg-white/5 hover:text-text-primary',
      danger:
        'border-red-500/25 bg-red-500/10 text-red-300 hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-100',
    }[variant]

    const bentoSizeClasses = {
      default: 'px-4 py-2 text-sm',
      sm: 'px-3 py-1.5 text-xs',
      lg: 'px-6 py-3 text-base',
    }[size]

    const bentoRadiusClass = {
      default: 'rounded-xl',
      sm: 'rounded-lg',
      lg: 'rounded-2xl',
    }[size]

    return (
      <button
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 overflow-hidden border text-center font-medium outline-none transition-colors duration-200 ease-out disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          bentoVariantClasses,
          bentoSizeClasses,
          bentoRadiusClass,
          className,
        )}
        {...props}
      >
        {accentColor && (
          <span
            className="absolute left-0 right-0 top-0 h-0.5"
            style={{ backgroundColor: accentColor }}
          />
        )}

        <span
          className={cn(
            'relative z-10 flex min-w-0 items-center justify-center gap-2',
            contentClassName,
          )}
        >
          {children}
        </span>
      </button>
    )
  }
)

Button.displayName = 'Button'
