import { db } from '@torcida/db'
import { Users, CreditCard, MapPin, Building2 } from 'lucide-react'
import { getTenantHierarquia, type TenantHierarquiaNode } from '@/lib/hierarquia'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

const TIPO_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const TIPO_BADGE_CLASS: Record<string, string> = {
  SEDE: 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]',
  SUBSEDE: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  PONTO_ENCONTRO: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
}

interface UnidadeResumo extends TenantHierarquiaNode {
  afiliados: number
  socios: number
  torcedores: number
}

interface MembroAgregado {
  tenantId: string
  tipo: 'SOCIO' | 'TORCEDOR'
  _count: { _all: number }
}

export async function TorcidaConsole({
  tenantId,
  tenantNome,
}: {
  tenantId: string
  tenantNome: string
}) {
  const [{ descendentes }, sedePropria] = await Promise.all([
    getTenantHierarquia(tenantId),
    db.sede.findFirst({
      where: { tenantId },
      select: { cidade: true },
    }) as Promise<{ cidade: string | null } | null>,
  ])

  const unidades: TenantHierarquiaNode[] = [
    {
      tenantId,
      nome: tenantNome,
      tipo: 'SEDE',
      cidade: sedePropria?.cidade ?? null,
      ativa: true,
    },
    ...descendentes,
  ]
  const idsUnidades = unidades.map((u) => u.tenantId)

  // Uma query agregada para a torcida inteira — só membros APROVADOS contam.
  const agregados: MembroAgregado[] = await db.saasMembro.groupBy({
    by: ['tenantId', 'tipo'],
    where: { tenantId: { in: idsUnidades }, status: 'APROVADO' },
    _count: { _all: true },
  })

  const porUnidade = new Map<string, { socios: number; torcedores: number }>()
  for (const linha of agregados) {
    const atual = porUnidade.get(linha.tenantId) ?? { socios: 0, torcedores: 0 }
    if (linha.tipo === 'SOCIO') atual.socios += linha._count._all
    else atual.torcedores += linha._count._all
    porUnidade.set(linha.tenantId, atual)
  }

  const resumos: UnidadeResumo[] = unidades.map((u) => {
    const contagem = porUnidade.get(u.tenantId) ?? { socios: 0, torcedores: 0 }
    return {
      ...u,
      socios: contagem.socios,
      torcedores: contagem.torcedores,
      afiliados: contagem.socios + contagem.torcedores,
    }
  })

  // Sede primeiro, depois por afiliados desc.
  resumos.sort((a, b) => {
    if (a.tenantId === tenantId) return -1
    if (b.tenantId === tenantId) return 1
    return b.afiliados - a.afiliados
  })

  const totalAfiliados = resumos.reduce((soma, u) => soma + u.afiliados, 0)
  const totalSocios = resumos.reduce((soma, u) => soma + u.socios, 0)

  const totais = [
    { label: 'Afiliados na torcida', value: totalAfiliados, Icon: Users },
    { label: 'Sócios com vínculo ativo', value: totalSocios, Icon: CreditCard },
    { label: 'Unidades (Sede + subsedes/PDEs)', value: resumos.length, Icon: MapPin },
  ]

  if (descendentes.length === 0 && totalAfiliados === 0) {
    return (
      <MotionEmptyState
        icon={<Building2 className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Sua torcida ainda está começando"
        description="Quando a Sede tiver afiliados aprovados e subsedes/PDEs vinculadas na hierarquia, o consolidado de toda a torcida aparece aqui."
      />
    )
  }

  return (
    <div className="space-y-7">
      {/* Totais globais */}
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

      {/* Tabela por unidade */}
      <MotionReveal index={3}>
        <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Unidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden md:table-cell">Cidade</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Afiliados</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Sócios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {resumos.map((u) => (
                <tr key={u.tenantId} className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[rgb(var(--foreground))]">{u.nome}</span>
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
                  <td className="px-4 py-3 text-right font-medium text-[rgb(var(--foreground))]">{u.afiliados}</td>
                  <td className="px-4 py-3 text-right text-[rgb(var(--foreground-muted))]">{u.socios}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MotionReveal>

      {descendentes.length === 0 && (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Nenhuma subsede ou PDE vinculada ainda — cadastre a hierarquia em{' '}
          <span className="font-medium">Sedes</span> para consolidar toda a torcida aqui.
        </p>
      )}
    </div>
  )
}
