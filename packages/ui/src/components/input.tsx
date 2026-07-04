import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const fieldClass =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2.5 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-transparent focus:ring-2 focus:ring-[rgb(var(--color-primary))] transition-all disabled:opacity-50'

/** Input de texto padrão do design system — mesmo visual em toda a plataforma. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={className ? `${fieldClass} ${className}` : fieldClass} {...props} />
  },
)

/** `<select>` com o mesmo visual do Input — mais o cursor de ponteiro. */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    const cls = `${fieldClass} cursor-pointer`
    return <select ref={ref} className={className ? `${cls} ${className}` : cls} {...props} />
  },
)

/** Textarea com o mesmo visual do Input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={className ? `${fieldClass} ${className}` : fieldClass} {...props} />
  },
)
