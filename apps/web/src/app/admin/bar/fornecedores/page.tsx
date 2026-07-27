import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarFornecedoresBar } from '@/lib/bar'
import type { BarFornecedorLite } from '@/lib/bar'
import { BarFornecedoresSection, type BarFornecedorItem } from '@/components/admin/bar/bar-fornecedores'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fornecedores — Bar Admin' }

export default async function AdminBarFornecedoresPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const fornecedores: BarFornecedorLite[] = await listarFornecedoresBar(tenant.id)
  const itens: BarFornecedorItem[] = fornecedores.map((f) => ({
    id: f.id,
    nome: f.nome,
    contato: f.contato,
    documento: f.documento,
    observacao: f.observacao,
    ativo: f.ativo,
  }))

  return (
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/bar"
            className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <ArrowLeft className="h-4 w-4" /> Bar
          </Link>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Fornecedores do bar</h1>
        </div>
      </MotionReveal>

      <BarFornecedoresSection fornecedores={itens} />
    </div>
  )
}
