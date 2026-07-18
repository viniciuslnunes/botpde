'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
  Camera,
  Settings,
  Inbox,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  publicarPostGrupo,
  entrarGrupoPublico,
  pedirEntradaGrupo,
  sairGrupo,
  alternarSilencioGrupo,
  decidirPedidoGrupo,
  atualizarGrupo,
} from '@/app/portal/comunidade/actions'
import { ComunidadeTabBar } from '../../_components/comunidade-tab-bar'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { Avatar } from '@/components/portal/avatar'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { springSnappy } from '@/lib/motion-presets'
import type {
  GrupoDetalheItem,
  MembroGrupoItem,
  MembroGrupoPendenteItem,
  PostSocialItem,
} from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

type GrupoAba = 'mural' | 'membros' | 'pedidos' | 'sobre' | 'config'

interface GrupoDetalheClientProps {
  grupo: GrupoDetalheItem
  posts: PostSocialItem[]
  salvoIds: string[]
  currentUser: CurrentUser
  pedidos: MembroGrupoPendenteItem[]
  membros: MembroGrupoItem[]
  tabInicial?: GrupoAba
}

export function GrupoDetalheClient({
  grupo: grupoInicial,
  posts: postsIniciais,
  salvoIds,
  currentUser,
  pedidos: pedidosIniciais,
  membros: membrosIniciais,
  tabInicial = 'mural',
}: GrupoDetalheClientProps) {
  const router = useRouter()
  const fotoRef = useRef<HTMLInputElement>(null)
  const [grupo, setGrupo] = useState(grupoInicial)
  const [pedidos, setPedidos] = useState(pedidosIniciais)
  const [membros, setMembros] = useState(membrosIniciais)
  const [aba, setAba] = useState<GrupoAba>(grupoInicial.souMembro ? tabInicial : 'sobre')
  const [conteudo, setConteudo] = useState('')
  const [nomeEdit, setNomeEdit] = useState(grupoInicial.nome ?? '')
  const [descEdit, setDescEdit] = useState(grupoInicial.descricao ?? '')
  const [publicaEdit, setPublicaEdit] = useState(grupoInicial.publica)
  const [uploadingFoto, setUploadingFoto] = useState(false)
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
        const pedido = pedidos.find((p) => p.userId === userId)
        setPedidos((prev) => prev.filter((p) => p.userId !== userId))
        if (aprovar && pedido) {
          setGrupo((g) => ({ ...g, membros: g.membros + 1 }))
          setMembros((prev) => [
            ...prev,
            {
              userId: pedido.userId,
              nome: pedido.nome,
              nickname: null,
              avatarUrl: pedido.avatarUrl,
              papel: 'MEMBRO',
              entrouEm: new Date(),
            },
          ])
        }
        toast.success(aprovar ? 'Pedido aprovado.' : 'Pedido recusado.')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível decidir.')
      }
    })
  }

  function salvarConfig(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await atualizarGrupo({
          conversaId: grupo.id,
          nome: nomeEdit.trim(),
          descricao: descEdit.trim() || null,
          publica: publicaEdit,
        })
        setGrupo((g) => ({
          ...g,
          nome: nomeEdit.trim(),
          descricao: descEdit.trim() || null,
          publica: publicaEdit,
        }))
        toast.success('Configurações salvas.')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
      }
    })
  }

  async function onFotoChange(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.')
      return
    }
    setUploadingFoto(true)
    try {
      const url = await uploadMediaToCloudinary(file, undefined, 'comunidade')
      await atualizarGrupo({
        conversaId: grupo.id,
        nome: (grupo.nome ?? nomeEdit).trim() || 'Grupo',
        descricao: grupo.descricao,
        publica: grupo.publica,
        avatarUrl: url,
      })
      setGrupo((g) => ({ ...g, avatarUrl: url }))
      toast.success('Foto do grupo atualizada.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload.')
    } finally {
      setUploadingFoto(false)
      if (fotoRef.current) fotoRef.current.value = ''
    }
  }

  async function removerFoto() {
    setUploadingFoto(true)
    try {
      await atualizarGrupo({
        conversaId: grupo.id,
        nome: (grupo.nome ?? nomeEdit).trim() || 'Grupo',
        descricao: grupo.descricao,
        publica: grupo.publica,
        avatarUrl: null,
      })
      setGrupo((g) => ({ ...g, avatarUrl: null }))
      toast.success('Foto removida.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível remover.')
    } finally {
      setUploadingFoto(false)
    }
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
          label: `Membros${membros.length > 0 ? ` (${membros.length})` : ''}`,
        },
        ...(grupo.souAdmin
          ? [
              {
                kind: 'button' as const,
                id: 'pedidos',
                label: pedidos.length > 0 ? `Pedidos (${pedidos.length})` : 'Pedidos',
              },
            ]
          : []),
        { kind: 'button' as const, id: 'sobre', label: 'Sobre' },
        ...(grupo.souAdmin
          ? [{ kind: 'button' as const, id: 'config', label: 'Configurações' }]
          : []),
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
          <GrupoAvatar nome={grupo.nome} avatarUrl={grupo.avatarUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance text-xl font-bold text-[rgb(var(--foreground))]">
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
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))] text-pretty">
                {grupo.descricao}
              </p>
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
          setAba(id as GrupoAba)
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
              <p className="text-[rgb(var(--foreground))] text-pretty">{grupo.descricao}</p>
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
            className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            {membros.length === 0 ? (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum membro ativo.</p>
            ) : (
              <ul className="divide-y divide-[rgb(var(--border))]">
                {membros.map((membro) => (
                  <li key={membro.userId}>
                    <Link
                      href={`/portal/comunidade/perfil/${membro.userId}`}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                          {membro.nome ?? membro.nickname ?? 'Membro'}
                        </p>
                        {membro.nickname && membro.nome && (
                          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                            @{membro.nickname}
                          </p>
                        )}
                      </div>
                      {membro.papel === 'ADMIN' && (
                        <span className="shrink-0 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                          Admin
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </m.div>
        )}

        {aba === 'pedidos' && grupo.souAdmin && (
          <m.div
            key="pedidos"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="card-soft space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Pedidos de entrada
              </h2>
            </div>
            {pedidos.length === 0 ? (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum pedido pendente. Em grupos privados, solicitações aparecem aqui.
              </p>
            ) : (
              <ul className="space-y-2">
                {pedidos.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] px-3 py-2"
                  >
                    <Link
                      href={`/portal/comunidade/perfil/${p.userId}`}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <Avatar nome={p.nome} avatarUrl={p.avatarUrl} size="sm" />
                      <span className="truncate text-sm font-medium">{p.nome ?? 'Membro'}</span>
                    </Link>
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
          </m.div>
        )}

        {aba === 'config' && grupo.souAdmin && (
          <m.div
            key="config"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="card-soft space-y-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Configurações do grupo
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <GrupoAvatar nome={grupo.nome} avatarUrl={grupo.avatarUrl} size="xl" />
              <div className="space-y-2">
                <p className="text-sm text-[rgb(var(--foreground-muted))]">Foto do grupo</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={uploadingFoto || pending}
                    onClick={() => fotoRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                  >
                    {uploadingFoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {grupo.avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
                  </button>
                  {grupo.avatarUrl && (
                    <button
                      type="button"
                      disabled={uploadingFoto || pending}
                      onClick={() => void removerFoto()}
                      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onFotoChange(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <form onSubmit={salvarConfig} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">Nome</span>
                <input
                  value={nomeEdit}
                  onChange={(e) => setNomeEdit(e.target.value)}
                  maxLength={80}
                  required
                  minLength={3}
                  className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm outline-none transition-colors focus:border-[rgb(var(--primary))]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">
                  Descrição
                </span>
                <textarea
                  value={descEdit}
                  onChange={(e) => setDescEdit(e.target.value)}
                  maxLength={280}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm outline-none transition-colors focus:border-[rgb(var(--primary))]"
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[rgb(var(--foreground))]">
                  Privacidade
                </legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3 has-[:checked]:border-[rgb(var(--primary))]">
                  <input
                    type="radio"
                    name="privacidade"
                    checked={publicaEdit}
                    onChange={() => setPublicaEdit(true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Globe className="h-3.5 w-3.5" /> Público
                    </span>
                    <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                      Qualquer membro da torcida entra na hora.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3 has-[:checked]:border-[rgb(var(--primary))]">
                  <input
                    type="radio"
                    name="privacidade"
                    checked={!publicaEdit}
                    onChange={() => setPublicaEdit(false)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Lock className="h-3.5 w-3.5" /> Privado
                    </span>
                    <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                      Entrada só com aprovação de um admin.
                    </span>
                  </span>
                </label>
              </fieldset>
              <button
                type="submit"
                disabled={pending || nomeEdit.trim().length < 3}
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar alterações
              </button>
            </form>
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

function GrupoAvatar({
  nome,
  avatarUrl,
  size,
}: {
  nome: string | null
  avatarUrl: string | null
  size: 'lg' | 'xl'
}) {
  const dim = size === 'xl' ? 'h-20 w-20' : 'h-12 w-12'
  const text = size === 'xl' ? 'text-2xl' : 'text-lg'
  const radius = size === 'xl' ? 'rounded-3xl' : 'rounded-2xl'

  if (avatarUrl) {
    return (
      <span className={`relative ${dim} shrink-0 overflow-hidden ${radius} bg-[rgb(var(--background-subtle))]`}>
        <Image src={avatarUrl} alt={nome ?? 'Grupo'} fill className="object-cover" sizes="80px" />
      </span>
    )
  }

  return (
    <span
      className={`flex ${dim} shrink-0 items-center justify-center ${radius} bg-[rgb(var(--primary)_/_0.12)] ${text} font-bold text-[rgb(var(--color-primary-fg))]`}
    >
      {(nome ?? 'G').charAt(0).toUpperCase()}
    </span>
  )
}
