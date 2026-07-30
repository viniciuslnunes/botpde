import { db } from '@torcida/db'
import { assertPermission, assertPresidenteGlobal } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { PERMISSIONS, podeCriarUnidadeTerritorial, formatNomeTorcida } from '@torcida/types'
import { isPaiHerdadoDeTorcidaPrincipal } from '@/lib/sede-regras'
import { redirect } from 'next/navigation'
import {
  AdminSedesManager,
  type AdminSedeListItem,
  type PaiHerdadoListItem,
} from '@/components/admin/admin-sedes-manager'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes — Admin' }

type SedeRow = {
  id: string
  nome: string
  tipo: AdminSedeListItem['tipo']
  sedeId: string | null
  tenantId: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  telefone: string | null
  horarios: string | null
  capacidade: number | null
  responsavel: string | null
  fotoUrl: string | null
  ativa: boolean
  lat: number | null
  lng: number | null
  streetViewHeading: number | null
  streetViewPitch: number | null
  streetViewFov: number | null
}

const SEDE_LIST_SELECT = {
  id: true,
  nome: true,
  tipo: true,
  sedeId: true,
  tenantId: true,
  endereco: true,
  cidade: true,
  estado: true,
  telefone: true,
  horarios: true,
  capacidade: true,
  responsavel: true,
  fotoUrl: true,
  ativa: true,
  lat: true,
  lng: true,
  streetViewHeading: true,
  streetViewPitch: true,
  streetViewFov: true,
} as const

/**
 * Unidades Caso B (portal próprio): filhas na árvore de `sedeId` cujo
 * `tenantId` já não é o da torcida. Sem isso, ao promover a portal a unidade
 * some de /admin/sedes da mãe.
 */
async function carregarSedesCasoB(tenantId: string, sedesLocais: SedeRow[]): Promise<SedeRow[]> {
  const visitados = new Set(sedesLocais.map((s) => s.id))
  let frontier = [...visitados]
  const casoB: SedeRow[] = []

  while (frontier.length > 0) {
    const filhos: SedeRow[] = await db.sede.findMany({
      where: { sedeId: { in: frontier } },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: SEDE_LIST_SELECT,
    })
    const next: string[] = []
    for (const f of filhos) {
      if (visitados.has(f.id)) continue
      visitados.add(f.id)
      if (f.tenantId && f.tenantId !== tenantId) {
        casoB.push(f)
        next.push(f.id)
      }
    }
    frontier = next
  }

  return casoB
}

export default async function AdminSedesPage() {
  const authz = await assertPermission(PERMISSIONS.SEDES_MANAGE).catch(() => null)
  if (!authz) redirect('/admin')
  const { tenant } = authz

  type MembroCountRow = { sedeId: string | null; _count: { _all: number } }

  const [rowsLocal, candidatoRaw, semUnidadeMae]: [
    SedeRow[],
    Array<{ userId: string; nome: string; user: { nome: string | null; email: string | null } }>,
    MembroCountRow[],
  ] = await Promise.all([
    db.sede.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: SEDE_LIST_SELECT,
    }),
    db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO' },
      orderBy: { nome: 'asc' },
      take: 200,
      select: {
        userId: true,
        nome: true,
        user: { select: { nome: true, email: true } },
      },
    }),
    db.saasMembro.groupBy({
      by: ['sedeId'],
      where: { tenantId: tenant.id, status: 'APROVADO', sedeId: null },
      _count: { _all: true },
    }),
  ])

  const rowsCasoB = await carregarSedesCasoB(tenant.id, rowsLocal)
  const rows: SedeRow[] = [...rowsLocal, ...rowsCasoB]

  const tenantIdsContagem = [
    tenant.id,
    ...new Set(rowsCasoB.map((s) => s.tenantId).filter((id): id is string => Boolean(id))),
  ]

  const membroCounts: MembroCountRow[] = await db.saasMembro.groupBy({
    by: ['sedeId'],
    where: { tenantId: { in: tenantIdsContagem }, status: 'APROVADO', sedeId: { not: null } },
    _count: { _all: true },
  })

  const countBySede = new Map<string, number>()
  for (const row of membroCounts) {
    if (row.sedeId == null) continue
    countBySede.set(row.sedeId, (countBySede.get(row.sedeId) ?? 0) + row._count._all)
  }
  const membrosSemUnidade = semUnidadeMae[0]?._count._all ?? 0

  // Caso B: pai pode estar na torcida principal (outro tenant) — resolve para a árvore.
  const idsNaLista = new Set(rows.map((s) => s.id))
  const paiIdsExternos = [
    ...new Set(
      rows
        .map((s) => s.sedeId)
        .filter((id): id is string => Boolean(id) && !idsNaLista.has(id!)),
    ),
  ]

  const paisExternos = new Map<string, PaiHerdadoListItem>()
  if (paiIdsExternos.length > 0) {
    type PaiRow = {
      id: string
      nome: string
      tipo: string
      fotoUrl: string | null
      lat: number | null
      lng: number | null
      streetViewHeading: number | null
      streetViewPitch: number | null
      streetViewFov: number | null
      endereco: string | null
      cidade: string | null
      estado: string | null
      tenantId: string | null
      tenant: { nome: string; logoUrl: string | null } | null
    }
    const pais: PaiRow[] = await db.sede.findMany({
      where: { id: { in: paiIdsExternos } },
      select: {
        id: true,
        nome: true,
        tipo: true,
        fotoUrl: true,
        lat: true,
        lng: true,
        streetViewHeading: true,
        streetViewPitch: true,
        streetViewFov: true,
        endereco: true,
        cidade: true,
        estado: true,
        tenantId: true,
        tenant: { select: { nome: true, logoUrl: true } },
      },
    })
    for (const pai of pais) {
      if (!isPaiHerdadoDeTorcidaPrincipal(pai.tenantId, tenant.id) || !pai.tenant) continue
      paisExternos.set(pai.id, {
        id: pai.id,
        nome: pai.nome,
        tipo: pai.tipo,
        tenantNome: formatNomeTorcida(pai.tenant.nome),
        logoUrl: pai.tenant.logoUrl,
        fotoUrl: pai.fotoUrl,
        lat: pai.lat,
        lng: pai.lng,
        streetViewHeading: pai.streetViewHeading,
        streetViewPitch: pai.streetViewPitch,
        streetViewFov: pai.streetViewFov,
        endereco: pai.endereco,
        cidade: pai.cidade,
        estado: pai.estado,
      })
    }
  }

  // Excluir Sede é destrutivo (remaneja membros/eventos e reorganiza a
  // hierarquia). Super-admin pode excluir qualquer unidade; Presidente/Vice
  // da sede principal só pode excluir uma Sede (`tipo: 'SEDE'`) duplicada —
  // fora desse caso de limpeza, remover unidades é exclusivo do super-admin
  // (ver `excluirSede` em actions.ts, mesma regra espelhada aqui pra UI).
  const presidenteSession = await assertPresidenteGlobal()
    .then((r) => r.session)
    .catch(() => null)
  const isSuperAdmin = Boolean(presidenteSession && isSuperAdminEmail(presidenteSession.user.email))
  const sedesTipoSedeCount = rowsLocal.filter((s) => s.tipo === 'SEDE').length

  const sedes: AdminSedeListItem[] = rows.map((s) => {
    const portalProprio = Boolean(s.tenantId && s.tenantId !== tenant.id)
    return {
      id: s.id,
      nome: s.nome,
      tipo: s.tipo,
      sedeId: s.sedeId,
      endereco: s.endereco,
      cidade: s.cidade,
      estado: s.estado,
      telefone: s.telefone,
      horarios: s.horarios,
      capacidade: s.capacidade,
      responsavel: s.responsavel,
      fotoUrl: s.fotoUrl,
      ativa: s.ativa,
      lat: s.lat,
      lng: s.lng,
      streetViewHeading: s.streetViewHeading,
      streetViewPitch: s.streetViewPitch,
      streetViewFov: s.streetViewFov,
      membrosCount: countBySede.get(s.id) ?? 0,
      paiHerdado: s.sedeId ? (paisExternos.get(s.sedeId) ?? null) : null,
      portalProprio,
      portalTenantId: portalProprio ? s.tenantId : null,
      podeExcluir:
        !portalProprio &&
        (isSuperAdmin ||
          (presidenteSession != null && s.tipo === 'SEDE' && sedesTipoSedeCount > 1)),
    }
  })
  // Opções de pai só entre unidades do próprio tenant (não mover sob portal filho).
  const sedesOption = rowsLocal.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo }))
  const candidatos = candidatoRaw.map((m) => ({
    id: m.userId,
    nome: m.user.nome ?? m.nome,
    email: m.user.email,
  }))

  const torcidaPrincipal = [...paisExternos.values()][0] ?? null
  const podeAdicionarLocal = podeCriarUnidadeTerritorial(
    rowsLocal.some((s) => s.tipo === 'SEDE') ? 'SEDE' : 'PONTO_ENCONTRO',
  )

  return (
    <div className="min-w-0 space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Hierarquia Sede → Subsede → PDE — mapa, eventos e cadastro. Unidades com portal próprio
        continuam na árvore.
      </p>
      <MotionReveal>
        <AdminSedesManager
          sedes={sedes}
          sedesOption={sedesOption}
          candidatos={candidatos}
          membrosSemUnidade={membrosSemUnidade}
          torcidaPrincipal={torcidaPrincipal}
          podeAdicionarLocal={podeAdicionarLocal}
        />
      </MotionReveal>
    </div>
  )
}
