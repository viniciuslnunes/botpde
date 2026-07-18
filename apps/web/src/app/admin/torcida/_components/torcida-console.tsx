import Link from 'next/link'
import { db } from '@torcida/db'
import { Users, CreditCard, MapPin, Building2 } from 'lucide-react'
import { getTorcidaWorktree, type TorcidaWorktreeNode } from '@/lib/hierarquia'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

const TIPO_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const TIPO_BADGE_CLASS: Record<string, string> = {
  SEDE: 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]',
  SUBSEDE: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  PONTO_ENCONTRO: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
}

interface UnidadeResumo extends TorcidaWorktreeNode {
  afiliados: number
  socios: number
  torcedores: number
}

interface MembroPorSede {
  sedeId: string | null
  tipo: 'SOCIO' | 'TORCEDOR'
  _count: { _all: number }
}

interface MembroPorTenant {
  tenantId: string
  tipo: 'SOCIO' | 'TORCEDOR'
  _count: { _all: number }
}

function somarTipo(
  map: Map<string, { socios: number; torcedores: number }>,
  key: string,
  tipo: 'SOCIO' | 'TORCEDOR',
  n: number,
) {
  const atual = map.get(key) ?? { socios: 0, torcedores: 0 }
  if (tipo === 'SOCIO') atual.socios += n
  else atual.torcedores += n
  map.set(key, atual)
}

export async function TorcidaConsole({
  tenantId,
  tenantNome,
}: {
  tenantId: string
  tenantNome: string
}) {
  const worktree: TorcidaWorktreeNode[] = await getTorcidaWorktree(tenantId)

  // Garante pelo menos a raiz do tenant se não houver nenhuma Sede cadastrada.
  const nodes: TorcidaWorktreeNode[] =
    worktree.length > 0
      ? worktree
      : [
          {
            key: `tenant-root:${tenantId}`,
            sedeId: null,
            tenantId,
            nome: tenantNome,
            tipo: 'SEDE',
            cidade: null,
            ativa: true,
            depth: 0,
            origem: 'tenant',
          },
        ]

  const sedeIdsLocais = nodes
    .filter((n) => n.origem === 'sede' && n.sedeId)
    .map((n) => n.sedeId as string)
  const raizSedeId =
    nodes.find((n) => n.origem === 'sede' && n.tipo === 'SEDE')?.sedeId ??
    nodes.find((n) => n.origem === 'sede')?.sedeId ??
    null
  const tenantFilhosIds = nodes.filter((n) => n.origem === 'tenant').map((n) => n.tenantId)

  const [agregadosSede, agregadosTenantFilho, agregadosSemSede]: [
    MembroPorSede[],
    MembroPorTenant[],
    MembroPorSede[],
  ] = await Promise.all([
    sedeIdsLocais.length > 0
      ? (db.saasMembro.groupBy({
          by: ['sedeId', 'tipo'],
          where: {
            tenantId,
            status: 'APROVADO',
            sedeId: { in: sedeIdsLocais },
          },
          _count: { _all: true },
        }) as Promise<MembroPorSede[]>)
      : Promise.resolve([]),
    tenantFilhosIds.length > 0
      ? (db.saasMembro.groupBy({
          by: ['tenantId', 'tipo'],
          where: { tenantId: { in: tenantFilhosIds }, status: 'APROVADO' },
          _count: { _all: true },
        }) as Promise<MembroPorTenant[]>)
      : Promise.resolve([]),
    // Membros do tenant sem sedeId → contam na SEDE raiz.
    db.saasMembro.groupBy({
      by: ['sedeId', 'tipo'],
      where: { tenantId, status: 'APROVADO', sedeId: null },
      _count: { _all: true },
    }) as Promise<MembroPorSede[]>,
  ])

  const porSede = new Map<string, { socios: number; torcedores: number }>()
  for (const linha of agregadosSede) {
    if (!linha.sedeId) continue
    somarTipo(porSede, linha.sedeId, linha.tipo, linha._count._all)
  }
  if (raizSedeId) {
    for (const linha of agregadosSemSede) {
      somarTipo(porSede, raizSedeId, linha.tipo, linha._count._all)
    }
  }

  const porTenant = new Map<string, { socios: number; torcedores: number }>()
  for (const linha of agregadosTenantFilho) {
    somarTipo(porTenant, linha.tenantId, linha.tipo, linha._count._all)
  }

  const resumos: UnidadeResumo[] = nodes.map((u) => {
    const contagem =
      u.origem === 'sede' && u.sedeId
        ? (porSede.get(u.sedeId) ?? { socios: 0, torcedores: 0 })
        : (porTenant.get(u.tenantId) ?? { socios: 0, torcedores: 0 })
    return {
      ...u,
      socios: contagem.socios,
      torcedores: contagem.torcedores,
      afiliados: contagem.socios + contagem.torcedores,
    }
  })

  const totalAfiliados = resumos.reduce((soma, u) => soma + u.afiliados, 0)
  const totalSocios = resumos.reduce((soma, u) => soma + u.socios, 0)
  const unidadesTerritoriais = resumos.filter((u) => u.tipo !== 'SEDE' || u.depth > 0).length
  const soRaiz = resumos.length <= 1

  const totais = [
    { label: 'Afiliados na torcida', value: totalAfiliados, Icon: Users },
    { label: 'Sócios com vínculo ativo', value: totalSocios, Icon: CreditCard },
    { label: 'Unidades na árvore', value: resumos.length, Icon: MapPin },
  ]

  if (soRaiz && totalAfiliados === 0) {
    return (
      <MotionEmptyState
        icon={<Building2 className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Sua torcida ainda está começando"
        description="Quando houver afiliados aprovados e unidades cadastradas em Sedes, a árvore consolidada aparece aqui."
      />
    )
  }

  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-3">
        {totais.map((kpi, i) => (
          <MotionReveal key={kpi.label} index={i}>
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
              <div className="flex items-center gap-2 text-[rgb(var(--foreground-muted))]">
                <kpi.Icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">{kpi.label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-[rgb(var(--foreground))]">{kpi.value}</p>
            </div>
          </MotionReveal>
        ))}
      </div>

      <MotionReveal index={3}>
        <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Unidade
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden md:table-cell">
                  Cidade
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Afiliados
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Sócios
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {resumos.map((u) => (
                <tr key={u.key} className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]">
                  <td className="px-4 py-3">
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: `${u.depth * 1.25}rem` }}
                    >
                      {u.depth > 0 && (
                        <span
                          aria-hidden
                          className="mr-1 inline-block h-3 w-3 shrink-0 border-b border-l border-[rgb(var(--border))]"
                        />
                      )}
                      <span className="font-medium text-[rgb(var(--foreground))]">{u.nome}</span>
                      {u.origem === 'tenant' && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          Tenant
                        </span>
                      )}
                      {!u.ativa && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                          Inativa
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        TIPO_BADGE_CLASS[u.tipo] ?? TIPO_BADGE_CLASS.PONTO_ENCONTRO,
                      ].join(' ')}
                    >
                      {TIPO_LABEL[u.tipo] ?? u.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">{u.cidade ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[rgb(var(--foreground))]">
                    {u.afiliados}
                  </td>
                  <td className="px-4 py-3 text-right text-[rgb(var(--foreground-muted))]">
                    {u.socios}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MotionReveal>

      {unidadesTerritoriais === 0 ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Só a Sede aparece na árvore. Cadastre subsedes e PDEs em{' '}
          <Link href="/admin/sedes" className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline">
            Sedes
          </Link>{' '}
          (mesma estrutura do onboarding) para consolidar toda a torcida aqui.
        </p>
      ) : (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Contagens por unidade usam o vínculo de sede do afiliado (onboarding). Afiliados sem
          unidade contam na Sede raiz. Sócios = membros aprovados com tipo sócio.
        </p>
      )}
    </div>
  )
}
