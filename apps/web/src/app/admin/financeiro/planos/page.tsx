import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@torcida/db'
import {
  formatarMoedaBRL,
  PERIODICIDADE_PLANO_LABEL,
  PERMISSIONS,
} from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import { AdminCreateDisclosure } from '@/components/admin/ui'
import { AdminPlanoForm } from './admin-plano-form'
import { AdminPlanosListaClient } from './admin-planos-lista-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Planos de associação — Admin' }

type Props = { searchParams: Promise<{ edit?: string }> }

export default async function PlanosAssociacaoAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertManageOrOversightView>>['tenant']
  let podeGerir = false
  try {
    ;({ tenant, podeGerir } = await assertManageOrOversightView(
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
    ))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const editId = podeGerir ? sp.edit?.trim() : undefined

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
    <div className="space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Contribuições periódicas dos associados — distinto do plano SaaS da plataforma.
      </p>

      {podeGerir && editando ? (
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
            href="/admin/financeiro/planos"
            className="inline-block text-sm text-[rgb(var(--foreground-muted))] hover:underline"
          >
            Cancelar edição
          </Link>
        </>
      ) : podeGerir ? (
        <AdminCreateDisclosure label="Novo plano">
          <AdminPlanoForm />
        </AdminCreateDisclosure>
      ) : (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Somente leitura.</p>
      )}

      <AdminPlanosListaClient
        podeGerir={podeGerir}
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
