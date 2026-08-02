'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { FilterX, TriangleAlert, Users } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Badge } from '@torcida/ui'
import { StatusBadge } from '@/components/admin/ui'
import { MemberActions } from '@/components/admin/member-actions'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'
import {
  construirHrefLimparFiltros,
  temFiltroAtivo,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import { MembroDetalheModal } from './membro-detalhe-modal'
import type { AdminMembroItem } from './admin-membro-item'

export type { AdminMembroItem } from './admin-membro-item'

interface AdminMembrosTableProps {
  membros: AdminMembroItem[]
  /**
   * `<th>` da tabela, montados no servidor (`ListagemTh`) — a ordenação e o
   * popover de filtro por coluna não precisam hidratar para funcionar.
   */
  cabecalho: ReactNode
  spec: ListagemSpec
  params: ListagemParams
  /** `roles:manage` do admin logado — libera a aba Acessos do card. */
  podeGerirAcessos: boolean
  /** `members:block` do admin logado — libera bloquear/desbloquear. */
  podeBloquear: boolean
  /** `members:purge` do admin logado — libera apagar de vez. */
  podeApagar: boolean
  /** userIds bloqueados neste tenant (ou herdado da Sede). Carregado em lote. */
  bloqueadosUserIds: string[]
}

export function AdminMembrosTable({
  membros,
  cabecalho,
  spec,
  params,
  podeGerirAcessos,
  podeBloquear,
  podeApagar,
  bloqueadosUserIds,
}: AdminMembrosTableProps) {
  const bloqueados = useMemo(() => new Set(bloqueadosUserIds), [bloqueadosUserIds])
  // Guarda o id, não o objeto: quando a decisão revalida a lista, o card
  // aberto reflete o novo status/reprovação em vez de mostrar dado velho.
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const selecionado = selecionadoId
    ? (membros.find((m) => m.id === selecionadoId) ?? null)
    : null
  const fecharDetalhe = useCallback(() => setSelecionadoId(null), [])

  if (membros.length === 0) {
    // Distingue "não há cadastro" de "há, mas nenhum passa pelo filtro" — no
    // segundo caso o caminho de volta precisa estar na tela.
    const filtrando = temFiltroAtivo(params)
    return (
      <MotionEmptyState
        icon={
          filtrando ? (
            <FilterX className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
          ) : (
            <Users className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
          )
        }
        title={
          filtrando ? 'Nenhum resultado para estes filtros' : 'Nenhum torcedor cadastrado'
        }
        description={
          filtrando ? (
            <>
              Os cadastros existem, mas nenhum passa pelos filtros atuais.{' '}
              <Link
                href={construirHrefLimparFiltros(spec, params)}
                className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
              >
                Limpar filtros
              </Link>
              .
            </>
          ) : (
            'Aguarde novos cadastros ou importe uma base existente.'
          )
        }
        className="flex flex-col items-center justify-center py-20 text-center"
      />
    )
  }

  return (
    <>
      <m.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      >
        <table className="w-full min-w-0 text-sm md:min-w-[36rem] xl:min-w-[48rem]">
          <thead>
            <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
              {cabecalho}
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] sm:px-4">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            <AnimatePresence initial={false}>
              {membros.map((membro) => (
                <m.tr
                  key={membro.id}
                  layout
                  variants={staggerItem}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, x: -8, transition: { duration: 0.18 } }}
                  className="cursor-pointer transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                  onClick={() => setSelecionadoId(membro.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelecionadoId(membro.id)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes de ${membro.nome}`}
                >
                  <td className="px-3 py-3 sm:px-4">
                    <div className="flex items-center gap-3">
                      {membro.avatarUrl ? (
                        canOptimizeImageUrl(membro.avatarUrl) ? (
                          <Image
                            src={membro.avatarUrl}
                            alt={membro.nome}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={membro.avatarUrl}
                            alt={membro.nome}
                            loading="lazy"
                            decoding="async"
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        )
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-xs font-bold text-[rgb(var(--color-primary-fg))]">
                          {membro.inicial}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[rgb(var(--foreground))] group-hover:underline">
                          {membro.nome}
                        </p>
                        <StatusBadge
                          dominio="membro"
                          status={membro.status}
                          className="mt-1 sm:hidden"
                        />
                        {membro.alertaRivalSocio && (
                          <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <TriangleAlert className="h-3 w-3 shrink-0" />
                            Sócio rival
                          </p>
                        )}
                        {!!membro.reprovacoesOutraTorcida && (
                          <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                            <TriangleAlert className="h-3 w-3 shrink-0" />
                            Reprovado em outra torcida
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">{membro.tipo}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">
                      {membro.departamentoNome ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">
                      {membro.sedeNome ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">{membro.cidade ?? '—'}</span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge dominio="membro" status={membro.status} />
                      {/* Bloqueio não é status do cadastro — é sobre a pessoa,
                          e convive com qualquer status. Badge separado. */}
                      {bloqueados.has(membro.userId) && (
                        <Badge variant="danger">Bloqueado</Badge>
                      )}
                      {/* Desligado continua na lista de propósito — some da
                          operação, não do registro. */}
                      {membro.desligadoEmLabel && <Badge variant="neutral">Desligado</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden 2xl:table-cell">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">{membro.criadoEmLabel}</span>
                  </td>
                  <td
                    className="px-2 py-3 sm:px-4"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <MemberActions
                      membroId={membro.id}
                      status={membro.status}
                      departamentoNome={membro.departamentoNome}
                      espelhado={membro.espelhado}
                      aprovadoNaUnidadeNome={membro.aprovadoNaUnidadeNome}
                      aprovadoPorNome={membro.aprovadoPorNome}
                      aprovadoEmLabel={membro.aprovadoEmLabel}
                      nomeMembro={membro.nome}
                      isSocio={membro.isSocio}
                      areaPendenteEfetivacao={membro.areaPendenteEfetivacao}
                      podeBloquear={podeBloquear}
                      userId={membro.userId}
                      bloqueado={bloqueados.has(membro.userId)}
                      podeApagar={podeApagar}
                      desligado={!!membro.desligadoEmLabel}
                    />
                  </td>
                </m.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </m.div>

      <MembroDetalheModal
        membro={selecionado}
        onClose={fecharDetalhe}
        podeGerirAcessos={podeGerirAcessos}
        podeBloquear={podeBloquear}
        bloqueado={selecionado ? bloqueados.has(selecionado.userId) : false}
        podeApagar={podeApagar}
      />
    </>
  )
}
