'use client'

export function ReciboPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print mt-6 w-full rounded-lg bg-[rgb(var(--primary))] px-4 py-2.5 text-sm font-medium text-white"
    >
      Imprimir recibo
    </button>
  )
}
