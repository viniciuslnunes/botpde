import { redirect } from 'next/navigation'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { listarCategoriasBar, listarProdutosBar, listarVendasBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarCategoriaLite, BarProdutoLite, BarVendaLite } from '@/lib/bar'
import { serializeProdutoBar, serializeVendaBar } from '@/lib/bar-serialize'
import { BarPdv } from '@/components/admin/bar/bar-pdv'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'PDV — Bar Admin' }

export default async function AdminBarPdvPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE]))
  } catch {
    redirect('/admin')
  }

  let podeCancelar = false
  try {
    await assertPermission(PERMISSIONS.BAR_MANAGE)
    podeCancelar = true
  } catch {
    // Operador do PDV sem gestão — não cancela vendas pendentes.
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const [produtos, categorias, pendentesLista]: [
    BarProdutoLite[],
    BarCategoriaLite[],
    Awaited<ReturnType<typeof listarVendasBar>>,
  ] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id, { apenasAtivos: true }),
    listarCategoriasBar(tenant.id, unidade.id),
    listarVendasBar(tenant.id, unidade.id, { status: 'PENDENTE', pageSize: 8 }),
  ])

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }))

  const pendentes: ReturnType<typeof serializeVendaBar>[] = (
    pendentesLista.itens as BarVendaLite[]
  ).map(serializeVendaBar)

  return (
    <BarPdv
      produtos={produtos.map(serializeProdutoBar)}
      categorias={categoriasAtivas}
      pendentes={pendentes}
      pendentesTotal={pendentesLista.total}
      unidadeNome={unidade.nome}
      podeCancelar={podeCancelar}
    />
  )
}
