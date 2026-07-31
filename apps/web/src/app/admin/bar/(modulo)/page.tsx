import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import {
  getTurnoAbertoBar,
  listarEstoqueBaixo,
  resolveUnidadeBar,
  resumirConsumoEmAbertoBar,
  resumirRecebidoBar,
  resumirTurnoBar,
} from '@/lib/bar'
import type { BarConsumoEmAbertoResumo, BarProdutoLite, BarVendasResumo } from '@/lib/bar'
import { listarComandasAbertasBar, type BarComandaAbertaLite } from '@/lib/bar-comanda'
import { BarTurnoPainel } from '@/components/admin/bar/bar-turno-painel'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bar — Admin' }

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

export default async function AdminBarPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ]))
  } catch {
    redirect('/admin')
  }

  let podeGerir = false
  try {
    await assertPermission(PERMISSIONS.BAR_MANAGE)
    podeGerir = true
  } catch {
    // Operador do PDV sem gestão de catálogo/estoque.
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)

  const turno = await getTurnoAbertoBar(tenant.id, unidade.id)

  const [resumoHoje, estoqueBaixo, resumoTurno, comandasAbertas, consumoAberto]: [
    BarVendasResumo,
    BarProdutoLite[],
    Awaited<ReturnType<typeof resumirTurnoBar>> | null,
    BarComandaAbertaLite[],
    BarConsumoEmAbertoResumo,
  ] = await Promise.all([
    resumirRecebidoBar(tenant.id, unidade.id, { desde: inicioDoDia }),
    listarEstoqueBaixo(tenant.id, unidade.id),
    turno ? resumirTurnoBar(tenant.id, turno.id) : Promise.resolve(null),
    listarComandasAbertasBar(tenant.id, unidade.id),
    resumirConsumoEmAbertoBar(tenant.id, unidade.id),
  ])

  return (
    <>
      <MotionReveal>
        <BarTurnoPainel
          turno={
            turno
              ? {
                  id: turno.id,
                  abertoEm: turno.abertoEm.toISOString(),
                  abertoPorNome: turno.abertoPor.nome,
                }
              : null
          }
          resumo={resumoTurno}
          podeGerir={podeGerir}
          comandasAbertas={comandasAbertas.map((c) => ({
            id: c.id,
            codigo: c.codigo,
            total: Number(c.total),
          }))}
        />
      </MotionReveal>

      <MotionReveal index={1}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Recebido hoje</p>
            <p className="mt-1 text-2xl font-bold text-[rgb(var(--color-success-fg))]">
              {formatarPreco(resumoHoje.totalPago)}
            </p>
          </div>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Eventos recebidos hoje</p>
            <p className="mt-1 text-2xl font-bold text-[rgb(var(--foreground))]">
              {resumoHoje.quantidade}
            </p>
          </div>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Consumo em aberto</p>
            <p
              className={[
                'mt-1 text-2xl font-bold',
                consumoAberto.total > 0
                  ? 'text-[rgb(var(--color-warning-fg))]'
                  : 'text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {formatarPreco(consumoAberto.total)}
            </p>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={2}>
        <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <AlertTriangle className="h-4 w-4 text-[rgb(var(--color-warning-fg))]" />
              Estoque baixo
            </h2>
            {podeGerir && (
              <Link
                href="/admin/bar/estoque"
                className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Ir para o estoque
              </Link>
            )}
          </div>
          {estoqueBaixo.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Tudo em ordem — nenhum produto abaixo do estoque mínimo.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border))]">
              {estoqueBaixo.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">{p.nome}</p>
                  <p className="text-sm text-[rgb(var(--color-warning-fg))]">
                    {p.estoque} un. (mínimo {p.estoqueMinimo})
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </MotionReveal>
    </>
  )
}
