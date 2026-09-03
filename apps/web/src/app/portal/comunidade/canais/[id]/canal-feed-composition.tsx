'use client'

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { Bell, BellOff, Check, Loader2, LogOut, MapPin, MessageCircle, MoreVertical, Save, Settings, Shield, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatNomeTorcida } from '@torcida/types'
import { CONFIRMA_VINCULO_UNIDADE, CONFIRMA_VINCULO_AO_PEDIR_CANAL, CONFIRMA_TROCA_UNIDADE, CONFIRMA_DESVINCULO_UNIDADE, mensagemTravaVinculoUnidade } from '@torcida/types/associe-se'
import {
  entrarCanal,
  pedirEntradaCanal,
  vincularUnidadePeloCanal,
  desvincularUnidadePeloCanal,
  sairCanal,
  alternarSilencioCanal,
  alterarAdminCanal,
  atualizarCanalTematico,
  decidirPedidoCanal,
  removerMembroCanal,
  adicionarMembroCanal,
  carregarPainelMembrosCanal,
  carregarPainelPedidosCanal,
} from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import { FloatingMenu } from '@/components/portal/floating-menu'
import { CanalNavbarOverride } from '@/components/canal-navbar-override'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { CanaisListLink } from '../canais-list-link'
import {
  labelCategoriaCanal,
  labelTipoUnidade,
  linkTorcidaComunidadePublica,
  type CandidatoMembroCanalItem,
  type CanalItem,
  type MembroCanalItem,
  type PedidoCanalItem,
  type VisibilidadeCanal,
} from '@/lib/canais-shared'
import { popoverPanel, springSnappy } from '@/lib/motion-presets'
import { nomesEquivalentes } from '@/lib/torcida-labels'
import { AppButton } from '@/components/ui/button'

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
  podeGerenciarAdmins: boolean
  /** Governança do canal (remover/adicionar membro) — independe de o canal ser aberto ou fechado. */
  podeGerenciarMembros: boolean
  /** Badge do menu — count SSR barato; listas completas só ao abrir o modal. */
  pedidosPendentesCount: number
  podeGerenciarPedidos: boolean
  /** Composer (mesmo `FeedComposer` do feed principal) — só quando `podePublicar`. */
  composer: ReactNode
  children: ReactNode
  /** Super-admin sem vínculo: mural em leitura, sem pedir entrada. */
  leituraOperador?: boolean
  /**
   * Chrome sticky de busca (shell da Comunidade). Quando presente, encaixa
   * logo abaixo do banner — mesma ordem do Nacional (banner → busca → mural).
   */
  buscaChrome?: ReactNode
}

export function CanalFeedComposition({
  canal,
  currentUser,
  podePublicar,
  corPrimaria,
  podeGerenciarAdmins,
  podeGerenciarMembros,
  pedidosPendentesCount,
  podeGerenciarPedidos,
  composer,
  children,
  leituraOperador = false,
  buscaChrome = null,
}: CanalFeedCompositionProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [gerenciarOpen, setGerenciarOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [pedidosOpen, setPedidosOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [silenciada, setSilenciada] = useState(canal.silenciada)
  const [souMembro, setSouMembro] = useState(canal.souMembro)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const verMural = souMembro || leituraOperador

  // Reconcilia com o servidor no render: o RSC revalida sem desmontar este
  // componente, e em effect os botões piscam no estado anterior.
  const [canalSincronizado, setCanalSincronizado] = useState({
    id: canal.id,
    silenciada: canal.silenciada,
    souMembro: canal.souMembro,
  })
  if (
    canal.id !== canalSincronizado.id ||
    canal.silenciada !== canalSincronizado.silenciada ||
    canal.souMembro !== canalSincronizado.souMembro
  ) {
    setCanalSincronizado({
      id: canal.id,
      silenciada: canal.silenciada,
      souMembro: canal.souMembro,
    })
    setSilenciada(canal.silenciada)
    setSouMembro(canal.souMembro)
  }

  function inscrever() {
    if (canal.podeVincularUnidade && window.confirm(CONFIRMA_VINCULO_AO_PEDIR_CANAL)) {
      vincularUnidade(true)
      return
    }
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
    if (canal.podeVincularUnidade && window.confirm(CONFIRMA_VINCULO_AO_PEDIR_CANAL)) {
      vincularUnidade(true)
      return
    }
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

  function vincularUnidade(jaConfirmado = false) {
    if (
      !jaConfirmado &&
      !window.confirm(canal.podeTrocarUnidade ? CONFIRMA_TROCA_UNIDADE : CONFIRMA_VINCULO_UNIDADE)
    ) {
      return
    }
    startTransition(async () => {
      try {
        const { nomeUnidade } = await vincularUnidadePeloCanal(canal.id)
        toast.success(
          canal.podeTrocarUnidade
            ? `Unidade alterada para ${nomeUnidade}.`
            : `Você está vinculado a ${nomeUnidade}.`,
        )
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível vincular-se à unidade.')
      }
    })
  }

  function desvincularUnidade() {
    if (!window.confirm(CONFIRMA_DESVINCULO_UNIDADE)) return
    startTransition(async () => {
      try {
        const { nomeUnidade } = await desvincularUnidadePeloCanal(canal.id)
        toast.success(`Você deixou ${nomeUnidade}. Continua sócio da torcida.`)
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível desvincular da unidade.')
      }
    })
  }

  function silenciar() {
    startTransition(async () => {
      try {
        const { silenciada: next } = await alternarSilencioCanal(canal.id)
        setSilenciada(next)
        toast.success(next ? 'Canal silenciado no feed.' : 'Canal voltou ao feed.')
        setMenuOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível alterar o silêncio.')
      }
    })
  }

  function sair() {
    if (!window.confirm('Sair deste canal? Você deixará de ver o mural e o chat.')) return
    startTransition(async () => {
      try {
        await sairCanal(canal.id)
        toast.success('Você saiu do canal.')
        setSouMembro(false)
        window.location.href = '/portal/comunidade/canais'
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível sair.')
      }
    })
  }

  const localLabel =
    canal.cidade && canal.estado
      ? `${canal.cidade} · ${canal.estado}`
      : canal.cidade ?? canal.estado
  const tipoLabel = canal.tipoUnidade ? labelTipoUnidade(canal.tipoUnidade) : null
  const categoria = labelCategoriaCanal(canal)
  const tenantNome = formatNomeTorcida(canal.tenantNome)
  const canalNome = canal.canalOficial
    ? formatNomeTorcida(canal.nome ?? tenantNome)
    : (canal.nome ?? 'Canal')
  const podeInscreverOuPedir =
    !leituraOperador && !souMembro && !canal.ehCanalDepartamento
  // Depto/área: chrome da navbar = unidade dona (não o título da frente).
  const navbarBrand = canal.ehCanalDepartamento
    ? {
        nome: tenantNome,
        corPrimaria,
        logoUrl: canal.tenantLogoUrl,
      }
    : {
        nome: canalNome,
        corPrimaria,
        logoUrl: canal.avatarUrl,
      }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CanalNavbarOverride
        brand={navbarBrand}
        canalOficial={canal.canalOficial || canal.ehCanalDepartamento}
      />

      <header className="card-soft flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
        <Avatar nome={canalNome} avatarUrl={canal.avatarUrl} size="sm" fit="contain" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-sm font-bold text-[rgb(var(--foreground))]">
              {canalNome}
            </h1>
            <span className="inline-flex shrink-0 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
              {categoria}
            </span>
            {silenciada && souMembro ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                <BellOff className="h-3 w-3" />
                Silenciado
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {canal.membros}{' '}
              {canal.ehCanalDepartamento
                ? canal.membros === 1
                  ? 'membro'
                  : 'membros'
                : canal.membros === 1
                  ? 'inscrito'
                  : 'inscritos'}
            </span>
            {tipoLabel ? (
              <>
                {' · '}
                {tipoLabel}
              </>
            ) : null}
            {localLabel ? (
              <>
                {' · '}
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {localLabel}
                </span>
              </>
            ) : nomesEquivalentes(canalNome, tenantNome) ? null : (
              <>
                {' · '}
                {tenantNome}
              </>
            )}
          </p>
        </div>

        {souMembro && (
          <Link
            href={`/portal/mensagens?c=${canal.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </Link>
        )}

        {podeInscreverOuPedir && canal.publica && (
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

        {podeInscreverOuPedir && !canal.publica && canal.pedidoPendente && (
          <span className="shrink-0 rounded-full border border-[rgb(var(--border))] px-3.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Pedido enviado
          </span>
        )}

        {podeInscreverOuPedir && !canal.publica && !canal.pedidoPendente && (
          <m.button
            type="button"
            disabled={pending}
            onClick={pedirEntrada}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="shrink-0 rounded-full bg-[rgb(var(--color-primary))] px-3.5 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Solicitar para entrar
          </m.button>
        )}

        {canal.canalOficial && canal.tipoUnidade === 'SEDE' && (
          <Link
            href={linkTorcidaComunidadePublica(canal.tenantId)}
            className="hidden shrink-0 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline sm:block"
          >
            Perfil da torcida
          </Link>
        )}

        <div className="relative shrink-0">
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Mais opções do canal"
            aria-expanded={menuOpen}
            className="app-touch-target flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          <FloatingMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={menuTriggerRef}
            minWidth={224}
            className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
          >
                  {podeGerenciarAdmins && (
                    <AppButton
                      variant="none"
                      icon={Settings}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setConfigOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      Configurações do canal
                    </AppButton>
                  )}
                  {canal.canalOficial && podeGerenciarMembros && (
                    <Link
                      href="/admin/configuracoes?secao=canal-oficial"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Settings className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                      Editar canal oficial
                    </Link>
                  )}
                  {(podeGerenciarAdmins || podeGerenciarMembros) && (
                    <AppButton
                      variant="none"
                      icon={Shield}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setGerenciarOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      Gerenciar membros
                    </AppButton>
                  )}
                  {podeGerenciarPedidos && (
                    <AppButton
                      variant="none"
                      icon={UserPlus}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPedidosOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      Pedidos pendentes
                      {pedidosPendentesCount > 0 && (
                        <span className="rounded-full bg-[rgb(var(--color-primary))] px-1.5 py-0.5 text-[10px] font-bold text-[rgb(var(--color-primary-on))]">
                          {pedidosPendentesCount}
                        </span>
                      )}
                    </AppButton>
                  )}
                  {souMembro && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={pending}
                        onClick={silenciar}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                      >
                        {silenciada ? (
                          <>
                            <Bell className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                            Voltar ao feed
                          </>
                        ) : (
                          <>
                            <BellOff className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                            Silenciar no feed
                          </>
                        )}
                      </button>
                      {!canal.ehCanalDepartamento ? (
                        <AppButton
                          variant="none"
                          icon={LogOut}
                          type="button"
                          role="menuitem"
                          disabled={pending}
                          onClick={sair}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                        >
                          Sair do canal
                        </AppButton>
                      ) : null}
                      {canal.podeDesvincularUnidade ? (
                        <AppButton
                          variant="none"
                          icon={UserMinus}
                          type="button"
                          role="menuitem"
                          disabled={pending}
                          onClick={() => {
                            setMenuOpen(false)
                            desvincularUnidade()
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                        >
                          Desvincular desta unidade
                        </AppButton>
                      ) : canal.vinculoUnidadeLiberaEm ? (
                        <p className="px-4 py-2 text-xs leading-snug text-[rgb(var(--foreground-muted))]">
                          {mensagemTravaVinculoUnidade(canal.vinculoUnidadeLiberaEm)}
                        </p>
                      ) : null}
                    </>
                  )}
                  {(canal.podeVincularUnidade || canal.podeTrocarUnidade) && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pending}
                      onClick={() => {
                        setMenuOpen(false)
                        vincularUnidade()
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                    >
                      <MapPin className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                      {canal.podeTrocarUnidade
                        ? 'Trocar para esta unidade'
                        : 'Esta é a minha unidade'}
                    </button>
                  )}
                  {!souMembro &&
                  !canal.podeVincularUnidade &&
                  !canal.podeTrocarUnidade &&
                  canal.vinculoUnidadeLiberaEm ? (
                    <p className="px-4 py-2 text-xs leading-snug text-[rgb(var(--foreground-muted))]">
                      {mensagemTravaVinculoUnidade(canal.vinculoUnidadeLiberaEm)}
                    </p>
                  ) : null}
                  <CanaisListLink
                    href="/portal/comunidade/canais"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <Users className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    Ver todos os canais
                  </CanaisListLink>
          </FloatingMenu>
        </div>
      </header>

      {buscaChrome}

      {configOpen && (
        <CanalConfigModal canal={canal} onClose={() => setConfigOpen(false)} />
      )}

      {gerenciarOpen && (
        <GerenciarMembrosModal
          canalId={canal.id}
          currentUserId={currentUser.id}
          podeGerenciarAdmins={podeGerenciarAdmins}
          podeGerenciarMembros={podeGerenciarMembros}
          onClose={() => setGerenciarOpen(false)}
        />
      )}

      {pedidosOpen && (
        <PedidosCanalModal canalId={canal.id} onClose={() => setPedidosOpen(false)} />
      )}

      <div
        className={
          souMembro && podePublicar && verMural
            ? 'flex min-w-0 flex-col gap-6'
            : 'flex min-w-0 flex-col gap-4'
        }
      >
        {souMembro && podePublicar ? (
          <div key="canal-composer">{composer}</div>
        ) : null}

        {!verMural ? (
          <MotionEmptyState
            key="canal-empty"
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-12 text-center"
            icon={
              <Avatar
                nome={canalNome}
                avatarUrl={canal.avatarUrl}
                size="lg"
                fit="contain"
                className="mb-3"
              />
            }
            title={
              canal.ehCanalDepartamento
                ? 'Canal interno do departamento'
                : 'Inscreva-se no canal'
            }
            description={
              canal.ehCanalDepartamento
                ? 'A entrada é automática pelo cargo na equipe — não há inscrição nem pedido.'
                : 'Para ver o mural completo e participar do chat.'
            }
          />
        ) : (
          <div key="canal-mural">{children}</div>
        )}
      </div>
    </div>
  )
}

function GerenciarMembrosModal({
  canalId,
  currentUserId,
  podeGerenciarAdmins,
  podeGerenciarMembros,
  onClose,
}: {
  canalId: string
  currentUserId: string
  /** Delegar/revogar admin — só canal temático. */
  podeGerenciarAdmins: boolean
  /** Remover/adicionar membro — oficial e temático. */
  podeGerenciarMembros: boolean
  onClose: () => void
}) {
  const [membros, setMembros] = useState<MembroCanalItem[] | null>(null)
  const [candidatos, setCandidatos] = useState<CandidatoMembroCanalItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [removidos, setRemovidos] = useState<Set<string>>(new Set())
  const [adicionados, setAdicionados] = useState<CandidatoMembroCanalItem[]>([])
  const [candidatoSelecionado, setCandidatoSelecionado] = useState('')

  useEffect(() => {
    let cancelled = false
    void carregarPainelMembrosCanal(canalId)
      .then((data) => {
        if (cancelled) return
        setMembros(data.membros)
        setCandidatos(data.candidatos)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar os membros.')
      })
    return () => {
      cancelled = true
    }
  }, [canalId])

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

  function remover(userId: string) {
    setPendingUserId(userId)
    startTransition(async () => {
      try {
        await removerMembroCanal(canalId, userId)
        toast.success('Membro removido do canal.')
        setRemovidos((prev) => new Set(prev).add(userId))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível remover.')
      } finally {
        setPendingUserId(null)
      }
    })
  }

  function adicionar() {
    if (!candidatoSelecionado) return
    const candidato = candidatos.find((c) => c.userId === candidatoSelecionado)
    setPendingUserId(candidatoSelecionado)
    startTransition(async () => {
      try {
        await adicionarMembroCanal(canalId, candidatoSelecionado)
        toast.success('Membro adicionado.')
        if (candidato) setAdicionados((prev) => [...prev, candidato])
        setCandidatoSelecionado('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível adicionar.')
      } finally {
        setPendingUserId(null)
      }
    })
  }

  const membrosVisiveis = (membros ?? []).filter((m2) => !removidos.has(m2.userId))
  const candidatosDisponiveis = candidatos.filter(
    (c) => !adicionados.some((a) => a.userId === c.userId),
  )
  const loading = membros === null && !loadError

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
          <h2 className="text-sm font-bold text-[rgb(var(--foreground))]">Gerenciar membros</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy
            className="flex items-center justify-center gap-2 py-10 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando membros…
          </div>
        ) : loadError ? (
          <p className="py-6 text-center text-sm text-danger">{loadError}</p>
        ) : (
          <>
            {podeGerenciarMembros && candidatosDisponiveis.length > 0 && (
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={candidatoSelecionado}
                  onChange={(e) => setCandidatoSelecionado(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                >
                  <option value="">Adicionar membro direto…</option>
                  {candidatosDisponiveis.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.nome ?? 'Torcedor'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!candidatoSelecionado || (pending && pendingUserId === candidatoSelecionado)}
                  onClick={adicionar}
                  className="shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
                >
                  {pending && pendingUserId === candidatoSelecionado ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Adicionar'
                  )}
                </button>
              </div>
            )}

            {membrosVisiveis.length === 0 ? (
              <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum membro encontrado.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {membrosVisiveis.map((m2) => (
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
                    {podeGerenciarAdmins && (
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
                    )}
                    {podeGerenciarMembros && m2.userId !== currentUserId && (
                      <button
                        type="button"
                        disabled={pending && pendingUserId === m2.userId}
                        onClick={() => remover(m2.userId)}
                        aria-label="Remover do canal"
                        className="shrink-0 rounded-lg border border-[rgb(var(--border))] p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </m.div>
    </div>
  )
}

function PedidosCanalModal({
  canalId,
  onClose,
}: {
  canalId: string
  onClose: () => void
}) {
  const [pedidos, setPedidos] = useState<PedidoCanalItem[] | null>(null)
  const [recusados, setRecusados] = useState<PedidoCanalItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [aba, setAba] = useState<'pendentes' | 'recusados'>('pendentes')
  const [decididos, setDecididos] = useState<Set<string>>(new Set())
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void carregarPainelPedidosCanal(canalId)
      .then((data) => {
        if (cancelled) return
        setPedidos(data.pedidos)
        setRecusados(data.recusados)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar os pedidos.')
      })
    return () => {
      cancelled = true
    }
  }, [canalId])

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

  const restantes = (pedidos ?? []).filter((p) => !decididos.has(p.userId))
  const loading = pedidos === null && !loadError

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
          <h2 className="text-sm font-bold text-[rgb(var(--foreground))]">Pedidos de entrada</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy
            className="flex items-center justify-center gap-2 py-10 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando pedidos…
          </div>
        ) : loadError ? (
          <p className="py-6 text-center text-sm text-danger">{loadError}</p>
        ) : (
          <>
            <div className="mb-3 flex gap-1 rounded-lg bg-[rgb(var(--background-subtle))] p-1">
              <button
                type="button"
                onClick={() => setAba('pendentes')}
                className={[
                  'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                  aba === 'pendentes'
                    ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                    : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                Pendentes ({restantes.length})
              </button>
              <button
                type="button"
                onClick={() => setAba('recusados')}
                className={[
                  'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                  aba === 'recusados'
                    ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                    : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                Recusados ({recusados.length})
              </button>
            </div>

            {aba === 'pendentes' ? (
              restantes.length === 0 ? (
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
                        className="shrink-0 rounded-lg border border-[rgb(var(--border))] p-1.5 text-success transition-colors hover:bg-[rgb(var(--color-success)_/_0.12)] disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
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
              )
            ) : recusados.length === 0 ? (
              <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum pedido recusado.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {recusados.map((p) => (
                  <li key={p.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <Avatar nome={p.nome} avatarUrl={p.avatarUrl} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-[rgb(var(--foreground))]">
                      {p.nome ?? 'Torcedor'}
                    </p>
                    <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">Recusado</span>
                  </li>
                ))}
              </ul>
            )}
          </>
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
  const [avatarUrl, setAvatarUrl] = useState(canal.avatarUrl ?? '')
  const crop = useCroppedImageUpload({
    aspect: 1,
    purpose: 'comunidade',
    title: 'Ajustar foto do canal',
    onDone: ({ url }) => {
      if (url) {
        setAvatarUrl(url)
        toast.success('Foto pronta — salve para aplicar.')
      }
    },
  })

  useEffect(() => {
    if (state.success) {
      toast.success('Canal atualizado.')
      window.location.reload()
    } else if (state.message) {
      toast.error(state.message)
    }
  }, [state])

  function onFotoChange(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.')
      return
    }
    crop.open(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {crop.dialog}
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

        <form action={formAction} className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1">
          <input type="hidden" name="conversaId" value={canal.id} />
          <input type="hidden" name="avatarUrl" value={avatarUrl} />

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

          <ImageDropZone
            label="Foto"
            busy={crop.busy || pending}
            formatsHint="JPEG, PNG ou WebP — ajuste 1:1 antes do envio"
            file={
              avatarUrl.trim()
                ? {
                    name: 'foto-canal.jpg',
                    status: crop.busy ? 'uploading' : 'done',
                    previewUrl: avatarUrl.trim(),
                  }
                : null
            }
            onClear={avatarUrl.trim() ? () => setAvatarUrl('') : undefined}
            onFile={onFotoChange}
          />

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
            <AppButton
              variant="none"
              icon={X}
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            >
              Cancelar
            </AppButton>
            <AppButton
              variant="primary"
              icon={Save}
              loading={pending || crop.busy}
              type="submit"
            >
              Salvar
            </AppButton>
          </div>
        </form>
      </m.div>
    </div>
  )
}
