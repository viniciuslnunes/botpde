import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarRange, Flag, ShieldAlert, Timer, Wrench } from 'lucide-react'
import { PERMISSIONS, resolverEscopoPatrimonio } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { carregarDirecaoBandeiras } from '@/lib/bandeiras'
import { listarEmprestimosPatrimonio } from '@/lib/patrimonio'
import { BandeirasAcervoLista } from '@/components/patrimonio/bandeiras-acervo-lista'
import { MarcarDanoEmprestimoForm } from '@/components/patrimonio/marcar-dano-emprestimo-form'
import {
  AdminInboxList,
  AdminPageHeader,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  DirecaoListaSkeleton,
  KpiGrid,
  StatCard,
} from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bandeiras — Admin' }

async function BandeirasKpis({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoBandeiras(tenantId)
  const semLiberacao = ops.semVistoria + ops.vistoriaVencendo
  return (
    <KpiGrid cols={4}>
      <StatCard
        label="No acervo"
        value={ops.resumo.totalAtivos}
        icon={<Flag className="h-5 w-5" />}
      />
      <StatCard
        label="Fora agora"
        value={ops.emprestimosAbertos}
        tone={ops.atrasados > 0 ? 'warning' : 'default'}
        icon={<Timer className="h-5 w-5" />}
        href="/admin/bandeiras#em-uso"
      />
      <StatCard
        label="Sem liberação em dia"
        value={semLiberacao}
        tone={semLiberacao > 0 ? 'warning' : 'default'}
        icon={<ShieldAlert className="h-5 w-5" />}
        href="/admin/bandeiras#acervo"
      />
      <StatCard
        label="Jogos em 14 dias"
        value={ops.jogosProximos}
        icon={<CalendarRange className="h-5 w-5" />}
        href="/admin/eventos?vista=semana"
      />
    </KpiGrid>
  )
}

async function BandeirasCorpo({
  tenantId,
  podeGerir,
}: {
  tenantId: string
  podeGerir: boolean
}) {
  const [ops, emprestimos] = await Promise.all([
    carregarDirecaoBandeiras(tenantId),
    listarEmprestimosPatrimonio(tenantId, {
      status: 'ABERTO',
      limite: 24,
      escopoCategoria: 'BANDEIRA',
    }),
  ])

  return (
    <>
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Precisa de você</h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Bandeira fora há tempo demais, liberação vencida e peça em conserto.
          </p>
        </div>
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Nada represado no trapo."
          emptyDescription="Acervo guardado, liberações em dia."
        />
      </section>

      {emprestimos.length > 0 && (
        <section id="em-uso" className="scroll-mt-20 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Fora agora</h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Quem está com cada bandeira — confira a foto da saída e marque dano se voltou rasgada.
            </p>
          </div>
          <ul className="space-y-2">
            {emprestimos.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                      {e.item.nome}
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                      Com {e.user.nome ?? 'membro'} · desde{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(e.abertoEm)}
                    </p>
                  </div>
                  <a
                    href={e.fotoSaidaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Ver foto saída
                  </a>
                </div>
                {podeGerir ? <MarcarDanoEmprestimoForm emprestimoId={e.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="acervo" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Acervo</h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Cada peça com medidas, mastro e validade da liberação de entrada.
            </p>
          </div>
          <Link
            href="/portal/patrimonio?categoria=BANDEIRA"
            className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Cadastrar / editar itens
          </Link>
        </div>
        <BandeirasAcervoLista itens={ops.itens} podeGerir={podeGerir} />
      </section>
    </>
  )
}

export default async function AdminBandeirasPage() {
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.FLAGS_MANAGE,
      PERMISSIONS.PATRIMONY_MANAGE,
    ])
    tenant = authz.tenant
    const escopo = resolverEscopoPatrimonio(authz.permissoesEfetivas ?? [], {
      isSuperAdmin: Boolean(authz.isSuperAdmin),
    })
    podeGerir = escopo.podeGerirBandeiras
  } catch {
    redirect('/admin')
  }

  return (
    <>
      <AdminPageHeader
        title="Bandeiras"
        description="O trapo da torcida — acervo, liberação de entrada e escala de jogo."
        icon={<Flag className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/eventos?vista=semana"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Escala da semana
            </Link>
            <Link
              href="/portal/patrimonio?categoria=BANDEIRA&status=MANUTENCAO"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              <Wrench className="h-4 w-4" aria-hidden />
              Em conserto
            </Link>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Posto de comando do departamento de Bandeiras. O acervo é o mesmo inventário do
            Patrimônio, recortado na categoria Bandeira — quem tem acesso só aqui não enxerga
            mesas, cadeiras nem instrumentos.
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={4} />}>
          <BandeirasKpis tenantId={tenant.id} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <BandeirasCorpo tenantId={tenant.id} podeGerir={podeGerir} />
        </Suspense>
      </div>
    </>
  )
}
