import { db, type Prisma } from '@torcida/db'
import Link from 'next/link'
import { PERMISSIONS, hrefHomeDepartamento } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  ListagemVazia,
  TableShell,
} from '@/components/admin/ui'
import { parseListagemParams, type ListagemFacetas } from '@/lib/listagem'
import { LISTAGEM_DEPARTAMENTO_AREAS } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { ArrowUpRight, Layers } from 'lucide-react'
import type { Metadata } from 'next'
import { AreaGestaoCelulas } from '../_components/area-gestao-celulas'

export const metadata: Metadata = { title: 'Áreas — Departamentos' }

const SPEC = LISTAGEM_DEPARTAMENTO_AREAS

export default async function DepartamentoAreasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  const where: Prisma.DepartamentoAreaWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { tenantId: tenant.id },
  })

  type AreaRow = {
    id: string
    nome: string
    descricao: string | null
    ativa: boolean
    sazonal: boolean
    departamento: { id: string; nome: string; slug: string; cor: string }
    _count: { membros: number }
    membros: Array<{ user: { nome: string | null; nickname: string | null } }>
  }

  const [areas, total]: [AreaRow[], number] = await Promise.all([
    db.departamentoArea.findMany({
      where,
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
      select: {
        id: true,
        nome: true,
        descricao: true,
        ativa: true,
        sazonal: true,
        departamento: { select: { id: true, nome: true, slug: true, cor: true } },
        _count: { select: { membros: true } },
        membros: {
          where: { papel: 'RESPONSAVEL' },
          take: 3,
          select: { user: { select: { nome: true, nickname: true } } },
        },
      },
    }),
    db.departamentoArea.count({ where }),
  ])

  const paginacao = resumirPaginacao(total, listagem)

  const facetas: ListagemFacetas = await carregarFacetas(
    SPEC,
    listagem,
    { escopo: { tenantId: tenant.id } },
    async (campo, whereFaceta) => {
      const linhas = await db.departamentoArea.groupBy({
        by: [campo as 'departamentoId'],
        where: whereFaceta as Prisma.DepartamentoAreaWhereInput,
        _count: { _all: true },
      })
      return linhas.map((linha: Record<string, unknown> & { _count: { _all: number } }) => ({
        valor: (linha[campo] as string | null) ?? null,
        count: linha._count._all,
      }))
    },
  )

  return (
    <div className="space-y-3">
      <ListagemToolbar
        spec={SPEC}
        params={listagem}
        paginacao={paginacao}
        facetas={facetas}
        escopoChave={tenant.id}
      />

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Clique na área para abrir no departamento, ou nomeie o responsável daqui — sem sair da lista.
      </p>

      {areas.length === 0 ? (
        <ListagemVazia
          spec={SPEC}
          params={listagem}
          vazio={{
            icon: (
              <Layers
                className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ),
            title: 'Nenhuma área cadastrada',
            description:
              'Rode `pnpm --filter @torcida/db seed:departamento-areas` para semear as áreas canônicas, ou abra um departamento na Visão e crie as frentes lá.',
          }}
        />
      ) : (
        <TableShell
          empty={{ title: 'Nenhuma área', description: '' }}
          isEmpty={false}
        >
          <thead>
            <tr>
              {SPEC.colunas.map((coluna) => (
                <ListagemTh
                  key={coluna.id}
                  spec={SPEC}
                  params={listagem}
                  coluna={coluna}
                  facetas={facetas}
                  className={coluna.id === 'sazonal' ? 'hidden sm:table-cell' : undefined}
                />
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Responsável
              </th>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-t border-[rgb(var(--border))]">
                <td className="px-4 py-3">
                  <Link
                    href={hrefHomeDepartamento(a.departamento.slug, 'areas', { area: a.id })}
                    className="group inline-flex max-w-md items-start gap-1.5"
                    aria-label={`Abrir ${a.nome} em ${a.departamento.nome}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[rgb(var(--foreground))] group-hover:underline">
                        {a.nome}
                      </span>
                      {a.descricao && (
                        <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                          {a.descricao}
                        </span>
                      )}
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]"
                      aria-hidden
                    />
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={hrefHomeDepartamento(a.departamento.slug, 'areas')}
                    className="app-touch-line inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground))] hover:underline"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: a.departamento.cor }}
                      aria-hidden
                    />
                    {a.departamento.nome}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
                  {a.ativa ? 'Ativa' : 'Inativa'}
                </td>
                <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] sm:table-cell">
                  {a.sazonal ? 'Sim' : '—'}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[rgb(var(--foreground))]">
                  <Link
                    href={hrefHomeDepartamento(a.departamento.slug, 'areas', { area: a.id })}
                    className="app-touch-line hover:underline"
                    aria-label={`${a._count.membros} ${a._count.membros === 1 ? 'pessoa' : 'pessoas'} em ${a.nome}`}
                  >
                    {a._count.membros}
                  </Link>
                </td>
                <AreaGestaoCelulas
                  areaId={a.id}
                  areaNome={a.nome}
                  departamentoId={a.departamento.id}
                  slug={a.departamento.slug}
                  href={hrefHomeDepartamento(a.departamento.slug, 'areas', { area: a.id })}
                  semResponsavel={a.membros.length === 0}
                  responsaveis={a.membros.map(
                    (m) => m.user.nome?.trim() || (m.user.nickname ? `@${m.user.nickname}` : 'Pessoa'),
                  )}
                />
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
    </div>
  )
}
