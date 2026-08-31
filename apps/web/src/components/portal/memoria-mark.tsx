import type { SVGProps } from 'react'

/**
 * Marca da Memória: escudo com a espinha de dias dentro.
 * Substitui o `History` (relógio) na top bar — aquele ícone não diz "linha do tempo".
 */
export function MemoriaMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...props}
    >
      <path
        d="M12 3.2 5.25 6.4v5.15c0 4.55 3.05 7.85 6.75 9.05 3.7-1.2 6.75-4.5 6.75-9.05V6.4L12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.15v7.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8.9" r="1.15" fill="currentColor" />
      <circle cx="12" cy="11.7" r="1.15" fill="currentColor" />
      <circle cx="12" cy="14.5" r="1.15" fill="currentColor" />
    </svg>
  )
}
