import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  listarCandidatosResponsavelPatrimonio,
  listarPatrimonio,
  resumirPatrimonio,
} from '@/lib/patrimonio'
import {
  parseFiltroPatrimonio,
  type PatrimonioSearchParams,
} from '@/lib/patrimonio-filtros'
import { PatrimonioItemForm } from '@/components/patrimonio/patrimonio-item-form'
import {
  PatrimonioItensLista,
  type PatrimonioRow,
} from '@/components/patrimonio/patrimonio-itens-lista'
import { PatrimonioResumoCards } from '@/components/patrimonio/patrimonio-resumo-cards'
import { PatrimonioFiltros } from '@/components/patrimonio/patrimonio-filtros'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patrimônio' }

type Props = { searchParams: Promise<PatrimonioSearchParams> }

export default async function PortalPatrimonioPage({ searchParams }: Props) {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.PATRIMONY_VIEW))
  } catch {
    redirect('/portal/departamentos')
  }

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  let podeGerir = isSuperAdmin
  if (!podeGerir && session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeGerir = hasPermission(effective, PERMISSIONS.PATRIMONY_MANAGE)
  }

  const sp = await searchParams
  const { filtro, values } = parseFiltroPatrimonio(sp)

  const [resumo, lista, candidatos] = await Promise.all([
    resumirPatrimonio(tenant.id),
    listarPatrimonio(tenant.id, { filtro }),
    podeGerir ? listarCandidatosResponsavelPatrimonio(tenant.id) : Promise.resolve([]),
  ])

  const itens: PatrimonioRow[] = lista.itens.map((i) => ({
    id: i.id,
    nome: i.nome,
    categoria: i.categoria,
    status: i.status,
    quantidade: i.quantidade,
    localizacao: i.localizacao,
    valorEstimado: i.valorEstimado != null ? Number(i.valorEstimado) : null,
    observacao: i.observacao,
    responsavelId: i.responsavel?.id ?? null,
    responsavelNome: i.responsavel?.nome ?? null,
  }))

  const query: Record<string, string | undefined> = {
    categoria: values.categoria,
    status: values.status,
    q: values.q,
    incluirBaixados: values.incluirBaixados ? '1' : undefined,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-500/15 text-stone-700 dark:text-stone-300">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Patrimônio</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Inventário de bens da torcida
              </p>
            </div>
          </div>
          <Link
            href="/portal/departamentos/patrimonio"
            className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Ver departamento
          </Link>
        </div>
      </MotionReveal>

      <PatrimonioResumoCards resumo={resumo} />
      <PatrimonioFiltros basePath="/portal/patrimonio" values={values} />
      {podeGerir && <PatrimonioItemForm candidatos={candidatos} />}
      <PatrimonioItensLista
        itens={itens}
        podeGerir={podeGerir}
        candidatos={candidatos}
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath="/portal/patrimonio"
        query={query}
      />
    </div>
  )
}
