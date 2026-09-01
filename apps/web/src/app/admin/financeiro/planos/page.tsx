import { redirect } from 'next/navigation'
import { CreditCard, IdCard, Users } from 'lucide-react'
import { db, type PeriodicidadePlanoAssociacao } from '@torcida/db'
import {
  formatarMoedaBRL,
  PERIODICIDADE_PLANO_LABEL,
  PERMISSIONS,
  resolverPeriodicidadesOnboarding,
} from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import { KpiGrid, StatCard } from '@/components/admin/ui'
import { AdminPlanosListaClient } from './admin-planos-lista-client'
import { AdminOfertaOnboarding } from './admin-oferta-onboarding'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Planos de associação — Admin' }

export default async function PlanosAssociacaoAdminPage() {
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

  const [planos, tenantOferta, gruposPeriodicidade, sociosComPlano]: [
    PlanoRow[],
    { periodicidadesOnboarding: PeriodicidadePlanoAssociacao[] } | null,
    { periodicidadePretendida: PeriodicidadePlanoAssociacao | null; _count: { _all: number } }[],
    number,
  ] = await Promise.all([
    db.planoAssociacao.findMany({
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
    }),
    db.tenant.findUnique({
      where: { id: tenant.id },
      select: { periodicidadesOnboarding: true },
    }),
    db.saasMembro.groupBy({
      by: ['periodicidadePretendida'],
      where: {
        tenantId: tenant.id,
        tipo: 'SOCIO',
        desligadoEm: null,
        periodicidadePretendida: { not: null },
      },
      _count: { _all: true },
    }),
    db.saasMembro.count({
      where: {
        tenantId: tenant.id,
        tipo: 'SOCIO',
        desligadoEm: null,
        planoAssociacaoId: { not: null },
      },
    }),
  ])

  const periodicidadesGravadas = tenantOferta?.periodicidadesOnboarding ?? []
  const oferta = resolverPeriodicidadesOnboarding(periodicidadesGravadas)
  const usandoFallback = periodicidadesGravadas.length === 0
  const countPorCiclo = new Map(
    gruposPeriodicidade
      .filter((g) => g.periodicidadePretendida)
      .map((g) => [g.periodicidadePretendida as string, g._count._all]),
  )
  const sociosNoOnboarding = oferta.reduce((acc, p) => acc + (countPorCiclo.get(p) ?? 0), 0)
  const valorPlano = (v: PlanoRow['valor']) => (typeof v === 'number' ? v : v.toNumber())

  const linhasOferta = Object.keys(PERIODICIDADE_PLANO_LABEL).map((periodicidade) => {
    const plano =
      planos.find((p) => p.periodicidade === periodicidade && p.ativo) ??
      planos.find((p) => p.periodicidade === periodicidade) ??
      null
    return {
      periodicidade,
      membrosCount: countPorCiclo.get(periodicidade) ?? 0,
      plano: plano
        ? {
            id: plano.id,
            nome: plano.nome,
            valorLabel: formatarMoedaBRL(valorPlano(plano.valor)),
            ativo: plano.ativo,
          }
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Contribuição do associado — distinto do plano SaaS da plataforma. A oferta do
        onboarding e o cadastro com valor são a mesma inteligência: o ciclo define a
        validade da carteirinha; o plano cadastrado entra no vínculo e nas cobranças.
      </p>

      <KpiGrid cols={3}>
        <StatCard
          label="Ciclos no onboarding"
          value={oferta.length}
          icon={<IdCard className="h-5 w-5" />}
          badge={usandoFallback ? 'Padrão da plataforma' : 'Configurado nesta torcida'}
          badgeTone={usandoFallback ? 'warning' : 'success'}
        />
        <StatCard
          label="Planos com valor"
          value={planos.filter((p) => p.ativo).length}
          icon={<CreditCard className="h-5 w-5" />}
          badge={
            planos.length === 0
              ? 'Cadastre o valor oficial'
              : `${planos.filter((p) => !p.ativo).length} inativo(s)`
          }
        />
        <StatCard
          label="Sócios neste ciclo"
          value={sociosNoOnboarding}
          icon={<Users className="h-5 w-5" />}
          badge={
            sociosComPlano > 0
              ? `${sociosComPlano} já vinculados a um plano`
              : 'Ainda só pela periodicidade'
          }
        />
      </KpiGrid>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
        Quem já é sócio escolhe o ciclo na ficha. Se existir um plano ativo da
        mesma periodicidade, o wizard mostra o nome oficial e grava o vínculo —
        não só a periodicidade. Sem valor cadastrado, aparece só «Quadrimensal»
        / «Anual» (ou o que você marcar abaixo).
      </section>

      <AdminOfertaOnboarding
        periodicidadesGravadas={periodicidadesGravadas}
        linhas={linhasOferta}
        podeGerir={podeGerir}
      />

      {podeGerir ? null : (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Somente leitura.</p>
      )}

      <AdminPlanosListaClient
        podeGerir={podeGerir}
        planos={planos.map((p) => ({
          id: p.id,
          nome: p.nome,
          descricao: p.descricao,
          valorLabel: formatarMoedaBRL(valorPlano(p.valor)),
          periodicidadeLabel:
            PERIODICIDADE_PLANO_LABEL[p.periodicidade as keyof typeof PERIODICIDADE_PLANO_LABEL] ??
            p.periodicidade,
          ativo: p.ativo,
          membrosCount: p._count.membros,
          noOnboarding: oferta.includes(p.periodicidade as (typeof oferta)[number]),
        }))}
      />
    </div>
  )
}
