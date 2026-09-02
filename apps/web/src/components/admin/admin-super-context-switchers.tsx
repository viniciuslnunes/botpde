'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  buscarTorcidasParaSelecaoAction,
  selecionarTorcidaAction,
  selecionarUnidadeAction,
  type SelecionarTorcidaState,
  type SelecionarUnidadeState,
} from '@/app/admin/tenant-context-actions'
import { SearchableContextSwitcher } from '@/components/admin/searchable-context-switcher'
import { useConfirmDialog } from '@/lib/confirm-action'
import {
  labelClubeOpcao,
  labelUnidadeSub,
  type ClubeOpcao,
  type TorcidaOpcao,
  type UnidadeOpcao,
} from '@/lib/torcida-labels'
import { AppButton } from '@/components/ui/button'

type ClubeItem = ClubeOpcao & { recentKey: string }
type TorcidaItem = TorcidaOpcao & { id: string; recentKey: string }
type UnidadeItem = UnidadeOpcao & { recentKey: string }

type Props = {
  clubes: ClubeOpcao[]
  torcidas: TorcidaOpcao[]
  unidades?: UnidadeOpcao[]
  torcidaAtualSlug?: string | null
  tenantAtualId?: string | null
  /** Destino do select de torcida (`selecionarTorcidaAction`). */
  destino?: 'admin' | 'portal' | 'super-admin'
  variant?: 'admin' | 'super-admin'
  /** Exibe o 3º select (default: true quando há torcida ativa). */
  mostrarAfiliacoes?: boolean
}

function resolverUnidadeAtual(
  unidades: UnidadeOpcao[],
  tenantAtualId: string,
  pathname: string,
): string | null {
  const sedeMatch = pathname.match(/^\/admin\/sedes\/([^/]+)/)
  if (sedeMatch) {
    const sedeId = sedeMatch[1]
    const bySede = unidades.find((u) => u.sedeId === sedeId)
    if (bySede) return bySede.id
  }

  const doTenant = unidades.filter((u) => u.tenantId === tenantAtualId)
  if (doTenant.length === 0) return null

  const casoB = doTenant.find((u) => u.origem === 'tenant')
  if (casoB) return casoB.id

  const sedeRaiz =
    doTenant.find((u) => u.tipo === 'SEDE' && u.depth === 0) ??
    doTenant.find((u) => u.tipo === 'SEDE') ??
    doTenant[0]
  return sedeRaiz?.id ?? null
}

export function AdminSuperContextSwitchers({
  clubes,
  torcidas,
  unidades = [],
  torcidaAtualSlug = null,
  tenantAtualId = null,
  destino = 'admin',
  variant = 'admin',
  mostrarAfiliacoes,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const confirmDialog = useConfirmDialog()
  const torcidaAtual = useMemo(
    () => torcidas.find((t) => t.slug === torcidaAtualSlug) ?? null,
    [torcidas, torcidaAtualSlug],
  )

  const exibirAfiliacoes = mostrarAfiliacoes ?? Boolean(torcidaAtualSlug && tenantAtualId)

  const [clubeId, setClubeId] = useState<string | null>(
    () => torcidaAtual?.afiliacaoId ?? null,
  )

  const [prevTorcidaSlug, setPrevTorcidaSlug] = useState(torcidaAtualSlug)
  if (torcidaAtualSlug !== prevTorcidaSlug) {
    setPrevTorcidaSlug(torcidaAtualSlug)
    setClubeId(torcidaAtual?.afiliacaoId ?? null)
  }

  const [torcidaState, torcidaAction, torcidaPending] = useActionState<
    SelecionarTorcidaState,
    FormData
  >(selecionarTorcidaAction, {})
  const [unidadeState, unidadeAction, unidadePending] = useActionState<
    SelecionarUnidadeState,
    FormData
  >(selecionarUnidadeAction, {})
  const [portalPending, startPortal] = useTransition()

  const wasTorcidaPending = useRef(false)
  const wasUnidadePending = useRef(false)
  const handledSemPortal = useRef<string | null>(null)

  /**
   * Cascata do filtro local (clube → torcida → afiliações):
   * se o clube selecionado não contém a torcida ativa, os filhos somem do
   * display até o operador escolher uma torcida daquele clube.
   */
  const torcidaCompativelComClube = useMemo(() => {
    if (!torcidaAtualSlug) return false
    if (!clubeId) return true
    return torcidaAtual?.afiliacaoId === clubeId
  }, [torcidaAtualSlug, clubeId, torcidaAtual?.afiliacaoId])

  const torcidaValueId = torcidaCompativelComClube ? torcidaAtualSlug : null
  const afiliacoesProntas =
    torcidaCompativelComClube && !torcidaPending && Boolean(torcidaAtualSlug)

  useEffect(() => {
    if (wasTorcidaPending.current && !torcidaPending && torcidaState.message) {
      toast.error(torcidaState.message)
    }
    wasTorcidaPending.current = torcidaPending
  }, [torcidaPending, torcidaState.message])

  useEffect(() => {
    if (wasUnidadePending.current && !unidadePending && unidadeState.message) {
      toast.error(unidadeState.message)
    }
    wasUnidadePending.current = unidadePending
  }, [unidadePending, unidadeState.message])

  useEffect(() => {
    const sem = unidadeState.semPortal
    if (!sem) return
    if (handledSemPortal.current === sem.sedeId) return
    handledSemPortal.current = sem.sedeId

    const unidade = unidades.find((u) => u.sedeId === sem.sedeId)
    const hrefAdmin = `/admin/sedes/${sem.sedeId}`
    void (async () => {
      const ok = await confirmDialog({
        titulo: 'Esta unidade não tem portal',
        descricao: `${sem.nome ?? 'Esta afiliação'} ainda não tem portal próprio (Caso A — vive no portal da Sede). Deseja abrir o admin da unidade para promover ou configurar um portal?`,
        labelConfirmar: 'Abrir admin da unidade',
        labelCancelar: 'Cancelar',
        cancelled: false,
        execute: async () => {
          // Já na ficha: redirect/push para a mesma URL parece “nada acontece”.
          if (pathname === hrefAdmin) {
            toast.message(
              'Você já está no admin desta unidade. Use “Criar portal próprio” se quiser promover a unidade.',
            )
            return
          }
          if (unidade) {
            const fd = new FormData()
            fd.set('modo', 'sede')
            fd.set('sedeId', sem.sedeId)
            fd.set('tenantSlug', unidade.tenantSlug)
            fd.set('confirmarAdmin', '1')
            const result = await selecionarUnidadeAction({}, fd)
            if (result.message) {
              toast.error(result.message)
              return false
            }
          }
          router.push(hrefAdmin)
        },
      })
      if (!ok) handledSemPortal.current = null
    })()
  }, [unidadeState.semPortal, confirmDialog, unidades, router, pathname])

  const clubesItems: ClubeItem[] = useMemo(
    () => clubes.map((c) => ({ ...c, recentKey: c.id })),
    [clubes],
  )

  const torcidasFiltradas = useMemo(() => {
    if (!clubeId) return torcidas
    return torcidas.filter((t) => t.afiliacaoId === clubeId)
  }, [torcidas, clubeId])

  const torcidaItems: TorcidaItem[] = useMemo(
    () =>
      torcidasFiltradas.map((t) => ({
        ...t,
        id: t.slug,
        recentKey: t.slug,
      })),
    [torcidasFiltradas],
  )

  /**
   * `torcidas` é semente, não universo: o layout manda só o topo alfabético
   * mais a torcida ativa, e o resto das centenas vem daqui conforme o operador
   * digita. `chaveExtra` refaz a busca ao trocar o clube — sem ela a cascata
   * mostraria só as torcidas daquele clube que por acaso estavam na semente.
   */
  const buscaRemotaTorcidas = useMemo(
    () => ({
      buscar: async (termo: string, recentes: string[]): Promise<TorcidaItem[]> => {
        const achados = await buscarTorcidasParaSelecaoAction({
          termo,
          afiliacaoId: clubeId,
          recentes,
        })
        return achados.map((t) => ({ ...t, id: t.slug, recentKey: t.slug }))
      },
      chaveExtra: clubeId ?? '',
    }),
    [clubeId],
  )

  const unidadeItems: UnidadeItem[] = useMemo(
    () => unidades.map((u) => ({ ...u, recentKey: u.id })),
    [unidades],
  )

  const unidadeAtualId = useMemo(() => {
    if (!tenantAtualId) return null
    return resolverUnidadeAtual(unidades, tenantAtualId, pathname)
  }, [unidades, tenantAtualId, pathname])

  const unidadeAtual = useMemo(
    () => unidades.find((u) => u.id === unidadeAtualId) ?? null,
    [unidades, unidadeAtualId],
  )

  const isSuper = variant === 'super-admin'
  const semTorcida = !torcidaAtualSlug

  function irAoPortal() {
    if (!unidadeAtual && !torcidaAtualSlug) {
      toast.error('Selecione uma torcida ou afiliação primeiro.')
      return
    }

    // Sem afiliação selecionada: portal da torcida ativa.
    if (!unidadeAtual) {
      startPortal(() => {
        const fd = new FormData()
        fd.set('slug', torcidaAtualSlug!)
        fd.set('destino', 'portal')
        void selecionarTorcidaAction({}, fd)
      })
      return
    }

    // SEDE raiz (origem sede) e Caso B (origem tenant): o portal é o do tenant.
    // SUBSEDE/PDE Caso A: action devolve semPortal → modal.
    if (
      unidadeAtual.origem === 'sede' &&
      unidadeAtual.sedeId &&
      unidadeAtual.tipo !== 'SEDE'
    ) {
      startPortal(() => {
        const fd = new FormData()
        fd.set('modo', 'sede')
        fd.set('sedeId', unidadeAtual.sedeId!)
        fd.set('tenantSlug', unidadeAtual.tenantSlug)
        fd.set('destino', 'portal')
        handledSemPortal.current = null
        void unidadeAction(fd)
      })
      return
    }

    startPortal(() => {
      const fd = new FormData()
      fd.set('modo', 'tenant')
      fd.set('tenantSlug', unidadeAtual.tenantSlug)
      fd.set('destino', 'portal')
      void unidadeAction(fd)
    })
  }

  return (
    <div className="space-y-3">
      <SearchableContextSwitcher<ClubeItem>
        label="Clube"
        placeholder="Buscar clube ou UF…"
        emptyMessage="Nenhum clube encontrado."
        items={clubesItems}
        valueId={clubeId}
        getLabel={labelClubeOpcao}
        getSearchText={(c) => [c.nome, c.apelido ?? '', c.estado ?? ''].join(' ')}
        recentNamespace="clube"
        variant={variant}
        submitOnSelect={false}
        onSelect={(c) => {
          // Trocar o filtro-pai limpa filhos no display na hora (mesmo antes
          // de navegar). Se o clube novo ainda contiver a torcida ativa, ela
          // permanece — senão some até nova seleção.
          setClubeId(c.id)
        }}
      />

      <SearchableContextSwitcher<TorcidaItem>
        label="Torcida ativa"
        placeholder={clubeId ? 'Buscar torcida neste clube…' : 'Buscar torcida…'}
        emptyMessage="Nenhuma torcida neste clube."
        items={torcidaItems}
        buscaRemota={buscaRemotaTorcidas}
        valueId={torcidaValueId}
        getLabel={(t) => t.nome}
        getSearchText={(t) =>
          [t.nome, t.clubeNome ?? '', t.clubeUf ?? '', t.slug].join(' ')
        }
        recentNamespace="torcida"
        variant={variant}
        pending={torcidaPending}
        formAction={torcidaAction}
        valueFieldName="slug"
        hiddenFields={{ destino }}
        footer={
          isSuper || semTorcida || !torcidaCompativelComClube ? (
            <p
              className={
                isSuper
                  ? 'text-xs text-zinc-500'
                  : 'text-xs text-[rgb(var(--foreground-muted))]'
              }
            >
              {!torcidaCompativelComClube && clubeId
                ? 'Selecione uma torcida deste clube para continuar.'
                : destino === 'portal'
                  ? 'Ao trocar, você entra na Comunidade da torcida escolhida.'
                : 'Ao trocar, você entra no admin da torcida escolhida.'}
            </p>
          ) : null
        }
      />

      {exibirAfiliacoes ? (
        <div className="space-y-2">
          <SearchableContextSwitcher<UnidadeItem>
            label="Afiliações"
            placeholder={
              !afiliacoesProntas
                ? 'Selecione uma torcida primeiro'
                : unidades.length === 0
                  ? 'Sem unidades cadastradas'
                  : 'Buscar unidade…'
            }
            emptyMessage="Nenhuma unidade na worktree."
            items={afiliacoesProntas ? unidadeItems : []}
            valueId={afiliacoesProntas ? unidadeAtualId : null}
            getLabel={(u) => u.nome}
            getSubLabel={labelUnidadeSub}
            getSearchText={(u) =>
              [u.nome, u.tipo, u.cidade ?? '', u.tenantSlug].join(' ')
            }
            getIndentRem={(u) => u.depth}
            recentNamespace="unidade"
            variant={variant}
            disabled={!afiliacoesProntas || unidades.length === 0}
            pending={unidadePending || torcidaPending}
            formAction={unidadeAction}
            valueFieldName={null}
            getFormFields={(u): Record<string, string> => {
              if (u.origem === 'tenant' || !u.sedeId) {
                return { modo: 'tenant', tenantSlug: u.tenantSlug }
              }
              return {
                modo: 'sede',
                sedeId: u.sedeId,
                tenantSlug: u.tenantSlug,
              }
            }}
            shouldSubmitOnSelect={(u) => u.id !== unidadeAtualId}
          />

          <AppButton
            variant="none"
            icon={ExternalLink}
            loading={portalPending}
            type="button"
            disabled={portalPending || !afiliacoesProntas}
            onClick={irAoPortal}
            className={[
              'flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isSuper
                ? 'border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white'
                : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            Ir ao portal
          </AppButton>
        </div>
      ) : null}
    </div>
  )
}
