import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@torcida/db'
import {
  PERIODICIDADE_PLANO_LABEL,
  PERMISSIONS,
  PeriodicidadePlanoSchema,
  resolverPeriodicidadesOnboarding,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { AdminPlanoForm } from '../admin-plano-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Novo plano de sócio — Admin' }

type Props = { searchParams: Promise<{ edit?: string; periodicidade?: string }> }

export default async function NovoPlanoAssociacaoPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin/financeiro/planos')
  }

  const sp = await searchParams
  const editId = sp.edit?.trim()
  const periodicidadeParsed = PeriodicidadePlanoSchema.safeParse(sp.periodicidade?.trim())
  const periodicidade = periodicidadeParsed.success ? periodicidadeParsed.data : undefined

  const [editando, ofertaRow]: [
    {
      id: string
      nome: string
      descricao: string | null
      valor: { toNumber(): number } | number
      periodicidade: string
      beneficios: string | null
      ativo: boolean
    } | null,
    { periodicidadesOnboarding: string[] } | null,
  ] = await Promise.all([
    editId
      ? db.planoAssociacao.findFirst({
          where: { id: editId, tenantId: tenant.id },
          select: {
            id: true,
            nome: true,
            descricao: true,
            valor: true,
            periodicidade: true,
            beneficios: true,
            ativo: true,
          },
        })
      : Promise.resolve(null),
    db.tenant.findUnique({
      where: { id: tenant.id },
      select: { periodicidadesOnboarding: true },
    }),
  ])

  if (editId && !editando) redirect('/admin/financeiro/planos')

  const oferta = resolverPeriodicidadesOnboarding(ofertaRow?.periodicidadesOnboarding ?? [])
  const valorPlano = (v: { toNumber(): number } | number) =>
    typeof v === 'number' ? v : v.toNumber()

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        {editando
          ? 'Altere nome, valor e ciclo. O onboarding usa o plano ativo da mesma periodicidade.'
          : 'Cadastre o valor oficial do ciclo. Quem já é sócio vê este nome no wizard e fica vinculado ao plano.'}
      </p>

      <AdminPlanoForm
        initial={
          editando
            ? {
                id: editando.id,
                nome: editando.nome,
                descricao: editando.descricao,
                valor: valorPlano(editando.valor),
                periodicidade: editando.periodicidade,
                beneficios: editando.beneficios,
                ativo: editando.ativo,
                oferecerOnboarding: oferta.includes(
                  editando.periodicidade as (typeof oferta)[number],
                ),
              }
            : periodicidade
              ? {
                  nome:
                    PERIODICIDADE_PLANO_LABEL[
                      periodicidade as keyof typeof PERIODICIDADE_PLANO_LABEL
                    ] ?? periodicidade,
                  descricao: null,
                  periodicidade,
                  beneficios: null,
                  ativo: true,
                  oferecerOnboarding: true,
                }
              : undefined
        }
      />

      <Link
        href="/admin/financeiro/planos"
        className="app-touch-line inline-block text-sm text-[rgb(var(--foreground-muted))] hover:underline"
      >
        Voltar à oferta
      </Link>
    </div>
  )
}
