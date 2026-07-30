import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { redirect } from 'next/navigation'
import { SetupForm } from './setup-form'
import { TenantsListaCliente } from './tenants-lista-cliente'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import {
  ListagemPaginacao,
  ListagemToolbar,
  ListagemVazia,
} from '@/components/admin/ui/listagem'
import { parseListagemParams } from '@/lib/listagem'
import { LISTAGEM_SUPER_ADMIN_SETUP } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { Building2, PlusCircle } from 'lucide-react'
import type { Metadata } from 'next'
import { SYSTEM_ROLES } from '@torcida/types'

export const metadata: Metadata = { title: 'Setup — Criar Torcida' }

const SPEC = LISTAGEM_SUPER_ADMIN_SETUP

type TenantListaRow = {
  id: string
  slug: string
  nome: string
  plano: string
  ativo: boolean
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()

  if (!session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    redirect('/')
  }

  const userId = session.user.id
  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  const where: Prisma.TenantWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { global: true, motivo: 'Tenant é entidade de plataforma (super-admin)' },
    extra: [{ sintetico: false }],
  })

  const [tenants, total, facetas]: [
    TenantListaRow[],
    number,
    Awaited<ReturnType<typeof carregarFacetas>>,
  ] = await Promise.all([
    db.tenant.findMany({
      where,
      select: { id: true, slug: true, nome: true, plano: true, ativo: true },
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
    }),
    db.tenant.count({ where }),
    carregarFacetas(
      SPEC,
      listagem,
      {
        escopo: { global: true, motivo: 'Tenant é entidade de plataforma (super-admin)' },
        extra: [{ sintetico: false }],
      },
      async (campo, whereFaceta) => {
        if (campo === 'plano') {
          const linhas: { plano: string; _count: { _all: number } }[] = await db.tenant.groupBy({
            by: ['plano'],
            where: whereFaceta as Prisma.TenantWhereInput,
            _count: { _all: true },
          })
          return linhas.map((l) => ({ valor: l.plano, count: l._count._all }))
        }
        if (campo === 'ativo') {
          const linhas: { ativo: boolean; _count: { _all: number } }[] = await db.tenant.groupBy({
            by: ['ativo'],
            where: whereFaceta as Prisma.TenantWhereInput,
            _count: { _all: true },
          })
          // URL/opções usam string; groupBy devolve boolean.
          return linhas.map((l) => ({
            valor: l.ativo ? 'true' : 'false',
            count: l._count._all,
          }))
        }
        return []
      },
    ),
  ])

  const paginacao = resumirPaginacao(total, listagem)
  const idsDaPagina = tenants.map((t) => t.id)

  const minhasRolesOwner: { tenantId: string }[] =
    idsDaPagina.length === 0 || !userId
      ? []
      : await db.userRole.findMany({
          where: {
            userId,
            tenantId: { in: idsDaPagina },
            role: { nome: SYSTEM_ROLES.OWNER, isSystem: true },
          },
          select: { tenantId: true },
        })

  const souOwnerDeIds = minhasRolesOwner.map((r) => r.tenantId)

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Setup — Torcidas"
        description="Crie uma nova torcida (tenant) e configure as roles de sistema."
        icon={<PlusCircle className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-8 py-5 sm:py-8">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Torcidas existentes
          </h2>

          <ListagemToolbar
            spec={SPEC}
            params={listagem}
            paginacao={paginacao}
            facetas={facetas}
            escopoChave="plataforma"
            filtrosCompactos={[
              { filtroId: 'plano' },
              { filtroId: 'situacao' },
            ]}
          />

          {tenants.length === 0 ? (
            <ListagemVazia
              spec={SPEC}
              params={listagem}
              vazio={{
                icon: <Building2 className="h-10 w-10" aria-hidden />,
                title: 'Nenhuma torcida cadastrada',
                description:
                  'Crie a primeira torcida abaixo. Tenants sintéticos (Comunidade Nacional) não aparecem aqui.',
              }}
            />
          ) : (
            <>
              <TenantsListaCliente tenants={tenants} souOwnerDeIds={souOwnerDeIds} />
              <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
            </>
          )}
        </div>

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <h2 className="mb-5 text-base font-semibold text-[rgb(var(--foreground))]">
            Criar nova torcida
          </h2>
          <SetupForm />
        </div>

        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
          <p className="font-semibold text-blue-900 dark:text-blue-200">Multi-tenant em produção</p>
          <p className="mt-1">
            Configure <code className="font-mono">ROOT_DOMAIN</code> + DNS wildcard no Railway para
            cada torcida ter portal próprio. Modo legado: <code className="font-mono">TENANT_SLUG</code>{' '}
            fixo.
          </p>
          <p className="mt-2 text-xs opacity-90">
            Runbook completo: <code className="font-mono">docs/ops/deploy-multi-tenant.md</code>
          </p>
        </div>
      </div>
    </div>
  )
}
