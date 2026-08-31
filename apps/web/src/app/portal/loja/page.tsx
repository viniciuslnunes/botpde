import { db } from '@torcida/db'
import {
  listLojasDoSocio,
  tenantsVisiveisLoja,
  podeGerirLoja,
} from '@/lib/loja-lojas'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { Package, Store } from 'lucide-react'
import { SacolaBadge } from '@/components/portal/loja-ui'
import {
  LojaProdutoGridAnimated,
  type LojaProdutoGridItem,
} from '@/components/portal/loja-produto-grid-animated'
import { estoqueTotal, percentualDesconto, nomeExibicaoVendedorBrecho } from '@torcida/types'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { LojaUnidadeCard } from './_components/loja-unidade-card'
import { BrechoHubCard } from './_components/brecho-hub-card'
import { resolverContextoBrecho } from '@/lib/brecho-escopo'
import { listarPracasBrecho, listarLojasBrecho } from '@/lib/brecho'
import type { Metadata } from 'next'

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

export const metadata: Metadata = { title: 'Lojas' }

export default async function PortalLojaListagemPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const userId = session.user.id
  const email = session.user.email

  const lojas = await listLojasDoSocio(userId, email)
  const ctxBrecho = await resolverContextoBrecho(userId, email)
  const tenantIdsComLoja = [...(await tenantsVisiveisLoja(userId, email))]

  type DestaqueLite = {
    id: string
    nome: string
    preco: unknown
    precoOriginal: unknown | null
    imagensUrl: string[]
    estoque: unknown
    tenantId: string
  }

  const [meusPedidos, sacolaCount, sacolaPorTenant, destaques, gerirFlags, pracasBrecho, rankingBrecho]: [
    number,
    { _sum: { quantidade: number | null } },
    Array<{ tenantId: string }>,
    DestaqueLite[],
    boolean[],
    Awaited<ReturnType<typeof listarPracasBrecho>>,
    Awaited<ReturnType<typeof listarLojasBrecho>>,
  ] = await Promise.all([
    db.saasPedido.count({
      where: { userId, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
    }),
    db.saasCarrinhoItem.aggregate({
      where: { userId, tenantId: { in: tenantIdsComLoja } },
      _sum: { quantidade: true },
    }),
    db.saasCarrinhoItem.groupBy({
      by: ['tenantId'],
      where: { userId, tenantId: { in: tenantIdsComLoja } },
      _count: { _all: true },
    }),
    tenantIdsComLoja.length > 0
      ? db.saasProduto.findMany({
          where: { tenantId: { in: tenantIdsComLoja }, ativo: true, destaque: true },
          orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
          take: 8,
          select: {
            id: true,
            nome: true,
            preco: true,
            precoOriginal: true,
            imagensUrl: true,
            estoque: true,
            tenantId: true,
          },
        })
      : Promise.resolve([]),
    Promise.all(lojas.map((l) => podeGerirLoja(userId, l.tenantId, email))),
    ctxBrecho ? listarPracasBrecho(ctxBrecho) : Promise.resolve([]),
    ctxBrecho
      ? listarLojasBrecho(ctxBrecho, { sort: 'confiaveis', pagina: 1, take: 2, soComAnuncio: true })
      : Promise.resolve({ lojas: [], total: 0 }),
  ])

  const destaqueItems: LojaProdutoGridItem[] = destaques.map((p) => {
    const sem = estoqueTotal(p.estoque as Record<string, number>)
    const off = percentualDesconto(p.precoOriginal, p.preco)
    return {
      id: p.id,
      nome: p.nome,
      href: `/portal/loja/${p.tenantId}/${p.id}`,
      precoLabel: formatarPreco(p.preco),
      precoOriginalLabel:
        p.precoOriginal && Number(p.precoOriginal) > Number(p.preco) ? formatarPreco(p.precoOriginal) : null,
      imagensUrl: p.imagensUrl,
      esgotado: sem === 0,
      descontoPct: off,
    }
  })

  const brechoDestaques = rankingBrecho.lojas

  const ancoraBrecho = lojas.find((l) => l.principal) ?? lojas[0] ?? null
  type CardBrechoHub = {
    key: string
    nome: string
    anunciosAtivos: number
    subtitulo: string
    logoUrl: string | null
    capaUrl: string | null
    corPrimaria?: string
  }
  const cardsBrecho: CardBrechoHub[] =
    pracasBrecho.length > 0
      ? pracasBrecho.map((praca) => {
          const loja = lojas.find((l) => l.tenantId === praca.raizId)
          return {
            key: praca.raizId,
            nome: loja?.nome ?? praca.nome,
            anunciosAtivos: praca.anunciosAtivos,
            subtitulo: praca.propria
              ? `Brechó · sócios${loja?.cidade ? ` · ${loja.cidade}` : ''}`
              : `Brechó aliada · sócios${loja?.cidade ? ` · ${loja.cidade}` : ''}`,
            logoUrl: loja?.logoUrl ?? null,
            capaUrl: loja?.capaUrl ?? null,
            corPrimaria: loja?.corPrimaria,
          }
        })
      : ancoraBrecho
        ? [
            {
              key: ancoraBrecho.tenantId,
              nome: ancoraBrecho.nome,
              anunciosAtivos: 0,
              subtitulo: `Brechó · sócios${ancoraBrecho.cidade ? ` · ${ancoraBrecho.cidade}` : ''}`,
              logoUrl: ancoraBrecho.logoUrl,
              capaUrl: ancoraBrecho.capaUrl,
              corPrimaria: ancoraBrecho.corPrimaria,
            },
          ]
        : []

  const sacolaLojasCount = sacolaPorTenant.length
  const cardBrecho = cardsBrecho[0] ?? null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            [ Selecione a unidade ]
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-4xl">
            Lojas
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[rgb(var(--foreground-muted))]">
            Cada unidade tem catálogo e estoque próprios. Escolha a loja para comprar.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <SacolaBadge
            count={sacolaCount._sum.quantidade ?? 0}
            lojasCount={sacolaLojasCount > 1 ? sacolaLojasCount : undefined}
          />
          <Link
            href="/portal/loja/pedidos"
            className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:px-4"
          >
            <Package className="h-4 w-4 shrink-0" />
            <span className="truncate">Pedidos</span>
            {meusPedidos > 0 && (
              <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-[rgb(var(--color-primary-on))]">
                {meusPedidos}
              </span>
            )}
          </Link>
        </div>
      </div>

      {lojas.length === 0 && cardsBrecho.length === 0 ? (
        <MotionEmptyState
          icon={<Store className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhuma loja disponível"
          description="Você ainda não tem um vínculo aprovado com uma torcida. Assim que entrar por convite ou for aprovado, a loja aparece aqui."
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
        />
      ) : (
        <>
          {lojas.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {lojas.map((loja, i) => (
                <LojaUnidadeCard key={loja.tenantId} loja={loja} podeGerir={gerirFlags[i] === true} />
              ))}
            </div>
          ) : null}

          {cardsBrecho.length > 0 ? (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
                    [ Praça entre sócios ]
                  </p>
                  <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-4xl">
                    Brechós
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-[rgb(var(--foreground-muted))]">
                    Troca, doação e venda entre sócios. As duas vitrines com mais confiança
                    aparecem aqui — cada uma abre a listagem de anúncios daquela loja.
                  </p>
                </div>
                {ctxBrecho ? (
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Link
                      href="/portal/loja/brecho/lojas"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))]"
                    >
                      Ranking
                    </Link>
                    <Link
                      href="/portal/loja/brecho/minha-loja"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--color-primary)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.08)]"
                    >
                      Minha loja
                    </Link>
                  </div>
                ) : null}
              </div>
              <div className="grid items-stretch gap-4 sm:grid-cols-3">
                {cardBrecho ? (
                  <BrechoHubCard
                    nome={cardBrecho.nome}
                    anunciosAtivos={cardBrecho.anunciosAtivos}
                    subtitulo={cardBrecho.subtitulo}
                    logoUrl={cardBrecho.logoUrl}
                    capaUrl={cardBrecho.capaUrl}
                    corPrimaria={cardBrecho.corPrimaria}
                  />
                ) : null}
                {brechoDestaques.map((loja) => {
                  const nomePessoa = nomeExibicaoVendedorBrecho({
                    nome: loja.user.nome,
                    nickname: loja.user.nickname,
                    lojaNome: loja.nome,
                  })
                  return (
                    <BrechoHubCard
                      key={loja.id}
                      nome={loja.nome}
                      anunciosAtivos={loja.anunciosAtivos}
                      subtitulo={nomePessoa}
                      logoUrl={loja.fotoUrl ?? loja.user.avatarUrl}
                      capaUrl={loja.capaUrl}
                      capaExibicao={loja.capaExibicao}
                      corPrimaria={ancoraBrecho?.corPrimaria}
                      href={`/portal/loja/brecho/lojas/${loja.userId}`}
                      podeGerir={loja.userId === userId}
                      confianca={{ estrelas: loja.estrelas, trocas: loja.trocasConcluidas }}
                    />
                  )
                })}
              </div>
            </section>
          ) : null}
        </>
      )}

      {destaqueItems.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
              [ Cross-loja ]
            </p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-4xl">
              Em destaque
            </h2>
          </div>
          <LojaProdutoGridAnimated produtos={destaqueItems} />
        </section>
      )}
    </div>
  )
}
