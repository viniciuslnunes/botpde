'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Bell, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { marcarTodasNotificacoesLidas } from '@/app/portal/comunidade/actions'
import { marcarNotificacaoLida, marcarNotificacoesLidasPorIds } from '@/app/actions/notificacoes'
import { NotificationAvatar, formatarTituloNotificacao } from '@/components/portal/notification-item-visual'
import type { NotificacaoSocialItem } from '@/lib/notificacoes-comunidade'
import type { FiltroNotificacaoSocial } from '@/lib/notificacoes-comunidade'
import { fadeUp, menuItemStagger, springSnappy } from '@/lib/motion-presets'
import { NOTIFICATION_AUTO_READ_DELAY_MS } from '@/lib/notificacao-auto-read'
import {
  markNavbarNotificationRead,
  markNavbarNotificationsRead,
  refreshNavbarContext,
} from '@/lib/use-navbar-context'

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

/** Chave de dia local (ano/mês/dia) para comparação sem bug de fuso. */
function chaveDiaLocal(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`
}

/** Particiona em "Hoje" / "Ontem" / "Mais antigas", preservando a ordem original. */
function agruparPorDia(
  itens: NotificacaoSocialItem[],
): Array<{ label: string; itens: NotificacaoSocialItem[] }> {
  const agora = new Date()
  const hoje = chaveDiaLocal(agora)
  const ontem = chaveDiaLocal(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1))

  const grupos: Array<{ label: string; itens: NotificacaoSocialItem[] }> = [
    { label: 'Hoje', itens: [] },
    { label: 'Ontem', itens: [] },
    { label: 'Mais antigas', itens: [] },
  ]

  for (const item of itens) {
    const chave = chaveDiaLocal(new Date(item.criadoEm))
    if (chave === hoje) grupos[0].itens.push(item)
    else if (chave === ontem) grupos[1].itens.push(item)
    else grupos[2].itens.push(item)
  }

  return grupos.filter((g) => g.itens.length > 0)
}

interface Props {
  inicial: NotificacaoSocialItem[]
}

export function NotificacoesComunidadeClient({ inicial }: Props) {
  const router = useRouter()
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
    setItens((prev) => prev.map((n) => ({ ...n, lida: true })))
    markNavbarNotificationsRead()
    startTransition(async () => {
      try {
        await marcarTodasNotificacoesLidas()
        void refreshNavbarContext(true)
        router.refresh()
        toast.success('Todas as notificações foram marcadas como lidas.')
      } catch (e) {
        void refreshNavbarContext(true)
        void carregar(filtro)
        toast.error(e instanceof Error ? e.message : 'Erro ao marcar notificações.')
      }
    })
  }

  function abrirNotificacao(item: NotificacaoSocialItem) {
    if (item.lida) return
    setItens((prev) => prev.map((n) => (n.id === item.id ? { ...n, lida: true } : n)))
    markNavbarNotificationRead(item.id)
    startTransition(() => {
      void marcarNotificacaoLida(item.id)
    })
  }

  // Marca como lidos os itens visíveis após um delay — dá tempo do usuário
  // perceber o destaque de "não lido" antes dele sumir. Troca de filtro
  // antes do delay cancela o timer anterior (o novo efeito cuida do resto).
  useEffect(() => {
    const idsNaoLidos = itens.filter((n) => !n.lida).map((n) => n.id)
    if (idsNaoLidos.length === 0) return

    const timer = setTimeout(() => {
      setItens((prev) =>
        prev.map((n) => (idsNaoLidos.includes(n.id) ? { ...n, lida: true } : n)),
      )
      for (const id of idsNaoLidos) markNavbarNotificationRead(id)
      startTransition(() => {
        void marcarNotificacoesLidasPorIds(idsNaoLidos)
      })
    }, NOTIFICATION_AUTO_READ_DELAY_MS)

    return () => clearTimeout(timer)
  }, [itens])

  const naoLidas = itens.filter((n) => !n.lida).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const ativo = filtro === f.id
            return (
              <m.button
                key={f.id}
                type="button"
                onClick={() => mudarFiltro(f.id)}
                whileTap={{ scale: 0.95 }}
                transition={springSnappy}
                className={[
                  'relative rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  ativo
                    ? 'text-white'
                    : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                {ativo && (
                  <m.span
                    layoutId="notif-filtro-pill"
                    className="absolute inset-0 rounded-full bg-[rgb(var(--primary))]"
                    transition={springSnappy}
                  />
                )}
                <span className="relative">{f.label}</span>
              </m.button>
            )
          })}
        </div>
        {naoLidas > 0 && (
          <m.button
            type="button"
            onClick={marcarTodas}
            disabled={pending}
            whileTap={{ scale: 0.98 }}
            transition={springSnappy}
            className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline disabled:opacity-50"
          >
            {pending ? 'Marcando…' : 'Marcar todas como lidas'}
          </m.button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {carregando ? (
          <m.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </m.div>
        ) : itens.length === 0 ? (
          <m.div
            key="empty"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="flex flex-col items-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center"
          >
            <Bell className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma notificação neste filtro.
            </p>
          </m.div>
        ) : (
          <m.div
            key={`lista-${filtro}`}
            className="space-y-2"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          >
            {agruparPorDia(itens).map((grupo) => (
              <div key={grupo.label} className="space-y-2">
                <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] first:pt-0">
                  {grupo.label}
                </p>
                {grupo.itens.map((item, i) => (
                  <m.div
                    key={item.id}
                    custom={i}
                    variants={menuItemStagger}
                    layout
                    animate={{
                      opacity: item.lida ? 0.85 : 1,
                      scale: item.lida ? 0.99 : 1,
                    }}
                    transition={springSnappy}
                  >
                    <Link
                      href={item.link ?? '/portal/comunidade'}
                      onClick={() => abrirNotificacao(item)}
                      className={[
                        'block rounded-xl border border-[rgb(var(--border))] p-3 transition-colors',
                        item.lida
                          ? 'bg-[rgb(var(--surface))] hover:bg-[rgb(var(--background-subtle))]'
                          : 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.06)] hover:bg-[rgb(var(--primary)_/_0.1)]',
                      ].join(' ')}
                    >
                      <span className="flex items-start gap-3">
                        <NotificationAvatar ator={item.ator} tipo={item.tipo} size="md" />
                        <span className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                            {formatarTituloNotificacao(item)}
                          </p>
                          {item.corpo && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                              {item.corpo}
                            </p>
                          )}
                          <p className="mt-1.5 text-[10px] text-[rgb(var(--foreground-muted))]">
                            {formatarData(item.criadoEm)}
                          </p>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                      </span>
                    </Link>
                  </m.div>
                ))}
              </div>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
