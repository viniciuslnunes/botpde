import { db } from '@torcida/db'
import { assertPermission, assertPresidenteGlobal } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { PERMISSIONS, podeCriarUnidadeTerritorial } from '@torcida/types'
import { isPaiHerdadoDeTorcidaPrincipal } from '@/lib/sede-regras'
import { redirect } from 'next/navigation'
import {
  AdminSedesManager,
  type AdminSedeListItem,
  type PaiHerdadoListItem,
} from '@/components/admin/admin-sedes-manager'
import { AdminPageHeader } from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MapPin } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes — Admin' }

export default async function AdminSedesPage() {
  const authz = await assertPermission(PERMISSIONS.SEDES_MANAGE).catch(() => null)
  if (!authz) redirect('/admin')
  const { tenant } = authz

  type SedeRow = {
    id: string
    nome: string
    tipo: AdminSedeListItem['tipo']
    sedeId: string | null
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

  type MembroCountRow = { sedeId: string | null; _count: { _all: number } }

  const [rows, membroCounts, candidatosRaw]: [
    SedeRow[],
    MembroCountRow[],
    Array<{ userId: string; nome: string; user: { nome: string | null; email: string | null } }>,
  ] = await Promise.all([
    db.sede.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        tipo: true,
        sedeId: true,
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
      },
    }),
    db.saasMembro.groupBy({
      by: ['sedeId'],
      where: { tenantId: tenant.id, status: 'APROVADO' },
      _count: { _all: true },
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
  ])

  const countBySede = new Map<string, number>()
  let membrosSemUnidade = 0
  for (const row of membroCounts) {
    if (row.sedeId == null) membrosSemUnidade = row._count._all
    else countBySede.set(row.sedeId, row._count._all)
  }

  // Caso B: pai pode estar na torcida principal (outro tenant) — resolve para a árvore.
  const idsLocais = new Set(rows.map((s) => s.id))
  const paiIdsExternos = [
    ...new Set(
      rows
        .map((s) => s.sedeId)
        .filter((id): id is string => Boolean(id) && !idsLocais.has(id!)),
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
        tenantNome: pai.tenant.nome,
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
  const sedesTipoSedeCount = rows.filter((s) => s.tipo === 'SEDE').length

  const sedes: AdminSedeListItem[] = rows.map((s) => ({
    ...s,
    membrosCount: countBySede.get(s.id) ?? 0,
    paiHerdado: s.sedeId ? (paisExternos.get(s.sedeId) ?? null) : null,
    podeExcluir:
      isSuperAdmin ||
      (presidenteSession != null && s.tipo === 'SEDE' && sedesTipoSedeCount > 1),
  }))
  const sedesOption = rows.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo }))
  const candidatos = candidatosRaw.map((m) => ({
    id: m.userId,
    nome: m.user.nome ?? m.nome,
    email: m.user.email,
  }))

  const torcidaPrincipal = [...paisExternos.values()][0] ?? null
  const podeAdicionarLocal = podeCriarUnidadeTerritorial(
    rows.some((s) => s.tipo === 'SEDE') ? 'SEDE' : 'PONTO_ENCONTRO',
  )

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        icon={<MapPin className="h-5 w-5" />}
        title="Sedes"
        description="Hierarquia Sede → Subsede → PDE — mapa, eventos e cadastro"
      />
      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
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
    </div>
  )
}
