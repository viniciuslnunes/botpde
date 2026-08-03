import { db, type Prisma } from '@torcida/db'
import Link from 'next/link'
import { PERMISSIONS } from '@torcida/types'
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
import { Layers } from 'lucide-react'
import type { Metadata } from 'next'

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
    departamento: { nome: string; slug: string; cor: string }
    _count: { membros: number }
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
        departamento: { select: { nome: true, slug: true, cor: true } },
        _count: { select: { membros: true } },
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
              'Rode `pnpm --filter @torcida/db seed:departamento-areas` para semear as áreas canônicas, ou crie as frentes de trabalho no portal do departamento.',
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
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-t border-[rgb(var(--border))]">
                <td className="px-4 py-3">
                  <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                    {a.nome}
                  </span>
                  {a.descricao && (
                    <span className="mt-0.5 block max-w-md text-xs text-[rgb(var(--foreground-muted))]">
                      {a.descricao}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/portal/departamentos/${a.departamento.slug}#areas`}
                    className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground))] hover:underline"
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
                  {a._count.membros}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
    </div>
  )
}
