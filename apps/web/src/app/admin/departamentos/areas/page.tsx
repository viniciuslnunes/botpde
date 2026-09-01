import { db, type Prisma } from '@torcida/db'
import {
  PERMISSIONS,
  STATUS_PROJETO_ABERTOS,
  checklistItemsFromMeta,
  checklistProgress,
  hrefHomeDepartamento,
  resolverCorSemRivalidade,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { optsCorDoTenant } from '@/lib/cor-departamento'
import { ListagemToolbar, ListagemVazia, KpiGrid, StatCard } from '@/components/admin/ui'
import { parseListagemParams, type ListagemFacetas } from '@/lib/listagem'
import { LISTAGEM_DEPARTAMENTO_AREAS } from '@/lib/listagem/specs'
import { carregarFacetas, montarWhereListagem, resumirPaginacao } from '@/lib/listagem/query'
import { AlertTriangle, Layers, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { AreaGestaoAcoes } from '../_components/area-gestao-celulas'
import { AreaChecklistInline } from '../_components/area-checklist-inline'
import { AreaSaudeGrupo, AreaSaudeRow } from '@/components/departamentos/area-saude-lista'

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
    meta: unknown
    departamento: { id: string; nome: string; slug: string; cor: string }
    _count: { membros: number }
    membros: Array<{ user: { nome: string | null; nickname: string | null } }>
    projetos: Array<{ id: string }>
  }

  const [areas, total, semResponsavelCount, pessoasCount]: [
    AreaRow[],
    number,
    number,
    number,
  ] = await Promise.all([
    db.departamentoArea.findMany({
      where,
      orderBy: [{ departamento: { ordem: 'asc' } }, { ordem: 'asc' }, { nome: 'asc' }],
      take: 200,
      select: {
        id: true,
        nome: true,
        descricao: true,
        ativa: true,
        sazonal: true,
        meta: true,
        departamento: { select: { id: true, nome: true, slug: true, cor: true } },
        _count: { select: { membros: true } },
        membros: {
          where: { papel: 'RESPONSAVEL' },
          take: 3,
          select: { user: { select: { nome: true, nickname: true } } },
        },
        projetos: {
          where: { status: { in: [...STATUS_PROJETO_ABERTOS] } },
          select: { id: true },
        },
      },
    }),
    db.departamentoArea.count({ where }),
    db.departamentoArea.count({
      where: {
        tenantId: tenant.id,
        ativa: true,
        membros: { none: { papel: 'RESPONSAVEL' } },
      },
    }),
    db.departamentoAreaMembro.count({ where: { area: { tenantId: tenant.id } } }),
  ])

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

  const corOpts = await optsCorDoTenant(tenant)
  const grupos = new Map<string, { nome: string; cor: string; areas: AreaRow[] }>()
  for (const a of areas) {
    const cor = resolverCorSemRivalidade(a.departamento.cor, corOpts)
    const area: AreaRow = { ...a, departamento: { ...a.departamento, cor } }
    const g = grupos.get(a.departamento.id) ?? {
      nome: a.departamento.nome,
      cor,
      areas: [],
    }
    g.areas.push(area)
    grupos.set(a.departamento.id, g)
  }

  const paginacao = resumirPaginacao(total, { ...listagem, pagina: 1, porPagina: 200 })

  return (
    <div className="space-y-5">
      <KpiGrid cols={3}>
        <StatCard label="Áreas nesta lista" value={total} icon={<Layers className="h-5 w-5" />} />
        <StatCard
          label="Ativas sem responsável"
          value={semResponsavelCount}
          tone={semResponsavelCount > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard label="Pessoas nas frentes" value={pessoasCount} icon={<Users className="h-5 w-5" />} />
      </KpiGrid>

      <ListagemToolbar
        spec={SPEC}
        params={listagem}
        paginacao={paginacao}
        facetas={facetas}
        escopoChave={tenant.id}
      />

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Cada linha é uma frente de trabalho. Nomeie o responsável e marque o checklist daqui —
        a ficha completa fica no portal do departamento.
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
              'Rode `pnpm --filter @torcida/db seed:departamento-areas` para semear as áreas canônicas, ou crie as frentes no portal do departamento.',
          }}
        />
      ) : (
        <div className="space-y-6">
          {[...grupos.values()].map((grupo) => (
            <AreaSaudeGrupo key={grupo.nome} nome={grupo.nome} cor={grupo.cor}>
              {grupo.areas.map((a) => {
                const progress = checklistProgress(a.meta)
                const responsaveis = a.membros.map(
                  (m) => m.user.nome?.trim() || (m.user.nickname ? `@${m.user.nickname}` : 'Pessoa'),
                )
                const href = hrefHomeDepartamento(a.departamento.slug, 'areas', { area: a.id })
                return (
                  <AreaSaudeRow
                    key={a.id}
                    item={{
                      id: a.id,
                      nome: a.nome,
                      descricao: a.descricao,
                      ativa: a.ativa,
                      sazonal: a.sazonal,
                      href,
                      pessoas: a._count.membros,
                      responsaveis,
                      checklistDone: progress.done,
                      checklistTotal: progress.total,
                      projetosAbertos: a.projetos.length,
                    }}
                    acoes={
                      <AreaGestaoAcoes
                        areaId={a.id}
                        areaNome={a.nome}
                        departamentoId={a.departamento.id}
                        slug={a.departamento.slug}
                        href={href}
                        semResponsavel={a.membros.length === 0}
                        responsaveis={responsaveis}
                      />
                    }
                    extra={
                      checklistItemsFromMeta(a.meta).length > 0 ? (
                        <AreaChecklistInline
                          areaId={a.id}
                          departamentoId={a.departamento.id}
                          slug={a.departamento.slug}
                          items={checklistItemsFromMeta(a.meta)}
                        />
                      ) : undefined
                    }
                  />
                )
              })}
            </AreaSaudeGrupo>
          ))}
          {total > areas.length ? (
            <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
              Mostrando {areas.length} de {total}. Afine a busca para recortar.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
