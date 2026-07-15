'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { runPersistAction } from '@/lib/toast-action'

export interface DenunciaPostItem {
  id: string
  motivo: string
  criadoEmLabel: string
  postId: string
  postTitulo: string
  postConteudo: string
  denunciante: string
}

export interface DenunciaMensagemItem {
  id: string
  motivo: string
  criadoEmLabel: string
  autorNome: string
  conteudo: string
  removida: boolean
  denunciante: string
}

interface ModeracaoDenunciasClientProps {
  denunciasPosts: DenunciaPostItem[]
  denunciasMensagens: DenunciaMensagemItem[]
  podeModerarPosts: boolean
  podeModerarMensagens: boolean
  onResolverPost: (id: string) => Promise<void>
  onDescartarPost: (id: string) => Promise<void>
  onResolverMensagem: (id: string) => Promise<void>
  onDescartarMensagem: (id: string) => Promise<void>
}

export function ModeracaoDenunciasClient({
  denunciasPosts: postsIniciais,
  denunciasMensagens: mensagensIniciais,
  podeModerarPosts,
  podeModerarMensagens,
  onResolverPost,
  onDescartarPost,
  onResolverMensagem,
  onDescartarMensagem,
}: ModeracaoDenunciasClientProps) {
  const [posts, setPosts] = useState(postsIniciais)
  const [mensagens, setMensagens] = useState(mensagensIniciais)
  const [, startTransition] = useTransition()

  function resolverPost(id: string) {
    startTransition(async () => {
      const ok = await runPersistAction(() => onResolverPost(id), {
        success: 'Denúncia resolvida. Post ocultado.',
      })
      if (ok) setPosts((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function descartarPost(id: string) {
    startTransition(async () => {
      const ok = await runPersistAction(() => onDescartarPost(id), {
        success: 'Denúncia de post descartada.',
      })
      if (ok) setPosts((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function resolverMensagem(id: string) {
    startTransition(async () => {
      const ok = await runPersistAction(() => onResolverMensagem(id), {
        success: 'Denúncia resolvida. Mensagem tratada.',
      })
      if (ok) setMensagens((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function descartarMensagem(id: string) {
    startTransition(async () => {
      const ok = await runPersistAction(() => onDescartarMensagem(id), {
        success: 'Denúncia de mensagem descartada.',
      })
      if (ok) setMensagens((prev) => prev.filter((d) => d.id !== id))
    })
  }

  return (
    <div className="space-y-6">
      {podeModerarPosts && (
        <>
          {posts.length === 0 ? (
            <MotionEmptyState
              className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
              title="Nenhuma denúncia de post pendente no momento."
            />
          ) : (
            <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
              <AnimatePresence mode="popLayout">
                {posts.map((denuncia) => (
                  <m.div
                    key={denuncia.id}
                    layout
                    variants={staggerItem}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                    className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                        {denuncia.postTitulo}
                      </p>
                      <div className="flex items-center gap-3">
                        <Link
                          href={linkPostComunidade(denuncia.postId)}
                          className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
                          target="_blank"
                        >
                          Ver post
                        </Link>
                        <p className="text-xs text-[rgb(var(--foreground-muted))]">{denuncia.criadoEmLabel}</p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--foreground-muted))]">
                      {denuncia.postConteudo}
                    </p>
                    <div className="mt-3 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm">
                      <p className="font-medium text-[rgb(var(--foreground))]">Motivo da denúncia</p>
                      <p className="mt-1 text-[rgb(var(--foreground-muted))]">{denuncia.motivo}</p>
                      <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                        Denunciante: {denuncia.denunciante}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <m.button
                        type="button"
                        onClick={() => resolverPost(denuncia.id)}
                        whileTap={{ scale: 0.96 }}
                        transition={springSnappy}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      >
                        Resolver e ocultar post
                      </m.button>
                      <m.button
                        type="button"
                        onClick={() => descartarPost(denuncia.id)}
                        whileTap={{ scale: 0.96 }}
                        transition={springSnappy}
                        className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                      >
                        Descartar denúncia
                      </m.button>
                    </div>
                  </m.div>
                ))}
              </AnimatePresence>
            </m.div>
          )}
        </>
      )}

      {podeModerarMensagens && (
        <section className="space-y-3 pt-2">
          {mensagens.length === 0 ? (
            <MotionEmptyState
              className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
              title="Nenhuma denúncia de mensagem pendente no momento."
            />
          ) : (
            <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
              <AnimatePresence mode="popLayout">
                {mensagens.map((denuncia) => (
                  <m.div
                    key={denuncia.id}
                    layout
                    variants={staggerItem}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                    className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                        Mensagem de {denuncia.autorNome}
                        {denuncia.removida && ' (já removida)'}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">{denuncia.criadoEmLabel}</p>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--foreground-muted))]">
                      {denuncia.conteudo}
                    </p>
                    <div className="mt-3 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm">
                      <p className="font-medium text-[rgb(var(--foreground))]">Motivo da denúncia</p>
                      <p className="mt-1 text-[rgb(var(--foreground-muted))]">{denuncia.motivo}</p>
                      <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                        Denunciante: {denuncia.denunciante}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <m.button
                        type="button"
                        onClick={() => resolverMensagem(denuncia.id)}
                        whileTap={{ scale: 0.96 }}
                        transition={springSnappy}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      >
                        Resolver e remover mensagem
                      </m.button>
                      <m.button
                        type="button"
                        onClick={() => descartarMensagem(denuncia.id)}
                        whileTap={{ scale: 0.96 }}
                        transition={springSnappy}
                        className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                      >
                        Descartar denúncia
                      </m.button>
                    </div>
                  </m.div>
                ))}
              </AnimatePresence>
            </m.div>
          )}
        </section>
      )}
    </div>
  )
}
