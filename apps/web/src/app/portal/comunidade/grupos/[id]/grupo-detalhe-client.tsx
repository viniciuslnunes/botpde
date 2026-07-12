'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { MessageCircle, Users, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPostGrupo } from '@/app/portal/comunidade/actions'
import { ComunidadeTabBar } from '../../_components/comunidade-tab-bar'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { springSnappy } from '@/lib/motion-presets'
import type { GrupoDetalheItem, PostSocialItem } from '@/lib/feed'

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
}

export function GrupoDetalheClient({
  grupo,
  posts: postsIniciais,
  salvoIds,
  currentUser,
}: GrupoDetalheClientProps) {
  const [aba, setAba] = useState<'mural' | 'chat'>('mural')
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
      window.location.reload()
    })
  }

  return (
    <div className="space-y-4">
      <m.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        className="card-soft flex items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--primary)_/_0.12)] text-lg font-bold text-[rgb(var(--primary))]">
          {(grupo.nome ?? 'G').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{grupo.nome ?? 'Grupo'}</h1>
          {grupo.descricao && (
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{grupo.descricao}</p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
            <Users className="h-3.5 w-3.5" />
            {grupo.membros} membro{grupo.membros === 1 ? '' : 's'}
          </span>
        </div>
      </m.header>

      <ComunidadeTabBar
        layoutId="grupo-tab-indicator"
        activeId={aba}
        onTabChange={(id) => setAba(id as 'mural' | 'chat')}
        items={[
          { kind: 'button', id: 'mural', label: 'Mural' },
          {
            kind: 'link',
            id: 'chat',
            label: 'Chat',
            href: `/portal/mensagens?c=${grupo.id}`,
            icon: <MessageCircle className="h-4 w-4" />,
          },
        ]}
      />

      <AnimatePresence mode="wait">
        {aba === 'mural' && (
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
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
