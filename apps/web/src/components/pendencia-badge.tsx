/** Badge de pendência (notificação não lida) — menus, cards, seções. */
export function PendenciaBadge({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  if (count <= 0) return null
  return (
    <span
      className={
        className ??
        'min-w-4 shrink-0 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white'
      }
      aria-label={`${count} ${count === 1 ? 'pendência' : 'pendências'}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
