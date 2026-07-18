'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { Users, Plus, Loader2, MessageCircle, Lock, Globe } from 'lucide-react'
import { toast } from '@torcida/ui'
import { criarGrupo, entrarGrupoPublico, pedirEntradaGrupo } from '@/app/portal/comunidade/actions'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { GrupoItem } from '@/lib/feed'

interface GruposClientProps {
  gruposIniciais: GrupoItem[]
}

export function GruposClient({ gruposIniciais }: GruposClientProps) {
  const [grupos, setGrupos] = useState(gruposIniciais)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [publica, setPublica] = useState(true)
  const [pending, startTransition] = useTransition()

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarGrupoPublico(id)
        setGrupos((prev) =>
          prev.map((g) =>
            g.id === id
              ? { ...g, souMembro: true, pedidoPendente: false, membros: g.membros + 1 }
              : g,
          ),
        )
        toast.success('Você entrou no grupo!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedir(id: string) {
    startTransition(async () => {
      try {
        await pedirEntradaGrupo(id)
        setGrupos((prev) =>
          prev.map((g) => (g.id === id ? { ...g, pedidoPendente: true } : g)),
        )
        toast.success('Pedido enviado — aguarde aprovação.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível pedir entrada.')
      }
    })
  }

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    startTransition(async () => {
      try {
        const { id } = await criarGrupo(nome.trim(), descricao.trim() || undefined, publica)
        setGrupos((prev) => [
          {
            id,
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            avatarUrl: null,
            codigoConvite: null,
            somenteAdminPublica: false,
            membros: 1,
            publica,
            souMembro: true,
            pedidoPendente: false,
            souAdmin: true,
            silenciada: false,
          },
          ...prev,
        ])
        setCriando(false)
        setNome('')
        setDescricao('')
        setPublica(true)
        toast.success('Grupo criado!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível criar o grupo.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <m.button
          type="button"
          onClick={() => setCriando((v) => !v)}
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Criar grupo
        </m.button>
      </div>

      <AnimatePresence>
        {criando && (
          <m.form
            key="criar-grupo"
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
              placeholder="Nome do grupo"
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
            <fieldset className="flex gap-2">
              <legend className="sr-only">Visibilidade</legend>
              <button
                type="button"
                onClick={() => setPublica(true)}
                className={[
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  publica
                    ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--foreground))]'
                    : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                <Globe className="h-4 w-4" />
                Público
              </button>
              <button
                type="button"
                onClick={() => setPublica(false)}
                className={[
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  !publica
                    ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--foreground))]'
                    : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                <Lock className="h-4 w-4" />
                Privado
              </button>
            </fieldset>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {publica
                ? 'Qualquer membro da torcida pode entrar na hora.'
                : 'Entrada só após aprovação de um admin do grupo.'}
            </p>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </button>
          </m.form>
        )}
      </AnimatePresence>

      {grupos.length === 0 ? (
        <MotionEmptyState
          className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
          title="Nenhum grupo ainda."
          description="Seja o primeiro a criar!"
        />
      ) : (
        <m.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {grupos.map((g) => (
            <m.div
              key={g.id}
              variants={staggerItem}
              layout
              className="card-soft flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                {g.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- lista compacta; URL Cloudinary
                  <img
                    src={g.avatarUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--primary)_/_0.12)] text-sm font-bold text-[rgb(var(--color-primary-fg))]">
                    {(g.nome ?? 'G').charAt(0).toUpperCase()}
                  </span>
                )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[rgb(var(--foreground))]">{g.nome ?? 'Grupo'}</p>
                  <span
                    className={[
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      g.publica
                        ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                        : 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]',
                    ].join(' ')}
                  >
                    {g.publica ? (
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
                {g.descricao && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                    {g.descricao}
                  </p>
                )}
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
                  <Users className="h-3.5 w-3.5" />
                  {g.membros} membro{g.membros === 1 ? '' : 's'}
                </span>
              </div>
              </div>
              {g.souMembro ? (
                <Link
                  href={`/portal/comunidade/grupos/${g.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Abrir grupo
                </Link>
              ) : g.pedidoPendente ? (
                <span className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]">
                  Pendente
                </span>
              ) : g.publica ? (
                <m.button
                  type="button"
                  disabled={pending}
                  onClick={() => entrar(g.id)}
                  whileTap={{ scale: 0.94 }}
                  transition={springSnappy}
                  className="shrink-0 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Entrar
                </m.button>
              ) : (
                <m.button
                  type="button"
                  disabled={pending}
                  onClick={() => pedir(g.id)}
                  whileTap={{ scale: 0.94 }}
                  transition={springSnappy}
                  className="shrink-0 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Pedir entrada
                </m.button>
              )}
            </m.div>
          ))}
        </m.div>
      )}
    </div>
  )
}
