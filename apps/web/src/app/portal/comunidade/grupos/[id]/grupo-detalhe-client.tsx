'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  MessageCircle,
  Users,
  Loader2,
  Globe,
  Lock,
  BellOff,
  Bell,
  LogOut,
  Check,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  publicarPostGrupo,
  entrarGrupoPublico,
  pedirEntradaGrupo,
  sairGrupo,
  alternarSilencioGrupo,
  decidirPedidoGrupo,
} from '@/app/portal/comunidade/actions'
import { ComunidadeTabBar } from '../../_components/comunidade-tab-bar'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { Avatar } from '@/components/portal/avatar'
import { springSnappy } from '@/lib/motion-presets'
import type { GrupoDetalheItem, MembroGrupoPendenteItem, PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface GrupoDetalheClientProps {
  grupo: GrupoDetalheItem
  posts: PostSocialItem[]
  salvoIds: string[]
  currentUser: CurrentUser
  pedidos: MembroGrupoPendenteItem[]
  tabInicial?: 'mural' | 'membros' | 'sobre'
}

export function GrupoDetalheClient({
  grupo: grupoInicial,
  posts: postsIniciais,
  salvoIds,
  currentUser,
  pedidos: pedidosIniciais,
  tabInicial = 'mural',
}: GrupoDetalheClientProps) {
  const router = useRouter()
  const [grupo, setGrupo] = useState(grupoInicial)
  const [pedidos, setPedidos] = useState(pedidosIniciais)
  const [aba, setAba] = useState<'mural' | 'membros' | 'sobre'>(
    grupoInicial.souMembro ? tabInicial : 'sobre',
  )
  const [conteudo, setConteudo] = useState('')
  const [pending, startTransition] = useTransition()

  function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) return
    startTransition(async () => {
      const result = await publicarPostGrupo(grupo.id, conteudo.trim())
      if (!result.success) {
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      setConteudo('')
      toast.success('Publicado no mural!')
      router.refresh()
    })
  }

  function entrar() {
    startTransition(async () => {
      try {
        await entrarGrupoPublico(grupo.id)
        toast.success('Você entrou no grupo!')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedir() {
    startTransition(async () => {
      try {
        await pedirEntradaGrupo(grupo.id)
        setGrupo((g) => ({ ...g, pedidoPendente: true }))
        toast.success('Pedido enviado!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível pedir entrada.')
      }
    })
  }

  function sair() {
    startTransition(async () => {
      try {
        await sairGrupo(grupo.id)
        toast.success('Você saiu do grupo.')
        router.push('/portal/comunidade/grupos')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível sair.')
      }
    })
  }

  function silenciar() {
    startTransition(async () => {
      try {
        const { silenciada } = await alternarSilencioGrupo(grupo.id)
        setGrupo((g) => ({ ...g, silenciada }))
        toast.success(silenciada ? 'Grupo silenciado no feed.' : 'Grupo voltou ao feed.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível alterar.')
      }
    })
  }

  function decidir(userId: string, aprovar: boolean) {
    startTransition(async () => {
      try {
        await decidirPedidoGrupo(grupo.id, userId, aprovar)
        setPedidos((prev) => prev.filter((p) => p.userId !== userId))
        if (aprovar) {
          setGrupo((g) => ({ ...g, membros: g.membros + 1 }))
        }
        toast.success(aprovar ? 'Pedido aprovado.' : 'Pedido recusado.')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível decidir.')
      }
    })
  }

  const tabs = grupo.souMembro
    ? [
        { kind: 'button' as const, id: 'mural', label: 'Mural' },
        {
          kind: 'link' as const,
          id: 'chat',
          label: 'Chat',
          href: `/portal/mensagens?c=${grupo.id}`,
          icon: <MessageCircle className="h-4 w-4" />,
        },
        {
          kind: 'button' as const,
          id: 'membros',
          label: pedidos.length > 0 ? `Membros (${pedidos.length})` : 'Membros',
        },
        { kind: 'button' as const, id: 'sobre', label: 'Sobre' },
      ]
    : [{ kind: 'button' as const, id: 'sobre', label: 'Sobre' }]

  return (
    <div className="space-y-4">
      <m.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        className="card-soft flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--primary)_/_0.12)] text-lg font-bold text-[rgb(var(--color-primary-fg))]">
            {(grupo.nome ?? 'G').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">
                {grupo.nome ?? 'Grupo'}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {grupo.publica ? (
                  <>
                    <Globe className="h-3 w-3" /> Público
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" /> Privado
                  </>
                )}
              </span>
            </div>
            {grupo.descricao && (
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{grupo.descricao}</p>
            )}
            <span className="mt-2 inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
              <Users className="h-3.5 w-3.5" />
              {grupo.membros} membro{grupo.membros === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!grupo.souMembro && !grupo.pedidoPendente && grupo.publica && (
            <button
              type="button"
              disabled={pending}
              onClick={entrar}
              className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Entrar
            </button>
          )}
          {!grupo.souMembro && !grupo.pedidoPendente && !grupo.publica && (
            <button
              type="button"
              disabled={pending}
              onClick={pedir}
              className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Pedir entrada
            </button>
          )}
          {grupo.pedidoPendente && (
            <span className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]">
              Pedido pendente
            </span>
          )}
          {grupo.souMembro && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={silenciar}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                {grupo.silenciada ? (
                  <>
                    <Bell className="h-4 w-4" /> No feed
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4" /> Silenciar
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={sair}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </>
          )}
        </div>
      </m.header>

      <ComunidadeTabBar
        layoutId="grupo-tab-indicator"
        activeId={aba}
        onTabChange={(id) => {
          if (id === 'chat') return
          setAba(id as 'mural' | 'membros' | 'sobre')
        }}
        items={tabs}
      />

      <AnimatePresence mode="wait">
        {aba === 'sobre' && (
          <m.div
            key="sobre"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="card-soft space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <p>
              {grupo.publica
                ? 'Grupo público: qualquer membro da torcida pode entrar e ver o mural.'
                : 'Grupo privado: só membros aprovados veem o mural e o chat.'}
            </p>
            {grupo.descricao ? (
              <p className="text-[rgb(var(--foreground))]">{grupo.descricao}</p>
            ) : (
              <p>Sem descrição adicional.</p>
            )}
            {!grupo.souMembro && (
              <p className="font-medium text-[rgb(var(--foreground))]">
                Entre no grupo para ver o mural e participar.
              </p>
            )}
          </m.div>
        )}

        {aba === 'membros' && grupo.souMembro && (
          <m.div
            key="membros"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="space-y-3"
          >
            {grupo.souAdmin && (
              <div className="card-soft space-y-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  Pedidos pendentes
                </h2>
                {pedidos.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum pedido.</p>
                ) : (
                  <ul className="space-y-2">
                    {pedidos.map((p) => (
                      <li
                        key={p.userId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar nome={p.nome} avatarUrl={p.avatarUrl} size="sm" />
                          <span className="truncate text-sm font-medium">
                            {p.nome ?? 'Membro'}
                          </span>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => decidir(p.userId, true)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Aprovar
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => decidir(p.userId, false)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {grupo.membros} membro{grupo.membros === 1 ? '' : 's'} ativo
              {grupo.membros === 1 ? '' : 's'}. O chat lista todos os participantes.
            </p>
          </m.div>
        )}

        {aba === 'mural' && grupo.souMembro && (
          <m.div
            key="mural"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="space-y-4"
          >
            <form
              onSubmit={publicar}
              className="card-soft space-y-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                maxLength={3000}
                rows={3}
                placeholder="Publique no mural do grupo…"
                className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm outline-none transition-colors focus:border-[rgb(var(--primary))]"
              />
              <m.button
                type="submit"
                disabled={pending || !conteudo.trim()}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Publicar
              </m.button>
            </form>

            <ComunidadePostsAnimated
              posts={postsIniciais}
              currentUser={currentUser}
              salvoIds={salvoIds}
              emptyTitle="Nenhuma publicação no mural ainda."
              emptyDescription="Seja o primeiro!"
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
