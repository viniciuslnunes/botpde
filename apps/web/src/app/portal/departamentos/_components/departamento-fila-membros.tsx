'use client'

import Link from 'next/link'
import { Clock, Users } from 'lucide-react'
import { MemberActions } from '@/components/admin/member-actions'

export type PendenteLite = {
  id: string
  nome: string
  tipo: 'SOCIO' | 'TORCEDOR'
  cidade: string | null
  criadoEm: string
  departamentoNome: string | null
  user: { nome: string | null; email: string; avatarUrl: string | null }
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function DepartamentoFilaMembros({
  pendentes,
  totalPendentes,
}: {
  pendentes: PendenteLite[]
  totalPendentes: number
}) {
  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Users className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
            Solicitações pendentes
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {totalPendentes === 0
              ? 'Nenhuma solicitação aguardando aprovação.'
              : `${totalPendentes} ${totalPendentes === 1 ? 'pessoa aguarda' : 'pessoas aguardam'} aprovação.`}
          </p>
        </div>
        <Link
          href="/admin/socios?status=solicitacoes"
          prefetch={false}
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Ver todas no admin
        </Link>
      </div>

      {pendentes.length === 0 ? (
        <p className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]">
          <Clock className="h-4 w-4" />
          Fila vazia por enquanto.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[rgb(var(--border))]">
          {pendentes.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {p.nome || p.user.nome || p.user.email}
                </p>
                <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
                  {p.tipo === 'SOCIO' ? 'Sócio' : 'Torcedor'}
                  {p.departamentoNome ? ` · ${p.departamentoNome}` : ''}
                  {p.cidade ? ` · ${p.cidade}` : ''}
                  {' · '}
                  {formatarData(p.criadoEm)}
                </p>
              </div>
              <MemberActions
                membroId={p.id}
                status="PENDENTE"
                departamentoNome={p.departamentoNome}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
