'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { Radio, Plus, Loader2, Users, ArrowLeftRight } from 'lucide-react'
import { toast } from '@torcida/ui'
import { criarCanalTematico, entrarCanal, pedirEntradaCanal } from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import { TorcidaContextSwitcher } from '@/components/torcida-context-switcher'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { TorcidaOpcao } from '@/lib/torcida-labels'
import {
  labelVisibilidadeCanal,
  linkCanalComunidade,
  linkUnidadeComunidade,
  type CanalItem,
} from '@/lib/canais-shared'

interface CanaisClientProps {
  canais: CanalItem[]
  /** Vínculos de sócio APROVADO do usuário — troca real de tenant (fora de escopo overlay). */
  vinculos: TorcidaOpcao[]
  tenantSlugAtual: string
  podeCriarCanal: boolean
  tenantAtualId: string
}

export function CanaisClient({
  canais,
  vinculos,
  tenantSlugAtual,
  podeCriarCanal,
  tenantAtualId,
}: CanaisClientProps) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [visibilidade, setVisibilidade] = useState<'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'>(
    'HIERARQUIA',
  )
  const [privado, setPrivado] = useState(false)
  const [pending, startTransition] = useTransition()

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarCanal(id)
        toast.success('Inscrito no canal!')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedirEntrada(id: string) {
    startTransition(async () => {
      try {
        await pedirEntradaCanal(id)
        toast.success('Pedido enviado — aguarde a aprovação.')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
      }
    })
  }

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    startTransition(async () => {
      try {
        const { id } = await criarCanalTematico(
          nome.trim(),
          descricao.trim() || undefined,
          visibilidade,
          avatarUrl.trim() || undefined,
          !privado,
        )
        toast.success('Canal criado!')
        window.location.href = linkCanalComunidade(id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível criar.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {podeCriarCanal && (
        <div className="flex items-center justify-end">
          <m.button
            type="button"
            onClick={() => setCriando((v) => !v)}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Novo canal
          </m.button>
        </div>
      )}

      <AnimatePresence>
        {criando && (
          <m.form
            key="criar-canal"
            onSubmit={criar}
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="card-soft space-y-3 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              placeholder="Nome do canal temático"
              required
              className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            />
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Descrição (opcional)"
              className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              {avatarUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl.trim()}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg border border-[rgb(var(--border))] object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]">
                  <Radio className="h-4 w-4" />
                </div>
              )}
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="URL do escudo/avatar (opcional)"
                className="h-10 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
              />
            </div>
            <select
              value={visibilidade}
              onChange={(e) =>
                setVisibilidade(e.target.value as 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO')
              }
              className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            >
              <option value="TENANT">Só esta torcida</option>
              <option value="HIERARQUIA">Hierarquia (sede/subsede/PDE)</option>
              <option value="ALIADOS">Hierarquia + aliados</option>
              <option value="PUBLICO">Comunidade aberta</option>
            </select>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2.5">
              <input
                type="checkbox"
                checked={privado}
                onChange={(e) => setPrivado(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                  Canal privado
                </span>
                <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                  Entrada mediante pedido — um admin precisa aprovar
                </span>
              </span>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar canal
            </button>
          </m.form>
        )}
      </AnimatePresence>

      {vinculos.length > 1 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <ArrowLeftRight className="h-4 w-4" />
            Suas torcidas
          </h2>
          <div className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
            <TorcidaContextSwitcher torcidas={vinculos} atualSlug={tenantSlugAtual} destino="portal" />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <Radio className="h-4 w-4" />
          Canais
        </h2>
        {canais.length === 0 ? (
          <MotionEmptyState
            className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
            title="Nenhum canal visível ainda."
          />
        ) : (
          <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-1.5">
            {canais.map((c) => (
              <m.div key={c.id} variants={staggerItem}>
                <CanalRow
                  canal={c}
                  tenantAtualId={tenantAtualId}
                  onEntrar={entrar}
                  onPedirEntrada={pedirEntrada}
                  pending={pending}
                />
              </m.div>
            ))}
          </m.div>
        )}
      </section>
    </div>
  )
}

function CanalRow({
  canal,
  tenantAtualId,
  onEntrar,
  onPedirEntrada,
  pending,
}: {
  canal: CanalItem
  tenantAtualId: string
  onEntrar: (id: string) => void
  onPedirEntrada: (id: string) => void
  pending: boolean
}) {
  const href = canal.canalOficial ? linkUnidadeComunidade(canal.tenantId) : linkCanalComunidade(canal.id)

  return (
    <div className="card-soft flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
      <Avatar nome={canal.nome ?? canal.tenantNome} avatarUrl={canal.avatarUrl} size="sm" fit="contain" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
            {canal.nome ?? 'Canal'}
          </p>
          <span className="inline-flex shrink-0 rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
            {canal.canalOficial ? 'Oficial' : 'Temático'}
          </span>
          {canal.tenantId === tenantAtualId && (
            <span className="text-[10px] font-medium text-[rgb(var(--foreground-muted))]">você</span>
          )}
        </div>
        <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {canal.membros}
          </span>
          {' · '}
          {canal.tenantNome}
          {' · '}
          {labelVisibilidadeCanal(canal.visibilidadeCanal)}
        </p>
      </div>

      {canal.souMembro ? (
        <Link
          href={href}
          className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Abrir
        </Link>
      ) : canal.publica ? (
        <m.button
          type="button"
          disabled={pending}
          onClick={() => onEntrar(canal.id)}
          whileTap={{ scale: 0.94 }}
          transition={springSnappy}
          className="shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
        >
          Entrar
        </m.button>
      ) : canal.pedidoPendente ? (
        <span className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Pedido enviado
        </span>
      ) : (
        <m.button
          type="button"
          disabled={pending}
          onClick={() => onPedirEntrada(canal.id)}
          whileTap={{ scale: 0.94 }}
          transition={springSnappy}
          className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
        >
          Pedir para entrar
        </m.button>
      )}
    </div>
  )
}
