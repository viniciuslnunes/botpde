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
import { LISTAGEM_DEPARTAMENTO_EQUIPES } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { Users } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Equipes — Departamentos' }

const SPEC = LISTAGEM_DEPARTAMENTO_EQUIPES

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function DepartamentoEquipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  // `DepartamentoAreaMembro` não tem `tenantId` próprio: o recorte por torcida
  // vem da relação com a área, no `extra` (contrato `viaRelacao` do módulo).
  const escopoViaArea = { area: { tenantId: tenant.id } } as const
  const opcoesEscopo = {
    escopo: { tenantId: tenant.id, viaRelacao: true },
    extra: [escopoViaArea],
  } as const

  const where: Prisma.DepartamentoAreaMembroWhereInput = montarWhereListagem(
    SPEC,
    listagem,
    opcoesEscopo,
  )

  type VinculoRow = {
    areaId: string
    userId: string
    papel: string
    criadoEm: Date
    user: { nome: string | null; nickname: string | null; email: string }
    area: { nome: string; departamento: { nome: string; slug: string; cor: string } }
  }

  const [vinculos, total]: [VinculoRow[], number] = await Promise.all([
    db.departamentoAreaMembro.findMany({
      where,
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
      select: {
        areaId: true,
        userId: true,
        papel: true,
        criadoEm: true,
        user: { select: { nome: true, nickname: true, email: true } },
        area: {
          select: { nome: true, departamento: { select: { nome: true, slug: true, cor: true } } },
        },
      },
    }),
    db.departamentoAreaMembro.count({ where }),
  ])

  const paginacao = resumirPaginacao(total, listagem)

  const facetas: ListagemFacetas = await carregarFacetas(
    SPEC,
    listagem,
    opcoesEscopo,
    async (campo, whereFaceta) => {
      const linhas = await db.departamentoAreaMembro.groupBy({
        by: [campo as 'areaId'],
        where: whereFaceta as Prisma.DepartamentoAreaMembroWhereInput,
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

      {vinculos.length === 0 ? (
        <ListagemVazia
          spec={SPEC}
          params={listagem}
          vazio={{
            icon: (
              <Users
                className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ),
            title: 'Ninguém em áreas ainda',
            description:
              'A entrada em área é feita pelo gestor no portal do departamento — aqui é só a visão consolidada.',
          }}
        />
      ) : (
        <TableShell empty={{ title: 'Sem vínculos' }} isEmpty={false}>
          <thead>
            <tr>
              {SPEC.colunas.map((coluna) => (
                <ListagemTh
                  key={coluna.id}
                  spec={SPEC}
                  params={listagem}
                  coluna={coluna}
                  facetas={facetas}
                  className={coluna.id === 'criadoEm' ? 'hidden lg:table-cell' : undefined}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {vinculos.map((v) => (
              <tr key={`${v.areaId}-${v.userId}`} className="border-t border-[rgb(var(--border))]">
                <td className="px-4 py-3">
                  <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                    {v.user.nome ?? v.user.email}
                  </span>
                  {v.user.nickname && (
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">
                      @{v.user.nickname}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[rgb(var(--foreground))]">{v.area.nome}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/portal/departamentos/${v.area.departamento.slug}#equipe`}
                    className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground))] hover:underline"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: v.area.departamento.cor }}
                      aria-hidden
                    />
                    {v.area.departamento.nome}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
                  {v.papel === 'RESPONSAVEL' ? 'Responsável' : 'Membro'}
                </td>
                <td className="hidden px-4 py-3 text-right text-sm text-[rgb(var(--foreground-muted))] lg:table-cell">
                  {fmtData.format(v.criadoEm)}
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
