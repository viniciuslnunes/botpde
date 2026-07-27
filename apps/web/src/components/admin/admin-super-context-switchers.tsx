'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from '@torcida/ui'
import {
  selecionarTorcidaAction,
  selecionarUnidadeAction,
  type SelecionarTorcidaState,
  type SelecionarUnidadeState,
} from '@/app/admin/tenant-context-actions'
import { SearchableContextSwitcher } from '@/components/admin/searchable-context-switcher'
import {
  labelClubeOpcao,
  labelUnidadeSub,
  type ClubeOpcao,
  type TorcidaOpcao,
  type UnidadeOpcao,
} from '@/lib/torcida-labels'

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

  const wasTorcidaPending = useRef(false)
  const wasUnidadePending = useRef(false)

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

  const unidadeItems: UnidadeItem[] = useMemo(
    () => unidades.map((u) => ({ ...u, recentKey: u.id })),
    [unidades],
  )

  const unidadeAtualId = useMemo(() => {
    if (!tenantAtualId) return null
    return resolverUnidadeAtual(unidades, tenantAtualId, pathname)
  }, [unidades, tenantAtualId, pathname])

  const isSuper = variant === 'super-admin'
  const semTorcida = !torcidaAtualSlug

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
        onSelect={(c) => setClubeId(c.id)}
      />

      <SearchableContextSwitcher<TorcidaItem>
        label="Torcida ativa"
        placeholder="Buscar torcida…"
        emptyMessage="Nenhuma torcida neste clube."
        items={torcidaItems}
        valueId={torcidaAtualSlug}
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
          isSuper || semTorcida ? (
            <p
              className={
                isSuper
                  ? 'text-xs text-zinc-500'
                  : 'text-xs text-[rgb(var(--foreground-muted))]'
              }
            >
              Ao trocar, você entra no admin da torcida escolhida.
            </p>
          ) : null
        }
      />

      {exibirAfiliacoes ? (
        <SearchableContextSwitcher<UnidadeItem>
          label="Afiliações"
          placeholder={
            semTorcida
              ? 'Selecione uma torcida primeiro'
              : unidades.length === 0
                ? 'Sem unidades cadastradas'
                : 'Buscar unidade…'
          }
          emptyMessage="Nenhuma unidade na worktree."
          items={unidadeItems}
          valueId={unidadeAtualId}
          getLabel={(u) => u.nome}
          getSubLabel={labelUnidadeSub}
          getSearchText={(u) =>
            [u.nome, u.tipo, u.cidade ?? '', u.tenantSlug].join(' ')
          }
          getIndentRem={(u) => u.depth}
          recentNamespace="unidade"
          variant={variant}
          disabled={semTorcida || unidades.length === 0}
          pending={unidadePending}
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
      ) : null}
    </div>
  )
}
