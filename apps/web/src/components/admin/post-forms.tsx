'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  criarPost,
  atualizarPost,
  alternarFixado,
  excluirPost,
  type PostState,
} from '@/app/admin/comunidade/actions'
import { Pin, PinOff, Pencil, Trash2, MessageSquarePlus, X } from 'lucide-react'
import { FieldError, Input, Textarea, SubmitButton } from '@torcida/ui'
import { runPersistAction, useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { ImageUploadField } from '@/components/media/image-upload-field'

function PostFields({ state, initial }: { state: PostState; initial?: Post }) {
  const [imagemUrl, setImagemUrl] = useState(initial?.imagemUrl ?? '')

  return (
    <>
      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título (opcional)
        </label>
        <Input
          name="titulo"
          type="text"
          defaultValue={initial?.titulo ?? ''}
          placeholder="Ex: Nova parceria com o bar da esquina"
          maxLength={150}
        />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Conteúdo <span className="text-red-500">*</span>
        </label>
        <Textarea
          name="conteudo"
          defaultValue={initial?.conteudo ?? ''}
          required
          maxLength={4000}
          rows={4}
          placeholder="O que você quer avisar pra torcida?"
        />
        <FieldError errors={state.errors?.conteudo} />
      </div>

      <ImageUploadField
        name="imagemUrl"
        label="Imagem (opcional)"
        value={imagemUrl}
        onChange={setImagemUrl}
        aspect={16 / 9}
        purpose="comunidade"
        fieldErrors={state.errors?.imagemUrl}
        buttonLabel="Enviar imagem"
      />
    </>
  )
}

/* ── Criar ─────────────────────────────────────────────────────────────────── */
export function CriarPostForm() {
  const [state, action, pending] = useActionState<PostState, FormData>(criarPost, {})
  const [key, setKey] = useState(0)
  const { formRef, markPristine } = useTrackedForm({
    id: `criar-post-${key}`,
    title: 'Novo post',
  })
  useActionStateToast(state, pending, 'Post publicado.', {
    onSuccess: () => {
      markPristine()
      setKey((k) => k + 1)
    },
  })

  return (
    <form
      key={key}
      ref={formRef}
      action={action}
      className="space-y-4"
    >
      <PostFields state={state} />
      <SubmitButton label="Publicar" icon={<MessageSquarePlus className="h-4 w-4" />} />
    </form>
  )
}

/* ── Editar ────────────────────────────────────────────────────────────────── */
export interface Post {
  id: string
  titulo: string | null
  conteudo: string
  imagemUrl: string | null
  fixado: boolean
  criadoEm: Date | string
}

function EditarPostForm({ post, onCancel }: { post: Post; onCancel: () => void }) {
  const boundAction = atualizarPost.bind(null, post.id)
  const [state, action, pending] = useActionState<PostState, FormData>(boundAction, {})
  const { formRef, markPristine } = useTrackedForm({
    id: `editar-post-${post.id}`,
    title: 'Editar post',
  })
  const { confirmDiscard } = useUnsavedChangesContext()
  useActionStateToast(state, pending, 'Post atualizado.', {
    onSuccess: () => {
      markPristine()
      onCancel()
    },
  })

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-4"
    >
      <PostFields state={state} initial={post} />
      <div className="flex gap-2">
        <SubmitButton label="Salvar" icon={<MessageSquarePlus className="h-4 w-4" />} />
        <button
          type="button"
          onClick={() => {
            void confirmDiscard().then((ok) => {
              if (ok) onCancel()
            })
          }}
          className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
      </div>
    </form>
  )
}

/* ── Lista ─────────────────────────────────────────────────────────────────── */
function formatarData(data: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export function PostsManager({ posts }: { posts: Post[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()

  const fixados = posts.filter((p) => p.fixado)
  const outros = posts.filter((p) => !p.fixado)
  const ordenados = [...fixados, ...outros]

  if (ordenados.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Nenhum post publicado ainda.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {ordenados.map((post) =>
        editandoId === post.id ? (
          <div key={post.id} className="rounded-xl border border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--surface))] p-4">
            <EditarPostForm post={post} onCancel={() => setEditandoId(null)} />
          </div>
        ) : (
          <div
            key={post.id}
            className={[
              'rounded-xl border p-4',
              post.fixado
                ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.04)]'
                : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {post.fixado && (
                    <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
                      <Pin className="h-3 w-3" /> Fixado
                    </span>
                  )}
                  {post.titulo && (
                    <h3 className="font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground-muted))]">
                  {post.conteudo}
                </p>
                {post.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.imagemUrl}
                    alt=""
                    className="mt-2 max-h-40 rounded-lg border border-[rgb(var(--border))] object-cover"
                  />
                )}
                <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                  {formatarData(post.criadoEm)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await runPersistAction(() => alternarFixado(post.id), {
                        success: post.fixado ? 'Post desafixado.' : 'Post fixado no topo.',
                      })
                    })
                  }
                  disabled={pending}
                  title={post.fixado ? 'Desafixar' : 'Fixar no topo'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  {post.fixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setEditandoId(post.id)}
                  disabled={pending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    void confirmAction({
                      titulo: 'Excluir este post?',
                      descricao: 'O post será removido permanentemente.',
                      labelConfirmar: 'Excluir',
                      variante: 'destructive',
                      cancelled: 'Exclusão cancelada.',
                      run: () => excluirPost(post.id),
                      success: 'Post excluído.',
                    })
                  }}
                  disabled={pending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  )
}
