import Link from 'next/link'
import { db } from '@torcida/db'
import { PERMISSIONS, isDepartamentoLegado } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { InsightSection, KpiGrid, StatCard } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import { AlertTriangle, KeyRound, Layers, ShieldCheck, UserMinus, Users } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Departamentos · Visão' }

type DeptoRow = {
  id: string
  nome: string
  slug: string
  cor: string
}

/** Pendência acionável do módulo: o que está organizacionalmente incompleto. */
type Pendencia = {
  id: string
  titulo: string
  detalhe: string
  href: string
}

export default async function DepartamentosVisaoPage() {
  const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  type AreaRow = {
    id: string
    nome: string
    ativa: boolean
    departamentoId: string
  }
  type VinculoRow = { areaId: string; userId: string; papel: string }

  const [deptosRaw, areas, vinculos, equipeAgg, gestores]: [
    DeptoRow[],
    AreaRow[],
    VinculoRow[],
    Array<{ departamentoId: string; _count: number }>,
    Array<{ departamentoId: string }>,
  ] = await Promise.all([
    db.departamento.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, slug: true, cor: true },
    }),
    db.departamentoArea.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, nome: true, ativa: true, departamentoId: true },
    }),
    db.departamentoAreaMembro.findMany({
      where: { area: { tenantId: tenant.id } },
      select: { areaId: true, userId: true, papel: true },
    }),
    db.userDepartamento.groupBy({
      by: ['departamentoId'],
      where: { tenantId: tenant.id },
      _count: true,
    }),
    db.departamentoGestor.findMany({
      where: { departamento: { tenantId: tenant.id } },
      select: { departamentoId: true },
    }),
  ])

  const deptos = deptosRaw.filter((d) => !isDepartamentoLegado(d))
  const deptoPorId = new Map(deptos.map((d) => [d.id, d]))
  const areasDoTenant = areas.filter((a) => deptoPorId.has(a.departamentoId))
  const areasAtivas = areasDoTenant.filter((a) => a.ativa)

  const equipePorDepto = new Map(equipeAgg.map((r) => [r.departamentoId, r._count]))
  const gestorPorDepto = new Set(gestores.map((g) => g.departamentoId))

  const responsaveisPorArea = new Set(
    vinculos.filter((v) => v.papel === 'RESPONSAVEL').map((v) => v.areaId),
  )
  const usuariosComArea = new Set(vinculos.map((v) => v.userId))

  const pessoasAlocadas = [...equipePorDepto.values()].reduce((a, b) => a + b, 0)

  // Pessoas no departamento que não entraram em nenhuma área dele.
  const membrosPorDepto: Array<{ departamentoId: string; userId: string }> =
    await db.userDepartamento.findMany({
      where: { tenantId: tenant.id },
      select: { departamentoId: true, userId: true },
    })
  const semArea = membrosPorDepto.filter(
    (m) => deptoPorId.has(m.departamentoId) && !usuariosComArea.has(m.userId),
  )

  const areasSemResponsavel = areasAtivas.filter((a) => !responsaveisPorArea.has(a.id))
  const deptosSemGestor = deptos.filter((d) => !gestorPorDepto.has(d.id))
  const deptosSemArea = deptos.filter(
    (d) => !areasAtivas.some((a) => a.departamentoId === d.id),
  )

  const pendencias: Pendencia[] = []
  for (const a of areasSemResponsavel.slice(0, 6)) {
    const depto = deptoPorId.get(a.departamentoId)
    pendencias.push({
      id: `area-${a.id}`,
      titulo: `${a.nome} está sem responsável`,
      detalhe: `Área ativa em ${depto?.nome ?? 'departamento'} — ninguém responde por ela hoje.`,
      href: `/admin/departamentos/areas?departamento=${a.departamentoId}`,
    })
  }
  for (const d of deptosSemGestor.slice(0, 4)) {
    pendencias.push({
      id: `gestor-${d.id}`,
      titulo: `${d.nome} está sem gestor`,
      detalhe: 'Sem gestor, ninguém organiza áreas nem equipe pelo portal.',
      href: '/admin/acessos?secao=pessoas',
    })
  }
  for (const d of deptosSemArea.slice(0, 4)) {
    pendencias.push({
      id: `sem-area-${d.id}`,
      titulo: `${d.nome} não tem áreas de atuação`,
      detalhe: 'Rode o seed de áreas canônicas ou crie as frentes de trabalho no portal.',
      href: `/portal/departamentos/${d.slug}#areas`,
    })
  }

  const grafico = deptos
    .map((d) => ({
      rotulo: d.nome,
      valor: equipePorDepto.get(d.id) ?? 0,
      valorSecundario: areasAtivas.filter((a) => a.departamentoId === d.id).length,
      cor: d.cor,
    }))
    .filter((r) => r.valor > 0 || r.valorSecundario > 0)

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <StatCard
          label="Departamentos"
          value={deptos.length}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Pessoas alocadas"
          value={pessoasAlocadas}
          icon={<Users className="h-5 w-5" />}
          href="/admin/departamentos/equipes"
        />
        <StatCard
          label="Áreas ativas"
          value={areasAtivas.length}
          icon={<Layers className="h-5 w-5" />}
          href="/admin/departamentos/areas"
        />
        <StatCard
          label="Áreas sem responsável"
          value={areasSemResponsavel.length}
          tone={areasSemResponsavel.length > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-5 w-5" />}
          href="/admin/departamentos/areas"
        />
      </KpiGrid>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
        <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
        Aqui é a organização das áreas e equipes. O <strong>pacote de permissão</strong> de cada
        departamento continua em
        <Link
          href="/admin/acessos?secao=departamentos"
          className="font-medium text-[rgb(var(--foreground))] underline"
        >
          Acessos · Departamentos
        </Link>
        — área organiza gente, departamento autoriza.
      </p>

      <InsightSection
        title="Distribuição da torcida"
        description="Pessoas na equipe de cada departamento e quantas áreas de atuação ele mantém ativas."
      >
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          {grafico.length > 0 ? (
            <MiniBarChart
              data={grafico}
              formato="unidades"
              legenda={{ principal: 'Pessoas', secundaria: 'Áreas ativas' }}
            />
          ) : (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum departamento tem equipe ainda. Inclua pessoas em{' '}
              <Link href="/admin/acessos?secao=pessoas" className="underline">
                Acessos · Pessoas
              </Link>
              .
            </p>
          )}
        </div>
      </InsightSection>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Pendências de organização
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            O que está incompleto na estrutura — nada aqui bloqueia acesso, só qualidade do dado.
          </p>
        </div>

        {pendencias.length === 0 ? (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-[rgb(var(--color-success-fg))]" aria-hidden />
            <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">
              Estrutura completa.
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Todo departamento tem gestor e toda área ativa tem responsável.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {pendencias.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.href}
                  className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--primary)_/_0.45)]"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-warning-fg))]"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                      {p.titulo}
                    </span>
                    <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                      {p.detalhe}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {semArea.length > 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
            <UserMinus className="h-4 w-4 shrink-0" aria-hidden />
            {semArea.length} {semArea.length === 1 ? 'pessoa está' : 'pessoas estão'} em um
            departamento sem participar de nenhuma área dele.
          </p>
        )}
      </section>
    </div>
  )
}
