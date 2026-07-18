import { redirect } from 'next/navigation'
import { Beer } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listarCategoriasBar, listarProdutosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarCategoriaLite, BarProdutoLite } from '@/lib/bar'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import { BarCardapio } from '@/components/portal/bar/bar-cardapio'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bar' }

export default async function PortalBarPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id)

  const [produtos, categorias]: [BarProdutoLite[], BarCategoriaLite[]] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id, { apenasAtivos: true }),
    listarCategoriasBar(tenant.id, unidade.id),
  ])

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }))

  const itens = produtos.map((p) => {
    const s = serializeProdutoBar(p)
    return {
      id: s.id,
      nome: s.nome,
      descricao: s.descricao,
      preco: s.preco,
      imagemUrl: s.imagemUrl,
      destaque: s.destaque,
      estoque: s.estoque,
      categoria: s.categoria,
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionReveal>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--primary)_/_0.14)] to-transparent p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.18)] text-[rgb(var(--color-primary-fg))]">
              <Beer className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Bar</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {unidade.nome} — cardápio do balcão.
              </p>
            </div>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <BarCardapio produtos={itens} categorias={categoriasAtivas} />
      </MotionReveal>
    </div>
  )
}
