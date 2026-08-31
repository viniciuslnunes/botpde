import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarFornecedoresBar } from '@/lib/bar'
import type { BarFornecedorLite } from '@/lib/bar'
import { BarFornecedoresSection, type BarFornecedorItem } from '@/components/admin/bar/bar-fornecedores'
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
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-[rgb(var(--foreground))]">Fornecedores do bar</h2>
        <Link
          href="/admin/bar/estoque"
          className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Voltar ao estoque
        </Link>
      </div>

      <BarFornecedoresSection fornecedores={itens} />
    </>
  )
}
