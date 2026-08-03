import { db, type Prisma } from '@torcida/db'
import Link from 'next/link'
import {
  PERMISSIONS,
  labelStatusProjeto,
  labelTipoProjeto,
  progressoMeta,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  ListagemVazia,
  TableShell,
} from '@/components/admin/ui'
import { parseListagemParams, type ListagemFacetas } from '@/lib/listagem'
import { LISTAGEM_DEPARTAMENTO_PROJETOS } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { Target } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Projetos — Departamentos' }

const SPEC = LISTAGEM_DEPARTAMENTO_PROJETOS

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})
const numero = new Intl.NumberFormat('pt-BR')

export default async function DepartamentoProjetosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  const where: Prisma.ProjetoWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { tenantId: tenant.id },
  })

  type ProjetoRow = {
    id: string
    titulo: string
    tipo: string
    status: string
    inicio: Date
    fim: Date | null
    metaQuantidade: number | null
    metaUnidade: string | null
    realizadoQuantidade: number
    area: { nome: string } | null
    departamento: { nome: string; slug: string; cor: string }
  }

  const [projetos, total]: [ProjetoRow[], number] = await Promise.all([
    db.projeto.findMany({
      where,
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
      select: {
        id: true,
        titulo: true,
        tipo: true,
        status: true,
        inicio: true,
        fim: true,
        metaQuantidade: true,
        metaUnidade: true,
        realizadoQuantidade: true,
        area: { select: { nome: true } },
        departamento: { select: { nome: true, slug: true, cor: true } },
      },
    }),
    db.projeto.count({ where }),
  ])

  const paginacao = resumirPaginacao(total, listagem)

  const facetas: ListagemFacetas = await carregarFacetas(
    SPEC,
    listagem,
    { escopo: { tenantId: tenant.id } },
    async (campo, whereFaceta) => {
      const linhas = await db.projeto.groupBy({
        by: [campo as 'status'],
        where: whereFaceta as Prisma.ProjetoWhereInput,
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
        filtrosCompactos={[{ filtroId: 'status' }, { filtroId: 'tipo' }]}
      />

      {projetos.length === 0 ? (
        <ListagemVazia
          spec={SPEC}
          params={listagem}
          vazio={{
            icon: (
              <Target
                className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ),
            title: 'Nenhum projeto cadastrado',
            description:
              'Campanhas, projetos e ações são cadastrados pelo gestor no portal do departamento — aqui fica a visão consolidada da torcida.',
          }}
        />
      ) : (
        <TableShell empty={{ title: 'Sem projetos' }} isEmpty={false}>
          <thead>
            <tr>
              {SPEC.colunas.map((coluna) => (
                <ListagemTh
                  key={coluna.id}
                  spec={SPEC}
                  params={listagem}
                  coluna={coluna}
                  facetas={facetas}
                  className={
                    coluna.id === 'inicio'
                      ? 'hidden lg:table-cell'
                      : coluna.id === 'tipo'
                        ? 'hidden sm:table-cell'
                        : undefined
                  }
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {projetos.map((p) => {
              const pct = progressoMeta(p.realizadoQuantidade, p.metaQuantidade)
              return (
                <tr key={p.id} className="border-t border-[rgb(var(--border))]">
                  <td className="px-4 py-3">
                    <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                      {p.titulo}
                    </span>
                    {p.area && (
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        {p.area.nome}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/portal/departamentos/${p.departamento.slug}#projetos`}
                      className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground))] hover:underline"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.departamento.cor }}
                        aria-hidden
                      />
                      {p.departamento.nome}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] sm:table-cell">
                    {labelTipoProjeto(p.tipo)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
                    {labelStatusProjeto(p.status)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[rgb(var(--foreground))]">
                    {pct == null ? (
                      <span className="text-[rgb(var(--foreground-muted))]">—</span>
                    ) : (
                      <span title={`${numero.format(p.realizadoQuantidade)} de ${numero.format(p.metaQuantidade ?? 0)} ${p.metaUnidade ?? ''}`.trim()}>
                        {pct}%
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-sm text-[rgb(var(--foreground-muted))] lg:table-cell">
                    {fmtData.format(p.inicio)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      )}

      <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
    </div>
  )
}
