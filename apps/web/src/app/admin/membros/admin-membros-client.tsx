'use client'

import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { TriangleAlert, Users } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MemberActions } from '@/components/admin/member-actions'
import { ComprovanteLightbox } from '@/components/admin/comprovante-lightbox'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface AdminMembroItem {
  id: string
  nome: string
  discordTag: string | null
  tipo: string
  cidade: string | null
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
  statusLabel: string
  statusClass: string
  criadoEmLabel: string
  avatarUrl: string | null
  inicial: string
  telefone?: string | null
  idade?: number | null
  /** Departamento pretendido no onboarding (sócio); null se não informou. */
  departamentoNome?: string | null
  /** Unidade territorial (Sede/Subsede/PDE). */
  sedeNome?: string | null
  /** Comprovante de vínculo (só sócio; dado RESTRITO — nunca cachear). */
  imagemProva?: string | null
  numeroAssociado?: string | null
  anosSocio?: number | null
  /** True quando o usuário já é sócio aprovado em torcida rival (sem identificá-la). */
  alertaRivalSocio?: boolean
  /** Nº de recrutamentos de sócio reprovados em OUTRAS torcidas/clubes (sem identificar qual). */
  reprovacoesOutraTorcida?: number
  /** Nº de solicitações (cadastro + recadastros) registradas no AuditLog. */
  tentativas?: number
  ultimoMotivoReprovacao?: string
}

interface AdminMembrosTableProps {
  membros: AdminMembroItem[]
}

export function AdminMembrosTable({ membros }: AdminMembrosTableProps) {
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
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
    >
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
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
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden 2xl:table-cell">
              Cadastro
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
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
                className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
              >
                <td className="px-4 py-3">
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)] text-xs font-bold text-[rgb(var(--primary))]">
                        {membro.inicial}
                      </div>
                    )}
                    <div>
                      <Link
                        href={`/admin/membros/${membro.id}`}
                        className="font-medium text-[rgb(var(--foreground))] hover:text-[rgb(var(--primary))] hover:underline"
                      >
                        {membro.nome}
                      </Link>
                      {membro.discordTag && (
                        <p className="text-xs text-[rgb(var(--foreground-muted))]">{membro.discordTag}</p>
                      )}
                      {membro.alertaRivalSocio && (
                        <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          <TriangleAlert className="h-3 w-3 shrink-0" />
                          Já é sócio aprovado em torcida rival
                        </p>
                      )}
                      {!!membro.reprovacoesOutraTorcida && (
                        <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                          <TriangleAlert className="h-3 w-3 shrink-0" />
                          Reprovado em recrutamento de outra torcida ({membro.reprovacoesOutraTorcida}x)
                        </p>
                      )}
                      {membro.tentativas !== undefined && membro.tentativas > 1 && (
                        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                          {membro.tentativas}ª tentativa
                          {membro.ultimoMotivoReprovacao
                            ? ` · reprovado antes: “${membro.ultimoMotivoReprovacao}”`
                            : ' · reprovado anteriormente'}
                        </p>
                      )}
                      {membro.imagemProva && (
                        <div className="mt-0.5">
                          <ComprovanteLightbox
                            imagemUrl={membro.imagemProva}
                            nome={membro.nome}
                            numeroAssociado={membro.numeroAssociado ?? null}
                            anosSocio={membro.anosSocio ?? null}
                          />
                        </div>
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
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${membro.statusClass}`}>
                    {membro.statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 hidden 2xl:table-cell">
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">{membro.criadoEmLabel}</span>
                </td>
                <td className="px-4 py-3">
                  <MemberActions
                    membroId={membro.id}
                    status={membro.status}
                    departamentoNome={membro.departamentoNome}
                  />
                </td>
              </m.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </m.div>
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
        <m.div key={tab.status} whileTap={{ scale: 0.97 }} transition={springSnappy}>
          <Link
            href={tab.href}
            className={[
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab.active
                ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  tab.active
                    ? 'bg-[rgb(var(--primary))] text-white'
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
