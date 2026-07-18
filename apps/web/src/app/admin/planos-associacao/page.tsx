import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { db } from '@torcida/db'
import {
  formatarMoedaBRL,
  PERIODICIDADE_PLANO_LABEL,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminPlanoForm } from './admin-plano-form'
import { AdminPlanosListaClient } from './admin-planos-lista-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Planos de associação — Admin' }

type Props = { searchParams: Promise<{ edit?: string }> }

export default async function PlanosAssociacaoAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const editId = sp.edit?.trim()

  type PlanoRow = {
    id: string
    nome: string
    descricao: string | null
    valor: { toNumber(): number } | number
    periodicidade: string
    beneficios: string | null
    ativo: boolean
    _count: { membros: number }
  }

  const planos: PlanoRow[] = await db.planoAssociacao.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      descricao: true,
      valor: true,
      periodicidade: true,
      beneficios: true,
      ativo: true,
      _count: { select: { membros: true } },
    },
  })

  const editando = editId ? planos.find((p) => p.id === editId) : null

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[rgb(var(--foreground))]">
                Planos de associação
              </h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Contribuições periódicas dos associados — distinto do plano SaaS da plataforma.
              </p>
            </div>
          </div>
          <Link
            href="/admin/cobrancas"
            className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Ver cobranças
          </Link>
        </div>
      </MotionReveal>

      {editando ? (
        <>
          <AdminPlanoForm
            initial={{
              id: editando.id,
              nome: editando.nome,
              descricao: editando.descricao,
              valor: typeof editando.valor === 'number' ? editando.valor : editando.valor.toNumber(),
              periodicidade: editando.periodicidade,
              beneficios: editando.beneficios,
              ativo: editando.ativo,
            }}
          />
          <Link
            href="/admin/planos-associacao"
            className="inline-block text-sm text-[rgb(var(--foreground-muted))] hover:underline"
          >
            Cancelar edição
          </Link>
        </>
      ) : (
        <AdminPlanoForm />
      )}

      <AdminPlanosListaClient
        planos={planos.map((p) => ({
          id: p.id,
          nome: p.nome,
          descricao: p.descricao,
          valorLabel: formatarMoedaBRL(
            typeof p.valor === 'number' ? p.valor : p.valor.toNumber(),
          ),
          periodicidadeLabel:
            PERIODICIDADE_PLANO_LABEL[p.periodicidade as keyof typeof PERIODICIDADE_PLANO_LABEL] ??
            p.periodicidade,
          ativo: p.ativo,
          membrosCount: p._count.membros,
        }))}
      />
    </div>
  )
}
