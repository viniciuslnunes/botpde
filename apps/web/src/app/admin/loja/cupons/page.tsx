import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarCupomForm, toggleCupomForm } from '../actions'
import { AdminActionForm } from '@/components/admin/admin-action-form'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { ArrowLeft, Ticket } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cupons — Loja Admin' }

function formatarValor(tipo: string, valor: unknown) {
  if (tipo === 'PERCENTUAL') return `${Number(valor)}%`
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor))
}

export default async function AdminCuponsPage() {
  try {
    await assertPermission(PERMISSIONS.STORE_MANAGE)
  } catch {
    redirect('/admin')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const cupons = await db.saasCupom.findMany({
    where: { tenantId: tenant.id },
    orderBy: { criadoEm: 'desc' },
  })

  return (
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <Link href="/admin/loja" className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
          <ArrowLeft className="h-4 w-4" /> Loja
        </Link>
        <h1 className="mt-3 text-xl font-bold">Cupons</h1>
      </MotionReveal>

      <MotionReveal index={1}>
      <AdminActionForm
        action={criarCupomForm}
        success="Cupom criado."
        interpretResult
        className="space-y-3 rounded-2xl border border-[rgb(var(--border))] p-4"
      >
        <h2 className="text-sm font-semibold">Novo cupom</h2>
        <input name="codigo" required placeholder="Código (ex.: EUSOUGAVIAO)" className="w-full rounded-lg border px-3 py-2 text-sm uppercase" />
        <select name="tipo" className="w-full rounded-lg border px-3 py-2 text-sm">
          <option value="PERCENTUAL">Percentual (%)</option>
          <option value="FIXO">Valor fixo (R$)</option>
        </select>
        <input name="valor" type="number" step="0.01" required placeholder="Valor" className="w-full rounded-lg border px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="primeiraCompra" /> Apenas primeira compra
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked /> Ativo
        </label>
        <button type="submit" className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm text-white">Criar cupom</button>
      </AdminActionForm>
      </MotionReveal>

      {cupons.length === 0 ? (
        <MotionEmptyState
          icon={<Ticket className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhum cupom ainda"
          description="Crie um código de desconto para o checkout da loja."
        />
      ) : (
      <MotionReveal index={2}>
      <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border">
        {cupons.map((c: (typeof cupons)[number]) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-mono font-bold">{c.codigo}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {formatarValor(c.tipo, c.valor)}
                {c.primeiraCompra ? ' · 1ª compra' : ''}
                {!c.ativo ? ' · inativo' : ''}
              </p>
            </div>
            <AdminActionForm
              action={toggleCupomForm}
              success={c.ativo ? 'Cupom desativado.' : 'Cupom ativado.'}
              confirm={
                c.ativo
                  ? {
                      titulo: `Desativar o cupom “${c.codigo}”?`,
                      descricao: 'Ele deixa de valer no checkout até ser reativado.',
                      labelConfirmar: 'Desativar',
                      cancelled: 'Desativação cancelada.',
                    }
                  : undefined
              }
            >
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="ativo" value={String(!c.ativo)} />
              <button type="submit" className="text-xs font-medium">
                {c.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </AdminActionForm>
          </li>
        ))}
      </ul>
      </MotionReveal>
      )}
    </div>
  )
}
