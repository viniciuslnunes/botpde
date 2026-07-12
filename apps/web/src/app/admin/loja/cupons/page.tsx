import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarCupomForm, toggleCupomForm } from '../actions'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cupons — Loja Admin' }

function formatarValor(tipo: string, valor: unknown) {
  if (tipo === 'PERCENTUAL') return `${Number(valor)}%`
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor))
}

export default async function AdminCuponsPage() {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const cupons = await db.saasCupom.findMany({
    where: { tenantId: tenant.id },
    orderBy: { criadoEm: 'desc' },
  })

  return (
    <div className="app-container space-y-6 py-8">
      <Link href="/admin/loja" className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
        <ArrowLeft className="h-4 w-4" /> Loja
      </Link>
      <h1 className="text-xl font-bold">Cupons</h1>

      <form action={criarCupomForm} className="rounded-2xl border border-[rgb(var(--border))] p-4 space-y-3">
        <h2 className="font-semibold text-sm">Novo cupom</h2>
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
      </form>

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
            <form action={toggleCupomForm}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="ativo" value={String(!c.ativo)} />
              <button type="submit" className="text-xs font-medium">{c.ativo ? 'Desativar' : 'Ativar'}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
