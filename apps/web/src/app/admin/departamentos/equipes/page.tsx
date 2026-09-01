import { db, type Prisma } from '@torcida/db'
import Link from 'next/link'
import { PERMISSIONS, hrefHomeDepartamento, resolverCorSemRivalidade } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { optsCorDoTenant } from '@/lib/cor-departamento'
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
import { ArrowUpRight, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { EquipeRowAcoes } from '../_components/equipe-row-acoes'

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
    area: { nome: string; departamento: { id: string; nome: string; slug: string; cor: string } }
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
          select: { nome: true, departamento: { select: { id: true, nome: true, slug: true, cor: true } } },
        },
      },
    }),
    db.departamentoAreaMembro.count({ where }),
  ])

  const corOpts = await optsCorDoTenant(tenant)
  const vinculosUi = vinculos.map((v) => ({
    ...v,
    area: {
      ...v.area,
      departamento: {
        ...v.area.departamento,
        cor: resolverCorSemRivalidade(v.area.departamento.cor, corOpts),
      },
    },
  }))

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

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Quem atua em cada área. Nomeie responsável ou remova daqui; o departamento continua o lugar da equipe completa.
      </p>

      {vinculosUi.length === 0 ? (
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
              'Inclua pessoas no departamento em Acessos · Pessoas e nomeie o responsável na aba Áreas.',
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
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {vinculosUi.map((v) => (
              <tr key={`${v.areaId}-${v.userId}`} className="border-t border-[rgb(var(--border))]">
                <td className="px-4 py-3">
                  <Link
                    href={hrefHomeDepartamento(v.area.departamento.slug, 'equipe', {
                      pessoa: v.userId,
                    })}
                    className="group inline-flex items-start gap-1.5"
                    aria-label={`Abrir ${v.user.nome ?? v.user.email} na equipe de ${v.area.departamento.nome}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[rgb(var(--foreground))] group-hover:underline">
                        {v.user.nome ?? v.user.email}
                      </span>
                      {v.user.nickname && (
                        <span className="text-xs text-[rgb(var(--foreground-muted))]">
                          @{v.user.nickname}
                        </span>
                      )}
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]"
                      aria-hidden
                    />
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[rgb(var(--foreground))]">
                  <Link
                    href={hrefHomeDepartamento(v.area.departamento.slug, 'areas', {
                      area: v.areaId,
                    })}
                    className="app-touch-line hover:underline"
                  >
                    {v.area.nome}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={hrefHomeDepartamento(v.area.departamento.slug, 'equipe')}
                    className="app-touch-line inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground))] hover:underline"
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
                <EquipeRowAcoes
                  areaId={v.areaId}
                  areaNome={v.area.nome}
                  departamentoId={v.area.departamento.id}
                  slug={v.area.departamento.slug}
                  userId={v.userId}
                  pessoaNome={v.user.nome ?? v.user.email}
                  papel={v.papel}
                  hrefPessoa={hrefHomeDepartamento(v.area.departamento.slug, 'equipe', {
                    pessoa: v.userId,
                  })}
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
