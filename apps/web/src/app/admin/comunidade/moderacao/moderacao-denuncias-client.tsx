'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { useConfirmAction } from '@/lib/confirm-action'

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

export interface ModeracaoDenunciaItem {
  id: string
  alvoLabel: string
  categoriaLabel: string
  gravidade: string
  criadoEmLabel: string
  prazoLabel: string | null
  slaVencido: boolean
  escalado: boolean
  motivo: string | null
  trecho: string
  autorNome: string
  denunciante: string
  ocultado: boolean
  linkAlvo: string | null
  /**
   * Superfície sem ocultação (comunicado, evento, perfil, grupo/canal,
   * vitrine): a decisão só registra e escala — não há o que esconder.
   */
  soEscalonamento: boolean
  /** Só na fila da plataforma: de qual torcida veio (ou praça nacional). */
  origemLabel?: string | null
}

const GRAVIDADE_CLASS: Record<string, string> = {
  S4: 'bg-red-600 text-white',
  S3: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  S2: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  S1: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  S0: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
}

interface ModeracaoDenunciasClientProps {
  denunciasPosts: DenunciaPostItem[]
  denunciasMensagens: DenunciaMensagemItem[]
  podeModerarPosts: boolean
  podeModerarMensagens: boolean
  /** Exibe a fila de posts mesmo sem poder moderar (oversight). */
  mostrarPosts?: boolean
  /** Fila do fórum/praça — a única superfície cross-tenant. */
  denunciasForum?: ModeracaoDenunciaItem[]
  mostrarForum?: boolean
  podeModerarForum?: boolean
  onResolverForum?: (id: string) => Promise<void>
  onDescartarForum?: (id: string) => Promise<void>
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
  mostrarPosts = podeModerarPosts,
  denunciasForum: forumIniciais = [],
  mostrarForum = false,
  podeModerarForum = false,
  onResolverForum,
  onDescartarForum,
  onResolverPost,
  onDescartarPost,
  onResolverMensagem,
  onDescartarMensagem,
}: ModeracaoDenunciasClientProps) {
  const [posts, setPosts] = useState(postsIniciais)
  const [mensagens, setMensagens] = useState(mensagensIniciais)
  const [forum, setForum] = useState(forumIniciais)
  const confirmAction = useConfirmAction()

  function resolverPost(id: string) {
    void confirmAction({
      titulo: 'Resolver e ocultar o post?',
      descricao: 'O post deixa de aparecer no feed. A denúncia é marcada como resolvida.',
      labelConfirmar: 'Ocultar post',
      variante: 'destructive',
      cancelled: false,
      run: () => onResolverPost(id),
      success: 'Denúncia resolvida. Post ocultado.',
    }).then((ok) => {
      if (ok) setPosts((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function descartarPost(id: string) {
    void confirmAction({
      titulo: 'Descartar esta denúncia?',
      descricao: 'O post permanece visível. A denúncia sai da fila.',
      labelConfirmar: 'Descartar',
      cancelled: false,
      run: () => onDescartarPost(id),
      success: 'Denúncia de post descartada.',
    }).then((ok) => {
      if (ok) setPosts((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function resolverMensagem(id: string) {
    void confirmAction({
      titulo: 'Resolver denúncia de mensagem?',
      descricao: 'A mensagem será tratada conforme a moderação.',
      labelConfirmar: 'Resolver',
      variante: 'destructive',
      cancelled: false,
      run: () => onResolverMensagem(id),
      success: 'Denúncia resolvida. Mensagem tratada.',
    }).then((ok) => {
      if (ok) setMensagens((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function descartarMensagem(id: string) {
    void confirmAction({
      titulo: 'Descartar esta denúncia?',
      descricao: 'A mensagem permanece. A denúncia sai da fila.',
      labelConfirmar: 'Descartar',
      cancelled: false,
      run: () => onDescartarMensagem(id),
      success: 'Denúncia de mensagem descartada.',
    }).then((ok) => {
      if (ok) setMensagens((prev) => prev.filter((d) => d.id !== id))
    })
  }

  function resolverForum(item: ModeracaoDenunciaItem) {
    if (!onResolverForum) return
    void confirmAction(
      item.soEscalonamento
        ? {
            titulo: 'Encaminhar para a plataforma?',
            descricao:
              'Esta superfície não tem como ser ocultada. A decisão fica registrada e o caso sobe para a plataforma decidir.',
            labelConfirmar: 'Encaminhar',
            cancelled: false,
            run: () => onResolverForum(item.id),
            success: 'Decisão registrada. Caso encaminhado à plataforma.',
          }
        : {
            titulo: 'Resolver e ocultar o conteúdo?',
            descricao: 'O conteúdo some do fórum. A denúncia é marcada como resolvida.',
            labelConfirmar: 'Ocultar conteúdo',
            variante: 'destructive',
            cancelled: false,
            run: () => onResolverForum(item.id),
            success: 'Denúncia resolvida. Conteúdo ocultado.',
          },
    ).then((ok) => {
      if (ok) setForum((prev) => prev.filter((d) => d.id !== item.id))
    })
  }

  function descartarForum(item: ModeracaoDenunciaItem) {
    if (!onDescartarForum) return
    void confirmAction({
      titulo: 'Descartar esta denúncia?',
      descricao: 'O conteúdo permanece publicado. A denúncia sai da fila.',
      labelConfirmar: 'Descartar',
      cancelled: false,
      run: () => onDescartarForum(item.id),
      success: 'Denúncia do fórum descartada.',
    }).then((ok) => {
      if (ok) setForum((prev) => prev.filter((d) => d.id !== item.id))
    })
  }

  return (
    <div className="space-y-6">
      {mostrarForum && (
        <section className="space-y-3">
          {forum.length === 0 ? (
            <MotionEmptyState
              className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
              title="Nenhuma denúncia do fórum pendente no momento."
            />
          ) : (
            <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
              <AnimatePresence mode="popLayout">
                {forum.map((denuncia) => (
                  <m.div
                    key={denuncia.id}
                    layout
                    variants={staggerItem}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                    className={[
                      'rounded-xl border bg-[rgb(var(--surface))] p-4',
                      denuncia.escalado || denuncia.slaVencido
                        ? 'border-red-500/40'
                        : 'border-[rgb(var(--border))]',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-[11px] font-bold',
                          GRAVIDADE_CLASS[denuncia.gravidade] ?? GRAVIDADE_CLASS.S1,
                        ].join(' ')}
                      >
                        {denuncia.gravidade}
                      </span>
                      <span className="text-sm font-semibold text-[rgb(var(--foreground))]">
                        {denuncia.categoriaLabel}
                      </span>
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        {denuncia.alvoLabel}
                      </span>
                      {denuncia.escalado && (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Em análise da plataforma
                        </span>
                      )}
                      {denuncia.slaVencido && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          Prazo vencido
                        </span>
                      )}
                      {denuncia.ocultado && (
                        <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                          Já oculto
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-3">
                        {denuncia.linkAlvo && (
                          <Link
                            href={denuncia.linkAlvo}
                            target="_blank"
                            className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                          >
                            Ver no fórum
                          </Link>
                        )}
                        <span className="text-xs text-[rgb(var(--foreground-muted))]">
                          {denuncia.criadoEmLabel}
                        </span>
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--foreground-muted))]">
                      {denuncia.trecho}
                    </p>

                    <div className="mt-3 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm">
                      {denuncia.motivo && (
                        <p className="text-[rgb(var(--foreground-muted))]">{denuncia.motivo}</p>
                      )}
                      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                        Autor: {denuncia.autorNome} · Denunciante: {denuncia.denunciante}
                        {denuncia.origemLabel ? ' · ' + denuncia.origemLabel : ''}
                      </p>
                      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                        {denuncia.prazoLabel
                          ? 'Prazo de análise: ' + denuncia.prazoLabel
                          : 'Sem prazo definido para esta gravidade.'}
                      </p>
                    </div>

                    {denuncia.escalado ? (
                      <p className="mt-3 text-xs font-medium text-red-700 dark:text-red-300">
                        Caso crítico: a decisão é da plataforma. A fila do tenant não encerra.
                      </p>
                    ) : podeModerarForum ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {denuncia.soEscalonamento && (
                          <p className="w-full text-xs text-[rgb(var(--foreground-muted))]">
                            Esta superfície não tem ocultação: a decisão fica registrada e o caso
                            sobe para a plataforma.
                          </p>
                        )}
                        <m.button
                          type="button"
                          onClick={() => resolverForum(denuncia)}
                          whileTap={{ scale: 0.96 }}
                          transition={springSnappy}
                          className={[
                            'app-action rounded-lg px-3 text-sm font-medium transition-opacity hover:opacity-90',
                            denuncia.soEscalonamento
                              ? 'border border-[rgb(var(--border))] text-[rgb(var(--foreground))]'
                              : 'bg-red-600 text-white',
                          ].join(' ')}
                        >
                          {denuncia.soEscalonamento
                            ? 'Registrar e encaminhar'
                            : 'Resolver e ocultar'}
                        </m.button>
                        <m.button
                          type="button"
                          onClick={() => descartarForum(denuncia)}
                          whileTap={{ scale: 0.96 }}
                          transition={springSnappy}
                          className="app-action rounded-lg border border-[rgb(var(--border))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                        >
                          Descartar denúncia
                        </m.button>
                      </div>
                    ) : null}
                  </m.div>
                ))}
              </AnimatePresence>
            </m.div>
          )}
        </section>
      )}

      {mostrarPosts && (
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
                          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
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
                    {podeModerarPosts ? (
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
                    ) : null}
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
