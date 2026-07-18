'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { MessageCircle, Users, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPostCanal, entrarCanal } from '@/app/portal/comunidade/actions'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { labelVisibilidadeCanal, linkUnidadeComunidade, type CanalItem } from '@/lib/canais-shared'
import { springSnappy } from '@/lib/motion-presets'
import type { PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface CanalDetalheClientProps {
  canal: CanalItem
  posts: PostSocialItem[]
  salvoIds: string[]
  currentUser: CurrentUser
  podePublicar: boolean
}

export function CanalDetalheClient({
  canal,
  posts,
  salvoIds,
  currentUser,
  podePublicar,
}: CanalDetalheClientProps) {
  const [conteudo, setConteudo] = useState('')
  const [pending, startTransition] = useTransition()

  function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) return
    startTransition(async () => {
      const result = await publicarPostCanal(canal.id, conteudo.trim())
      if (!result.success) {
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      setConteudo('')
      toast.success('Publicado!')
      window.location.reload()
    })
  }

  function inscrever() {
    startTransition(async () => {
      try {
        await entrarCanal(canal.id)
        toast.success('Inscrito no canal!')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao inscrever.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <m.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[rgb(var(--color-primary-fg))]">
              {canal.canalOficial ? 'Canal oficial' : 'Comunidade temática'}
            </span>
            <h1 className="mt-1.5 text-xl font-bold text-[rgb(var(--foreground))]">{canal.nome ?? 'Canal'}</h1>
            {canal.descricao && (
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{canal.descricao}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {canal.membros} inscrito{canal.membros === 1 ? '' : 's'}
              </span>
              <span>{canal.tenantNome}</span>
              <span>{labelVisibilidadeCanal(canal.visibilidadeCanal)}</span>
              {canal.somenteAdminPublica && <span>Só admins publicam</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {canal.canalOficial && (
              <Link
                href={linkUnidadeComunidade(canal.tenantId)}
                className="text-center text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Perfil da unidade
              </Link>
            )}
            {canal.souMembro ? (
              <Link
                href={`/portal/mensagens?c=${canal.id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <MessageCircle className="h-4 w-4" />
                Chat
              </Link>
            ) : (
              <m.button
                type="button"
                disabled={pending}
                onClick={inscrever}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="rounded-full bg-[rgb(var(--color-primary))] px-4 py-1.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Inscrever
              </m.button>
            )}
          </div>
        </div>
      </m.header>

      {canal.souMembro && podePublicar && (
        <form
          onSubmit={publicar}
          className="card-soft space-y-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            maxLength={3000}
            rows={3}
            placeholder="Publicar no canal…"
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
      )}

      {!canal.souMembro && (
        <MotionEmptyState
          className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
          title="Inscreva-se no canal"
          description="Para ver o mural completo e participar do chat."
        />
      )}

      {canal.souMembro && (
        <ComunidadePostsAnimated
          posts={posts}
          currentUser={currentUser}
          salvoIds={salvoIds}
          showTenantBadge
          emptyTitle="Nenhuma publicação no canal ainda."
        />
      )}
    </div>
  )
}
