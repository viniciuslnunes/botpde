'use client'

import { useActionState, useEffect, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  Check,
  Loader2,
  MessageCircle,
  MoreVertical,
  Settings,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  entrarCanal,
  pedirEntradaCanal,
  alterarAdminCanal,
  atualizarCanalTematico,
  decidirPedidoCanal,
} from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import { CanalNavbarOverride } from '@/components/canal-navbar-override'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import {
  labelVisibilidadeCanal,
  linkUnidadeComunidade,
  type CanalItem,
  type MembroCanalItem,
  type PedidoCanalItem,
  type VisibilidadeCanal,
} from '@/lib/canais-shared'
import { popoverPanel, springSnappy } from '@/lib/motion-presets'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface CanalFeedCompositionProps {
  canal: CanalItem
  currentUser: CurrentUser
  podePublicar: boolean
  corPrimaria: string
  membros: MembroCanalItem[]
  podeGerenciarAdmins: boolean
  pedidos: PedidoCanalItem[]
  podeGerenciarPedidos: boolean
  /** Composer (mesmo `FeedComposer` do feed principal) — só quando `podePublicar`. */
  composer: ReactNode
  children: ReactNode
}

export function CanalFeedComposition({
  canal,
  currentUser,
  podePublicar,
  corPrimaria,
  membros,
  podeGerenciarAdmins,
  pedidos,
  podeGerenciarPedidos,
  composer,
  children,
}: CanalFeedCompositionProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [gerenciarOpen, setGerenciarOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [pedidosOpen, setPedidosOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function inscrever() {
    startTransition(async () => {
      try {
        await entrarCanal(canal.id)
        toast.success('Inscrito no canal!')
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao inscrever.')
      }
    })
  }

  function pedirEntrada() {
    startTransition(async () => {
      try {
        await pedirEntradaCanal(canal.id)
        toast.success('Pedido enviado — aguarde a aprovação.')
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <CanalNavbarOverride
        brand={{
          nome: canal.nome ?? canal.tenantNome,
          corPrimaria,
          logoUrl: canal.avatarUrl,
        }}
      />

      <header className="card-soft flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
        <Avatar nome={canal.nome ?? canal.tenantNome} avatarUrl={canal.avatarUrl} size="sm" fit="contain" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-sm font-bold text-[rgb(var(--foreground))]">
              {canal.nome ?? 'Canal'}
            </h1>
            <span className="inline-flex shrink-0 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
              {canal.canalOficial ? 'Oficial' : 'Temático'}
            </span>
          </div>
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {canal.membros} inscrito{canal.membros === 1 ? '' : 's'}
            </span>
            {' · '}
            {canal.tenantNome}
            {' · '}
            {labelVisibilidadeCanal(canal.visibilidadeCanal)}
          </p>
        </div>

        {canal.souMembro && (
          <Link
            href={`/portal/mensagens?c=${canal.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </Link>
        )}

        {!canal.souMembro && canal.publica && (
          <m.button
            type="button"
            disabled={pending}
            onClick={inscrever}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="shrink-0 rounded-full bg-[rgb(var(--color-primary))] px-3.5 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Inscrever
          </m.button>
        )}

        {!canal.souMembro && !canal.publica && canal.pedidoPendente && (
          <span className="shrink-0 rounded-full border border-[rgb(var(--border))] px-3.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Pedido enviado
          </span>
        )}

        {!canal.souMembro && !canal.publica && !canal.pedidoPendente && (
          <m.button
            type="button"
            disabled={pending}
            onClick={pedirEntrada}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="shrink-0 rounded-full bg-[rgb(var(--color-primary))] px-3.5 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Pedir para entrar
          </m.button>
        )}

        {canal.canalOficial && (
          <Link
            href={linkUnidadeComunidade(canal.tenantId)}
            className="hidden shrink-0 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline sm:block"
          >
            Perfil da unidade
          </Link>
        )}

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Mais opções do canal"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <m.div
                  variants={popoverPanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={springSnappy}
                  className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
                >
                  {podeGerenciarAdmins && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfigOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Settings className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                      Configurações do canal
                    </button>
                  )}
                  {podeGerenciarAdmins && (
                    <button
                      type="button"
                      onClick={() => {
                        setGerenciarOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Shield className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                      Gerenciar administradores
                    </button>
                  )}
                  {podeGerenciarPedidos && (
                    <button
                      type="button"
                      onClick={() => {
                        setPedidosOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <span className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                        Pedidos pendentes
                      </span>
                      {pedidos.length > 0 && (
                        <span className="rounded-full bg-[rgb(var(--color-primary))] px-1.5 py-0.5 text-[10px] font-bold text-[rgb(var(--color-primary-on))]">
                          {pedidos.length}
                        </span>
                      )}
                    </button>
                  )}
                  <Link
                    href="/portal/comunidade/canais"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <Users className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    Ver todos os canais
                  </Link>
                </m.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {configOpen && (
        <CanalConfigModal canal={canal} onClose={() => setConfigOpen(false)} />
      )}

      {gerenciarOpen && (
        <GerenciarAdminsModal
          canalId={canal.id}
          membros={membros}
          currentUserId={currentUser.id}
          onClose={() => setGerenciarOpen(false)}
        />
      )}

      {pedidosOpen && (
        <PedidosCanalModal
          canalId={canal.id}
          pedidos={pedidos}
          onClose={() => setPedidosOpen(false)}
        />
      )}

      {canal.souMembro && podePublicar && composer}

      {!canal.souMembro ? (
        <MotionEmptyState
          className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
          title="Inscreva-se no canal"
          description="Para ver o mural completo e participar do chat."
        />
      ) : (
        children
      )}
    </div>
  )
}

function GerenciarAdminsModal({
  canalId,
  membros,
  currentUserId,
  onClose,
}: {
  canalId: string
  membros: MembroCanalItem[]
  currentUserId: string
  onClose: () => void
}) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function alterar(userId: string, papel: 'ADMIN' | 'MEMBRO') {
    setPendingUserId(userId)
    startTransition(async () => {
      try {
        await alterarAdminCanal(canalId, userId, papel)
        toast.success(papel === 'ADMIN' ? 'Agora é administrador.' : 'Administração removida.')
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível alterar.')
      } finally {
        setPendingUserId(null)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <m.div
        variants={popoverPanel}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={springSnappy}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[rgb(var(--foreground))]">Administradores do canal</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {membros.length === 0 ? (
          <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum membro encontrado.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {membros.map((m2) => (
              <li key={m2.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar nome={m2.nome} avatarUrl={m2.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {m2.nome ?? 'Membro'}
                    {m2.userId === currentUserId ? ' (você)' : ''}
                  </p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {m2.papel === 'ADMIN' ? 'Administrador' : 'Membro'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending && pendingUserId === m2.userId}
                  onClick={() => alterar(m2.userId, m2.papel === 'ADMIN' ? 'MEMBRO' : 'ADMIN')}
                  className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                >
                  {pending && pendingUserId === m2.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : m2.papel === 'ADMIN' ? (
                    'Remover admin'
                  ) : (
                    'Tornar admin'
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </m.div>
    </div>
  )
}

function PedidosCanalModal({
  canalId,
  pedidos,
  onClose,
}: {
  canalId: string
  pedidos: PedidoCanalItem[]
  onClose: () => void
}) {
  const [decididos, setDecididos] = useState<Set<string>>(new Set())
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function decidir(userId: string, aprovar: boolean) {
    setPendingUserId(userId)
    startTransition(async () => {
      try {
        await decidirPedidoCanal(canalId, userId, aprovar)
        toast.success(aprovar ? 'Pedido aprovado.' : 'Pedido recusado.')
        setDecididos((prev) => new Set(prev).add(userId))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível decidir.')
      } finally {
        setPendingUserId(null)
      }
    })
  }

  const restantes = pedidos.filter((p) => !decididos.has(p.userId))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <m.div
        variants={popoverPanel}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={springSnappy}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[rgb(var(--foreground))]">Pedidos pendentes</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {restantes.length === 0 ? (
          <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum pedido pendente.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {restantes.map((p) => (
              <li key={p.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar nome={p.nome} avatarUrl={p.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {p.nome ?? 'Torcedor'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending && pendingUserId === p.userId}
                  onClick={() => decidir(p.userId, true)}
                  aria-label="Aprovar"
                  className="shrink-0 rounded-lg border border-[rgb(var(--border))] p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                >
                  {pending && pendingUserId === p.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={pending && pendingUserId === p.userId}
                  onClick={() => decidir(p.userId, false)}
                  aria-label="Recusar"
                  className="shrink-0 rounded-lg border border-[rgb(var(--border))] p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </m.div>
    </div>
  )
}

const VISIBILIDADE_OPCOES: Array<{ value: VisibilidadeCanal; label: string }> = [
  { value: 'TENANT', label: 'Só esta torcida' },
  { value: 'HIERARQUIA', label: 'Hierarquia (sede/subsede/PDE)' },
  { value: 'ALIADOS', label: 'Hierarquia + aliados' },
  { value: 'PUBLICO', label: 'Comunidade aberta' },
]

function CanalConfigModal({ canal, onClose }: { canal: CanalItem; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(atualizarCanalTematico, {})

  useEffect(() => {
    if (state.success) {
      toast.success('Canal atualizado.')
      window.location.reload()
    } else if (state.message) {
      toast.error(state.message)
    }
  }, [state])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <m.div
        variants={popoverPanel}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={springSnappy}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[rgb(var(--foreground))]">Configurações do canal</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={formAction} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <input type="hidden" name="conversaId" value={canal.id} />

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Nome</label>
            <input
              name="nome"
              defaultValue={canal.nome ?? ''}
              required
              minLength={3}
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Descrição</label>
            <textarea
              name="descricao"
              defaultValue={canal.descricao ?? ''}
              maxLength={280}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Foto (URL)</label>
            <input
              name="avatarUrl"
              defaultValue={canal.avatarUrl ?? ''}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Quem pode ver este canal
            </label>
            <select
              name="visibilidadeCanal"
              defaultValue={canal.visibilidadeCanal}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            >
              {VISIBILIDADE_OPCOES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2.5">
            <input
              type="checkbox"
              name="somenteAdminPublica"
              value="true"
              defaultChecked={canal.somenteAdminPublica}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                Só administradores publicam
              </span>
              <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                Desative para deixar qualquer membro publicar no mural
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2.5">
            <input
              type="checkbox"
              name="publica"
              value="true"
              defaultChecked={canal.publica}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                Canal aberto
              </span>
              <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                Desative para exigir pedido de entrada com aprovação de um admin
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </m.div>
    </div>
  )
}
