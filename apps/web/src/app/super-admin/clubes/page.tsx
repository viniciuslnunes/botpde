import Link from 'next/link'
import type { Metadata } from 'next'
import { Shield } from 'lucide-react'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { completudeClube, rotuloSerieClube } from '@torcida/types'
import { Badge } from '@torcida/ui'
import { TableShell } from '@/components/admin/ui/table-shell'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  ListagemVazia,
} from '@/components/admin/ui/listagem'
import { parseListagemParams } from '@/lib/listagem'
import { LISTAGEM_SUPER_ADMIN_CLUBES } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { NovoClubeBotao } from './_components/clubes-modulo-chrome'

export const metadata: Metadata = { title: 'Clubes — Super Admin' }

const SPEC = LISTAGEM_SUPER_ADMIN_CLUBES

/** Referência global: `Afiliacao` não tem `tenantId` — a exceção é declarada. */
const ESCOPO = {
  global: true as const,
  motivo: 'Afiliacao é referência global do catálogo (super-admin)',
}

type ClubeRow = {
  id: string
  nome: string
  apelido: string | null
  slug: string | null
  serie: 'A' | 'B' | 'C' | 'D' | 'ESTADUAL' | 'OUTRA' | null
  estado: string | null
  cidade: string | null
  escudoUrl: string | null
  torcedoresEstimados: number | null
  ativo: boolean
  _count: { tenants: number }
}

const formatarNumero = (n: number) => n.toLocaleString('pt-BR')

export default async function ClubesCatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  const where: Prisma.AfiliacaoWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: ESCOPO,
  })

  const [clubes, total, facetas]: [
    ClubeRow[],
    number,
    Awaited<ReturnType<typeof carregarFacetas>>,
  ] = await Promise.all([
    db.afiliacao.findMany({
      where,
      select: {
        id: true,
        nome: true,
        apelido: true,
        slug: true,
        serie: true,
        estado: true,
        cidade: true,
        escudoUrl: true,
        torcedoresEstimados: true,
        ativo: true,
        _count: { select: { tenants: true } },
      },
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
    }),
    db.afiliacao.count({ where }),
    carregarFacetas(SPEC, listagem, { escopo: ESCOPO }, async (campo, whereFaceta) => {
      const filtro = whereFaceta as Prisma.AfiliacaoWhereInput
      if (campo === 'serie') {
        const linhas: { serie: ClubeRow['serie']; _count: { _all: number } }[] =
          await db.afiliacao.groupBy({ by: ['serie'], where: filtro, _count: { _all: true } })
        return linhas.map((l) => ({ valor: l.serie, count: l._count._all }))
      }
      if (campo === 'estado') {
        const linhas: { estado: string | null; _count: { _all: number } }[] =
          await db.afiliacao.groupBy({ by: ['estado'], where: filtro, _count: { _all: true } })
        return linhas.map((l) => ({ valor: l.estado, count: l._count._all }))
      }
      if (campo === 'ativo') {
        const linhas: { ativo: boolean; _count: { _all: number } }[] = await db.afiliacao.groupBy({
          by: ['ativo'],
          where: filtro,
          _count: { _all: true },
        })
        // URL/opções usam string; groupBy devolve boolean.
        return linhas.map((l) => ({ valor: l.ativo ? 'true' : 'false', count: l._count._all }))
      }
      return []
    }),
  ])

  const paginacao = resumirPaginacao(total, listagem)
  const colunaPorId = (id: string) => SPEC.colunas.find((c) => c.id === id)!

  const vazio = {
    icon: <Shield className="h-10 w-10" aria-hidden />,
    title: 'Nenhum clube no catálogo',
    description:
      'Cadastre o primeiro clube — ele passa a aparecer no onboarding e no seletor de contexto.',
  }

  return (
    <div className="space-y-4">
      <ListagemToolbar
        spec={SPEC}
        params={listagem}
        paginacao={paginacao}
        facetas={facetas}
        escopoChave="plataforma"
        acoes={<NovoClubeBotao />}
        filtrosCompactos={[
          { filtroId: 'serie', classe: 'sm:hidden' },
          { filtroId: 'estado', classe: 'sm:hidden' },
          { filtroId: 'completude' },
          { filtroId: 'situacao', classe: 'lg:hidden' },
        ]}
      />

      {clubes.length === 0 ? (
        // `ListagemVazia` separa "catálogo vazio" de "filtro sem resultado" —
        // sem isso o operador conclui que perdeu dados.
        <ListagemVazia spec={SPEC} params={listagem} vazio={vazio} />
      ) : (
        <>
          <TableShell isEmpty={false} empty={vazio}>
            <thead>
              <tr className="border-b border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]">
                <ListagemTh spec={SPEC} params={listagem} coluna={colunaPorId('nome')} />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('serie')}
                  facetas={facetas}
                  className="hidden sm:table-cell"
                />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('estado')}
                  facetas={facetas}
                  className="hidden sm:table-cell"
                />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('cidade')}
                  className="hidden xl:table-cell"
                />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('torcidas')}
                  className="hidden md:table-cell"
                />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('torcedoresEstimados')}
                  className="hidden xl:table-cell"
                />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('completude')}
                  className="hidden lg:table-cell"
                />
                <ListagemTh
                  spec={SPEC}
                  params={listagem}
                  coluna={colunaPorId('situacao')}
                  facetas={facetas}
                  className="hidden lg:table-cell"
                />
              </tr>
            </thead>
            <tbody>
              {clubes.map((clube) => {
                const { completo, faltando, percentual } = completudeClube(clube)
                return (
                  <tr
                    key={clube.id}
                    className="border-b border-[rgb(var(--border))] last:border-0 transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/super-admin/clubes/${clube.id}`}
                        className="app-action flex items-center gap-3"
                      >
                        <EscudoClube
                          nome={clube.nome}
                          apelido={clube.apelido}
                          escudoUrl={clube.escudoUrl}
                          size="xs"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[rgb(var(--foreground))]">
                            {clube.nome}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-[rgb(var(--foreground-muted))]">
                            {clube.slug ?? 'sem slug'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] sm:table-cell">
                      {clube.serie ? rotuloSerieClube(clube.serie) : '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] sm:table-cell">
                      {clube.estado || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] xl:table-cell">
                      {clube.cidade || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-sm tabular-nums text-[rgb(var(--foreground))] md:table-cell">
                      {clube._count.tenants}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-sm tabular-nums text-[rgb(var(--foreground-muted))] xl:table-cell">
                      {clube.torcedoresEstimados ? formatarNumero(clube.torcedoresEstimados) : '—'}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {completo ? (
                        <span className="text-xs font-medium text-[rgb(var(--color-success-fg))]">
                          Completo
                        </span>
                      ) : (
                        <span
                          className="text-xs font-medium text-[rgb(var(--color-warning-fg))]"
                          title={`Faltam: ${faltando.join(', ')}`}
                        >
                          {percentual}%
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Badge variant={clube.ativo ? 'success' : 'neutral'}>
                        {clube.ativo ? 'Ativo' : 'Arquivado'}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableShell>

          <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
        </>
      )}
    </div>
  )
}
