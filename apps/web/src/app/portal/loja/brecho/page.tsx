import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import {
  BRECHO_CATEGORIA,
  BRECHO_MODALIDADE,
  BRECHO_PAGE_SIZE,
  BrechoFeedQuerySchema,
} from '@torcida/types'
import { resolverContextoBrecho } from '@/lib/brecho-escopo'
import { getMinhaLojaBrecho, listarFeedBrecho, anuncioParaGridItem } from '@/lib/brecho'
import { LojaProdutoGridAnimated, type LojaProdutoGridItem } from '@/components/portal/loja-produto-grid-animated'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Filter, Recycle } from 'lucide-react'
import { BrechoAviso, BrechoChrome } from './_components/brecho-chrome'
import type { Metadata } from 'next'
import { AppButton } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Brechó da torcida' }

export default async function PortalBrechoFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const ctx = await resolverContextoBrecho(session.user.id, session.user.email)
  if (!ctx) {
    return (
      <div className="space-y-6">
        <BrechoChrome title="Brechó" />
        <MotionEmptyState
          icon={<Recycle className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Brechó só para sócios desta torcida"
          description="O catálogo oficial desta unidade continua em Lojas. Anúncios de outra torcida não entram aqui."
        />
      </div>
    )
  }

  const params = await searchParams
  const first = (k: string) => {
    const v = params[k]
    return Array.isArray(v) ? v[0] : v
  }
  const parsed = BrechoFeedQuerySchema.safeParse({
    q: first('q'),
    categoria: first('categoria') || undefined,
    modalidade: first('modalidade') || undefined,
    sort: first('sort') || 'confiaveis',
    pagina: first('pagina') ?? '1',
  })
  const query = parsed.success
    ? parsed.data
    : { sort: 'confiaveis' as const, pagina: 1 }

  const [{ itens, total }, minha] = await Promise.all([
    listarFeedBrecho(ctx, {
      q: query.q,
      categoria: query.categoria,
      modalidade: query.modalidade,
      sort: query.sort,
      pagina: query.pagina,
    }),
    getMinhaLojaBrecho(ctx),
  ])

  const produtos: LojaProdutoGridItem[] = itens.map(anuncioParaGridItem)

  const totalPaginas = Math.max(1, Math.ceil(total / BRECHO_PAGE_SIZE))
  const href = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    const q = over.q ?? query.q
    const cat = over.categoria ?? query.categoria
    const mod = over.modalidade ?? query.modalidade
    const sort = over.sort ?? query.sort
    const pagina = over.pagina
    if (q) sp.set('q', q)
    if (cat) sp.set('categoria', cat)
    if (mod) sp.set('modalidade', mod)
    if (sort && sort !== 'confiaveis') sp.set('sort', sort)
    if (pagina && pagina !== '1') sp.set('pagina', pagina)
    const qs = sp.toString()
    return qs ? `/portal/loja/brecho?${sp}` : '/portal/loja/brecho'
  }

  return (
    <div className="space-y-6">
      <BrechoChrome
        title="Brechó"
        description="Troca, doação e venda combinada entre sócios da torcida. Sem checkout — interesse abre conversa."
        minhaLoja={Boolean(minha)}
      />
      <BrechoAviso />

      <form className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" action="/portal/loja/brecho">
        <input
          name="q"
          defaultValue={query.q ?? ''}
          placeholder="Buscar camisa, tamanho…"
          className="min-w-0 flex-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        />
        <select
          name="categoria"
          defaultValue={query.categoria ?? ''}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        >
          <option value="">Todas as categorias</option>
          {Object.entries(BRECHO_CATEGORIA).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          name="modalidade"
          defaultValue={query.modalidade ?? ''}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        >
          <option value="">Todas as modalidades</option>
          {Object.entries(BRECHO_MODALIDADE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={query.sort}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        >
          <option value="confiaveis">Confiáveis primeiro</option>
          <option value="recentes">Recentes</option>
        </select>
        <AppButton variant="none" icon={Filter} type="submit" className="app-action rounded-xl border border-[rgb(var(--border))] px-4 font-medium">
          Filtrar
        </AppButton>
      </form>

      <div className="flex gap-2 font-mono text-[11px] uppercase tracking-wider">
        <Link
          href={href({ sort: 'confiaveis', pagina: undefined })}
          className={query.sort === 'confiaveis' ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]'}
        >
          Confiáveis
        </Link>
        <Link
          href={href({ sort: 'recentes', pagina: undefined })}
          className={query.sort === 'recentes' ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]'}
        >
          Recentes
        </Link>
      </div>

      {produtos.length === 0 ? (
        <MotionEmptyState
          icon={<Recycle className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhum anúncio ainda"
          description="Abra sua loja e publique o primeiro item. Só sócios aprovados negociam aqui."
        />
      ) : (
        <LojaProdutoGridAnimated produtos={produtos} />
      )}

      {totalPaginas > 1 ? (
        <div className="flex justify-center gap-2">
          {query.pagina > 1 ? (
            <Link href={href({ pagina: String(query.pagina - 1) })} className="app-action px-3">
              Anterior
            </Link>
          ) : null}
          <span className="py-2 font-mono text-sm">
            {query.pagina}/{totalPaginas}
          </span>
          {query.pagina < totalPaginas ? (
            <Link href={href({ pagina: String(query.pagina + 1) })} className="app-action px-3">
              Próxima
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
