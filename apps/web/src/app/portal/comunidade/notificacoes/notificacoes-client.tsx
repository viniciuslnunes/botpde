'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { marcarTodasNotificacoesLidas } from '@/app/portal/comunidade/actions'
import type { NotificacaoSocialItem } from '@/lib/notificacoes-comunidade'
import type { FiltroNotificacaoSocial } from '@/lib/notificacoes-comunidade'

const FILTROS: Array<{ id: FiltroNotificacaoSocial; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'mencoes', label: 'Menções' },
  { id: 'reposts', label: 'Reposts' },
  { id: 'reacoes', label: 'Reações' },
  { id: 'seguimento', label: 'Seguimento' },
]

function formatarData(data: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

interface Props {
  inicial: NotificacaoSocialItem[]
}

export function NotificacoesComunidadeClient({ inicial }: Props) {
  const [filtro, setFiltro] = useState<FiltroNotificacaoSocial>('todas')
  const [itens, setItens] = useState<NotificacaoSocialItem[]>(inicial)
  const [carregando, setCarregando] = useState(false)
  const [pending, startTransition] = useTransition()

  const carregar = useCallback(async (novoFiltro: FiltroNotificacaoSocial) => {
    setCarregando(true)
    try {
      const res = await fetch(
        `/api/comunidade/notificacoes?filtro=${encodeURIComponent(novoFiltro)}`,
      )
      if (!res.ok) throw new Error('Erro ao carregar notificações')
      const data = (await res.json()) as { notificacoes: NotificacaoSocialItem[] }
      setItens(data.notificacoes)
    } catch {
      toast.error('Não foi possível carregar as notificações.')
    } finally {
      setCarregando(false)
    }
  }, [])

  function mudarFiltro(novo: FiltroNotificacaoSocial) {
    setFiltro(novo)
    void carregar(novo)
  }

  function marcarTodas() {
    startTransition(async () => {
      try {
        await marcarTodasNotificacoesLidas()
        setItens((prev) => prev.map((n) => ({ ...n, lida: true })))
        toast.success('Todas as notificações foram marcadas como lidas.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao marcar notificações.')
      }
    })
  }

  const naoLidas = itens.filter((n) => !n.lida).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => mudarFiltro(f.id)}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filtro === f.id
                  ? 'bg-[rgb(var(--primary))] text-white'
                  : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        {naoLidas > 0 && (
          <button
            type="button"
            onClick={marcarTodas}
            disabled={pending}
            className="text-xs font-medium text-[rgb(var(--primary))] hover:underline disabled:opacity-50"
          >
            {pending ? 'Marcando…' : 'Marcar todas como lidas'}
          </button>
        )}
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      )}

      {!carregando && itens.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
          <Bell className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma notificação neste filtro.
          </p>
        </div>
      )}

      {!carregando && itens.length > 0 && (
        <div className="space-y-2">
          {itens.map((item) => (
            <Link
              key={item.id}
              href={item.link ?? '/portal/comunidade'}
              className={[
                'block rounded-xl border border-[rgb(var(--border))] p-3 transition-colors',
                item.lida
                  ? 'bg-[rgb(var(--surface))] hover:bg-[rgb(var(--background-subtle))]'
                  : 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.06)] hover:bg-[rgb(var(--primary)_/_0.1)]',
              ].join(' ')}
            >
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{item.titulo}</p>
              {item.corpo && (
                <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                  {item.corpo}
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-[rgb(var(--foreground-muted))]">
                {formatarData(item.criadoEm)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
