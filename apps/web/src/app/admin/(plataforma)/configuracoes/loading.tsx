export default function ConfiguracoesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-2">
        {['w-32', 'w-24', 'w-36', 'w-28'].map((largura) => (
          <div key={largura} className={`h-8 rounded-lg bg-[rgb(var(--border))] ${largura}`} />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
    </div>
  )
}
