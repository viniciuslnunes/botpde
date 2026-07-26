'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { TriangleAlert, Users } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { StatusBadge } from '@/components/admin/ui'
import { MemberActions } from '@/components/admin/member-actions'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { MembroDetalheModal } from './membro-detalhe-modal'
import type { AdminMembroItem } from './admin-membro-item'

export type { AdminMembroItem } from './admin-membro-item'

interface AdminMembrosTableProps {
  membros: AdminMembroItem[]
}

export function AdminMembrosTable({ membros }: AdminMembrosTableProps) {
  const [selecionado, setSelecionado] = useState<AdminMembroItem | null>(null)
  const fecharDetalhe = useCallback(() => setSelecionado(null), [])

  if (membros.length === 0) {
    return (
      <MotionEmptyState
        icon={<Users className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum membro encontrado"
        description="Tente ajustar os filtros de busca ou aguarde novos candidatos."
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
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] sm:px-4">
                Membro
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden sm:table-cell">
                Tipo
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden md:table-cell">
                Departamento
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden lg:table-cell">
                Unidade
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden xl:table-cell">
                Cidade
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] sm:table-cell">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden 2xl:table-cell">
                Cadastro
              </th>
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
                  onClick={() => setSelecionado(membro)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelecionado(membro)
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
                    <StatusBadge dominio="membro" status={membro.status} />
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
                    />
                  </td>
                </m.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </m.div>

      <MembroDetalheModal membro={selecionado} onClose={fecharDetalhe} />
    </>
  )
}

interface AdminMembrosTab {
  status: string
  label: string
  href: string
  active: boolean
  count?: number
  countClass?: string
}

export function AdminMembrosTabs({ tabs }: { tabs: AdminMembrosTab[] }) {
  return (
    <div className="app-scrollbar-none -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => (
        <m.div key={tab.status} className="shrink-0" whileTap={{ scale: 0.97 }} transition={springSnappy}>
          <Link
            href={tab.href}
            className={[
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
              tab.active
                ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  tab.active
                    ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                    : tab.countClass ?? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {tab.count}
              </span>
            )}
          </Link>
        </m.div>
      ))}
    </div>
  )
}
