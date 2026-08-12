'use client'

import { useState, useTransition } from 'react'
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
  Settings,
  Inbox,
  UserMinus,
  Link2,
  Copy,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { useConfirmAction } from '@/lib/confirm-action'
import {
  publicarPostGrupo,
  entrarGrupoPublico,
  pedirEntradaGrupo,
  sairGrupo,
  alternarSilencioGrupo,
  decidirPedidoGrupo,
  atualizarGrupo,
  alterarPapelGrupo,
  removerMembroGrupo,
  gerarCodigoConviteGrupo,
  revogarCodigoConviteGrupo,
} from '@/app/portal/comunidade/actions'
import { ComunidadeTabBar } from '../../_components/comunidade-tab-bar'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { Avatar } from '@/components/portal/avatar'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { springSnappy } from '@/lib/motion-presets'
import { previewParaPostSocial } from '@/lib/feed-live-refresh'
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

interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

interface GrupoDetalheClientProps {
  grupo: GrupoDetalheItem
  posts: PostSocialItem[]
  pageInfo: PageInfo
  salvoIds: string[]
  currentUser: CurrentUser
  /** null = aba ainda não carregada no servidor */
  pedidos: MembroGrupoPendenteItem[] | null
  membros: MembroGrupoItem[] | null
  tabInicial?: GrupoAba
}

export function GrupoDetalheClient({
  grupo: grupoInicial,
  posts: postsIniciais,
  pageInfo: pageInfoInicial,
  salvoIds: salvoIdsIniciais,
  currentUser,
  pedidos: pedidosIniciais,
  membros: membrosIniciais,
  tabInicial = 'mural',
}: GrupoDetalheClientProps) {
  const router = useRouter()
  const [grupo, setGrupo] = useState(grupoInicial)
  const [pedidos, setPedidos] = useState(pedidosIniciais)
  const [membros, setMembros] = useState(membrosIniciais)
  const [aba, setAba] = useState<GrupoAba>(tabInicial)
  const [posts, setPosts] = useState(postsIniciais)
  const [pageInfo, setPageInfo] = useState(pageInfoInicial)
  const [salvoIds] = useState(salvoIdsIniciais)
  const [conteudo, setConteudo] = useState('')
  const [nomeEdit, setNomeEdit] = useState(grupoInicial.nome ?? '')
  const [descEdit, setDescEdit] = useState(grupoInicial.descricao ?? '')
  const [publicaEdit, setPublicaEdit] = useState(grupoInicial.publica)
  const [codigoConvite, setCodigoConvite] = useState(grupoInicial.codigoConvite)
  const [somenteAdminEdit, setSomenteAdminEdit] = useState(grupoInicial.somenteAdminPublica)
  const [pendingMembership, startMembership] = useTransition()
  const [pendingPedidos, startPedidos] = useTransition()
  const [pendingMembros, startMembros] = useTransition()
  const [pendingConfig, startConfig] = useTransition()
  const [publicando, startPublicar] = useTransition()
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [buscaMembros, setBuscaMembros] = useState('')
  const confirmAction = useConfirmAction()
  const [removendoFoto, setRemovendoFoto] = useState(false)
  const crop = useCroppedImageUpload({
    aspect: 1,
    purpose: 'comunidade',
    title: 'Ajustar foto do grupo',
    onDone: async ({ url }) => {
      if (!url) return
      await atualizarGrupo({
        conversaId: grupo.id,
        nome: (grupo.nome ?? nomeEdit).trim() || 'Grupo',
        descricao: grupo.descricao,
        publica: grupo.publica,
        avatarUrl: url,
      })
      setGrupo((g) => ({ ...g, avatarUrl: url }))
      toast.success('Foto do grupo atualizada.')
    },
  })
  const uploadingFoto = crop.busy || removendoFoto

  function irParaAba(id: GrupoAba) {
    setAba(id)
    const url = new URL(window.location.href)
    if (id === 'mural') url.searchParams.delete('tab')
    else url.searchParams.set('tab', id)
    router.replace(url.pathname + url.search, { scroll: false })
  }

  function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) return
    const texto = conteudo.trim()
    setConteudo('')
    startPublicar(async () => {
      const result = await publicarPostGrupo(grupo.id, texto)
      if (!result.success) {
        setConteudo(texto)
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      if (result.preview) {
        const novo = previewParaPostSocial(result.preview)
        setPosts((prev) => [novo, ...prev.filter((p) => p.id !== novo.id)])
      }
      toast.success('Publicado no mural!')
    })
  }

  async function carregarMais() {
    if (!pageInfo.nextCursor || carregandoMais) return
    setCarregandoMais(true)
    try {
      const url = new URL(
        `/api/comunidade/grupos/${grupo.id}/posts`,
        window.location.origin,
      )
      url.searchParams.set('cursor', pageInfo.nextCursor)
      url.searchParams.set('take', '20')
      const res = await fetch(url.toString(), { credentials: 'include' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Erro ao carregar mais posts.')
      }
      const data = (await res.json()) as {
        posts: PostSocialItem[]
        pageInfo: PageInfo
      }
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...data.posts.filter((p) => !seen.has(p.id))]
      })
      setPageInfo(data.pageInfo)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível carregar mais.')
    } finally {
      setCarregandoMais(false)
    }
  }

  function entrar() {
    startMembership(async () => {
      try {
        await entrarGrupoPublico(grupo.id)
        toast.success('Você entrou no grupo!')
        router.replace(`/portal/comunidade/grupos/${grupo.id}`)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedir() {
    startMembership(async () => {
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
    startMembership(async () => {
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
    startMembership(async () => {
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
    setBusyUserId(userId)
    startPedidos(async () => {
      try {
        await decidirPedidoGrupo(grupo.id, userId, aprovar)
        const pedido = (pedidos ?? []).find((p) => p.userId === userId)
        setPedidos((prev) => (prev ?? []).filter((p) => p.userId !== userId))
        if (aprovar && pedido) {
          setGrupo((g) => ({ ...g, membros: g.membros + 1 }))
          setMembros((prev) => [
            ...(prev ?? []),
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível decidir.')
      } finally {
        setBusyUserId(null)
      }
    })
  }

  function removerMembro(userId: string) {
    void confirmAction({
      titulo: 'Remover este membro do grupo?',
      descricao: 'A pessoa sai do grupo e perde acesso ao mural e ao chat. Pode pedir entrada de novo depois.',
      labelConfirmar: 'Remover',
      variante: 'destructive',
      cancelled: 'Remoção cancelada.',
      run: async () => {
        await removerMembroGrupo(grupo.id, userId)
        setMembros((prev) => (prev ?? []).filter((m) => m.userId !== userId))
        setGrupo((g) => ({ ...g, membros: Math.max(0, g.membros - 1) }))
      },
      success: 'Membro removido.',
    })
  }

  function alterarPapel(userId: string, papel: 'ADMIN' | 'MEMBRO') {
    setBusyUserId(userId)
    startMembros(async () => {
      try {
        await alterarPapelGrupo(grupo.id, userId, papel)
        setMembros((prev) =>
          (prev ?? []).map((m) => (m.userId === userId ? { ...m, papel } : m)),
        )
        if (userId === currentUser.id) {
          setGrupo((g) => ({ ...g, souAdmin: papel === 'ADMIN' }))
          if (papel === 'MEMBRO') irParaAba('membros')
        }
        toast.success(papel === 'ADMIN' ? 'Administrador adicionado.' : 'Admin removido.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível alterar.')
      } finally {
        setBusyUserId(null)
      }
    })
  }

  function gerarConvite() {
    startConfig(async () => {
      try {
        const { codigo } = await gerarCodigoConviteGrupo(grupo.id)
        setCodigoConvite(codigo)
        setGrupo((g) => ({ ...g, codigoConvite: codigo }))
        toast.success('Link de convite gerado.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível gerar.')
      }
    })
  }

  function revogarConvite() {
    void confirmAction({
      titulo: 'Revogar o link atual?',
      descricao: 'Quem tiver o link antigo não poderá mais entrar. Você pode gerar um novo depois.',
      labelConfirmar: 'Revogar',
      variante: 'destructive',
      cancelled: 'Revogação cancelada.',
      run: async () => {
        await revogarCodigoConviteGrupo(grupo.id)
        setCodigoConvite(null)
        setGrupo((g) => ({ ...g, codigoConvite: null }))
      },
      success: 'Convite revogado.',
    })
  }

  async function copiarConvite() {
    if (!codigoConvite) return
    const url = window.location.origin + '/portal/comunidade/grupos/convite/' + codigoConvite
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado.')
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  function salvarConfig(e: React.FormEvent) {
    e.preventDefault()
    startConfig(async () => {
      try {
        await atualizarGrupo({
          conversaId: grupo.id,
          nome: nomeEdit.trim(),
          descricao: descEdit.trim() || null,
          publica: publicaEdit,
          somenteAdminPublica: somenteAdminEdit,
        })
        setGrupo((g) => ({
          ...g,
          nome: nomeEdit.trim(),
          descricao: descEdit.trim() || null,
          publica: publicaEdit,
          somenteAdminPublica: somenteAdminEdit,
        }))
        toast.success('Configurações salvas.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
      }
    })
  }

  function onFotoChange(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.')
      return
    }
    crop.open(file)
  }

  async function removerFoto() {
    setRemovendoFoto(true)
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível remover.')
    } finally {
      setRemovendoFoto(false)
    }
  }

  const pedidosCount = pedidos?.length ?? 0
  const qMembros = buscaMembros.trim().toLowerCase()
  const membrosFiltrados =
    membros === null
      ? null
      : qMembros
        ? membros.filter((m) => {
            const hay = [m.nome, m.nickname].filter(Boolean).join(' ').toLowerCase()
            return hay.includes(qMembros)
          })
        : membros
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
          label: `Membros (${grupo.membros})`,
        },
        ...(grupo.souAdmin
          ? [
              {
                kind: 'button' as const,
                id: 'pedidos',
                label: pedidosCount > 0 ? `Pedidos (${pedidosCount})` : 'Pedidos',
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
    <>
      {crop.dialog}
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
              disabled={pendingMembership}
              onClick={entrar}
              className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Entrar
            </button>
          )}
          {!grupo.souMembro && !grupo.pedidoPendente && !grupo.publica && (
            <button
              type="button"
              disabled={pendingMembership}
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
                disabled={pendingMembership}
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
                disabled={pendingMembership}
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
          irParaAba(id as GrupoAba)
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
            {membros === null ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-[rgb(var(--foreground-muted))]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando membros…
              </div>
            ) : membros.length === 0 ? (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum membro ativo.</p>
            ) : (
              <div className="space-y-3">
                {membros.length > 8 && (
                  <div className="relative">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]"
                    />
                    <input
                      type="search"
                      value={buscaMembros}
                      onChange={(e) => setBuscaMembros(e.target.value)}
                      placeholder="Buscar membro por nome ou @"
                      aria-label="Buscar membros"
                      className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--primary))]"
                    />
                  </div>
                )}
                {membrosFiltrados !== null && membrosFiltrados.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
                    Nenhum membro com “{buscaMembros.trim()}”.
                  </p>
                ) : (
                  <ul className="divide-y divide-[rgb(var(--border))]">
                    {(membrosFiltrados ?? []).map((membro) => (
                      <li key={membro.userId} className="flex items-center gap-2 py-2.5">
                        <Link
                          href={`/portal/comunidade/perfil/${membro.userId}`}
                          className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-90"
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
                        {grupo.souAdmin && membro.userId !== currentUser.id && (
                          <button
                            type="button"
                            disabled={pendingMembros && busyUserId === membro.userId}
                            title="Remover do grupo"
                            onClick={() => removerMembro(membro.userId)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            Remover
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
            {pedidos === null ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pedidos…
              </div>
            ) : pedidos.length === 0 ? (
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
                        disabled={pendingPedidos && busyUserId === p.userId}
                        onClick={() => decidir(p.userId, true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={pendingPedidos && busyUserId === p.userId}
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

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <GrupoAvatar nome={grupo.nome} avatarUrl={grupo.avatarUrl} size="xl" />
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  Foto atual do grupo — troque abaixo.
                </p>
              </div>
              <ImageDropZone
                label="Foto do grupo"
                busy={uploadingFoto || pendingConfig}
                formatsHint="JPEG, PNG ou WebP — ajuste 1:1 antes do envio"
                file={
                  grupo.avatarUrl
                    ? {
                        name: 'foto-grupo.jpg',
                        status: uploadingFoto ? 'uploading' : 'done',
                        previewUrl: grupo.avatarUrl,
                      }
                    : null
                }
                onClear={grupo.avatarUrl ? () => void removerFoto() : undefined}
                onFile={onFotoChange}
              />
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

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3">
              <input
                type="checkbox"
                checked={somenteAdminEdit}
                onChange={(e) => setSomenteAdminEdit(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">
                  Só administradores publicam no mural
                </span>
                <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                  Membros comuns só leem e comentam.
                </span>
              </span>
            </label>

              <button
                type="submit"
                disabled={pendingConfig || nomeEdit.trim().length < 3}
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
              >
                {pendingConfig && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar alterações
              </button>
            </form>

            <div className="space-y-3 border-t border-[rgb(var(--border))] pt-5">
              <div className="flex items-start gap-2">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                <div>
                  <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Link de convite</h3>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    Quem tiver o link entra direto — inclusive em grupos privados.
                  </p>
                </div>
              </div>
              {codigoConvite ? (
                <div className="space-y-2">
                  <p className="break-all rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 font-mono text-xs">
                    /portal/comunidade/grupos/convite/{codigoConvite}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={pendingConfig} onClick={() => void copiarConvite()} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50">
                      <Copy className="h-4 w-4" /> Copiar
                    </button>
                    <button type="button" disabled={pendingConfig} onClick={gerarConvite} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50">
                      <RefreshCw className="h-4 w-4" /> Regenerar
                    </button>
                    <button type="button" disabled={pendingConfig} onClick={revogarConvite} className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50">
                      Revogar
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={pendingConfig} onClick={gerarConvite} className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                  <Link2 className="h-4 w-4" /> Gerar link de convite
                </button>
              )}
            </div>

            <div className="space-y-3 border-t border-[rgb(var(--border))] pt-5">
              <div>
                <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Administradores</h3>
                <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                  Admins aprovam pedidos, editam o grupo e podem promover outros membros.
                </p>
              </div>
              <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
                {(membros ?? []).map((membro) => {
                  const admins = (membros ?? []).filter((m) => m.papel === 'ADMIN').length
                  const podeRebaixar = membro.papel === 'ADMIN' && admins > 1
                  const rowBusy = pendingMembros && busyUserId === membro.userId
                  return (
                    <li key={membro.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {membro.nome ?? membro.nickname ?? 'Membro'}
                            {membro.userId === currentUser.id ? ' (você)' : ''}
                          </p>
                          {membro.papel === 'ADMIN' && (
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">Admin</p>
                          )}
                        </div>
                      </div>
                      {membro.papel === 'MEMBRO' ? (
                        <button type="button" disabled={rowBusy} onClick={() => alterarPapel(membro.userId, 'ADMIN')} className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50">
                          Tornar admin
                        </button>
                      ) : podeRebaixar ? (
                        <button type="button" disabled={rowBusy} onClick={() => alterarPapel(membro.userId, 'MEMBRO')} className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50">
                          Remover admin
                        </button>
                      ) : (
                        <span className="shrink-0 text-[10px] text-[rgb(var(--foreground-muted))]">Único admin</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

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
            {(!grupo.somenteAdminPublica || grupo.souAdmin) ? (
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
                  disabled={publicando || !conteudo.trim()}
                  whileTap={{ scale: 0.96 }}
                  transition={springSnappy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {publicando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Publicar
                </m.button>
              </form>
            ) : (
              <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
                Só administradores podem publicar neste mural.
              </p>
            )}

            <ComunidadePostsAnimated
              posts={posts}
              currentUser={currentUser}
              salvoIds={salvoIds}
              podeModerarGrupo={grupo.souAdmin}
              emptyTitle="Nenhuma publicação no mural ainda."
              emptyDescription={
                grupo.somenteAdminPublica && !grupo.souAdmin
                  ? 'Aguarde uma publicação dos administradores.'
                  : 'Seja o primeiro a publicar!'
              }
            />

            {pageInfo.hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={carregandoMais}
                  onClick={() => void carregarMais()}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-50"
                >
                  {carregandoMais ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {carregandoMais ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
    </>
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
