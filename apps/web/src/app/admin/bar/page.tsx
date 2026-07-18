import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Beer, Boxes, CupSoda, ReceiptText, Store } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { listarEstoqueBaixo, resolveUnidadeBar, resumirVendasBar } from '@/lib/bar'
import type { BarProdutoLite, BarUnidadeLite, BarVendasResumo } from '@/lib/bar'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bar — Admin' }

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function rotuloTipo(tipo: BarUnidadeLite['tipo']) {
  if (tipo === 'SEDE') return 'Sede'
  if (tipo === 'SUBSEDE') return 'Subsede'
  return 'PDE'
}

export default async function AdminBarPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE]))
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

  const [resumoHoje, estoqueBaixo]: [BarVendasResumo, BarProdutoLite[]] = await Promise.all([
    resumirVendasBar(tenant.id, unidade.id, { desde: inicioDoDia }),
    listarEstoqueBaixo(tenant.id, unidade.id),
  ])

  return (
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <Beer className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Bar</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {rotuloTipo(unidade.tipo)} · {unidade.nome} — estoque e vendas desta unidade.
            </p>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <Link
          href="/admin/bar/pdv"
          className="flex items-center justify-between gap-4 rounded-2xl bg-[rgb(var(--primary))] px-6 py-5 text-white transition-opacity hover:opacity-90"
        >
          <div className="flex items-center gap-4">
            <Store className="h-8 w-8" />
            <div>
              <p className="text-lg font-bold">Abrir PDV</p>
              <p className="text-sm opacity-90">Registrar vendas no balcão</p>
            </div>
          </div>
          <span aria-hidden className="text-2xl">
            →
          </span>
        </Link>
      </MotionReveal>

      <MotionReveal index={2}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Vendido hoje (pago)</p>
            <p className="mt-1 text-2xl font-bold text-[rgb(var(--color-success-fg))]">
              {formatarPreco(resumoHoje.totalPago)}
            </p>
          </div>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Vendas pagas hoje</p>
            <p className="mt-1 text-2xl font-bold text-[rgb(var(--foreground))]">
              {resumoHoje.quantidade}
            </p>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={3}>
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

      <MotionReveal index={4}>
        <div className="flex flex-wrap gap-2">
          {podeGerir && (
            <>
              <Link
                href="/admin/bar/produtos"
                className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
              >
                <CupSoda className="h-4 w-4" /> Produtos
              </Link>
              <Link
                href="/admin/bar/estoque"
                className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
              >
                <Boxes className="h-4 w-4" /> Estoque
              </Link>
            </>
          )}
          <Link
            href="/admin/bar/vendas"
            className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
          >
            <ReceiptText className="h-4 w-4" /> Vendas
          </Link>
        </div>
      </MotionReveal>
    </div>
  )
}
