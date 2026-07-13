import 'server-only'
import { db } from '@torcida/db'
import { JANELA_ONLINE_MS } from '@/lib/presenca'

export type StatsClubeOnboarding = {
  sociosTotal: number
  sociosOnline: number
  torcedoresTotal: number
  torcedoresOnline: number
}

type GrupoClube = {
  canonicalId: string
  afiliacaoIds: string[]
}

type Bucket = {
  socios: Set<string>
  torcedores: Set<string>
  sociosOnline: Set<string>
  torcedoresOnline: Set<string>
}

function criarBucket(): Bucket {
  return {
    socios: new Set(),
    torcedores: new Set(),
    sociosOnline: new Set(),
    torcedoresOnline: new Set(),
  }
}

/**
 * Agrega sócios/torcedores da plataforma por clube canônico (mesmo grupo saoMesmoClube).
 * Torcedores = união de PerfilTorcedor + SaasMembro TORCEDOR aprovado nas torcidas do clube.
 */
export async function calcularStatsClubesOnboarding(
  grupos: GrupoClube[],
): Promise<Map<string, StatsClubeOnboarding>> {
  if (grupos.length === 0) return new Map()

  const allIds = [...new Set(grupos.flatMap((g) => g.afiliacaoIds))]
  const idToCanonical = new Map<string, string>()
  for (const g of grupos) {
    for (const id of g.afiliacaoIds) idToCanonical.set(id, g.canonicalId)
  }

  const limiteOnline = new Date(Date.now() - JANELA_ONLINE_MS)

  type SocioRow = {
    userId: string
    user: { ultimoAcessoEm: Date | null }
    tenant: { afiliacaoId: string | null }
  }
  type PerfilRow = {
    userId: string
    afiliacaoId: string | null
    user: { ultimoAcessoEm: Date | null }
  }

  const [sociosMembros, torcedoresMembros, perfisTorcedor]: [
    SocioRow[],
    SocioRow[],
    PerfilRow[],
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tipo: 'SOCIO',
        tenant: { afiliacaoId: { in: allIds } },
      },
      select: {
        userId: true,
        user: { select: { ultimoAcessoEm: true } },
        tenant: { select: { afiliacaoId: true } },
      },
    }),
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tipo: 'TORCEDOR',
        tenant: { afiliacaoId: { in: allIds } },
      },
      select: {
        userId: true,
        user: { select: { ultimoAcessoEm: true } },
        tenant: { select: { afiliacaoId: true } },
      },
    }),
    db.perfilTorcedor.findMany({
      where: { afiliacaoId: { in: allIds } },
      select: {
        userId: true,
        afiliacaoId: true,
        user: { select: { ultimoAcessoEm: true } },
      },
    }),
  ])

  const buckets = new Map<string, Bucket>()
  for (const g of grupos) buckets.set(g.canonicalId, criarBucket())

  function canonical(afiliacaoId: string | null | undefined): string | undefined {
    if (!afiliacaoId) return undefined
    return idToCanonical.get(afiliacaoId)
  }

  function online(d: Date | null): boolean {
    return Boolean(d && d >= limiteOnline)
  }

  for (const m of sociosMembros) {
    const cid = canonical(m.tenant.afiliacaoId)
    if (!cid) continue
    const b = buckets.get(cid)!
    b.socios.add(m.userId)
    if (online(m.user.ultimoAcessoEm)) b.sociosOnline.add(m.userId)
  }

  for (const m of torcedoresMembros) {
    const cid = canonical(m.tenant.afiliacaoId)
    if (!cid) continue
    const b = buckets.get(cid)!
    b.torcedores.add(m.userId)
    if (online(m.user.ultimoAcessoEm)) b.torcedoresOnline.add(m.userId)
  }

  for (const p of perfisTorcedor) {
    const cid = canonical(p.afiliacaoId)
    if (!cid) continue
    const b = buckets.get(cid)!
    b.torcedores.add(p.userId)
    if (online(p.user.ultimoAcessoEm)) b.torcedoresOnline.add(p.userId)
  }

  const result = new Map<string, StatsClubeOnboarding>()
  for (const [cid, b] of buckets) {
    result.set(cid, {
      sociosTotal: b.socios.size,
      sociosOnline: b.sociosOnline.size,
      torcedoresTotal: b.torcedores.size,
      torcedoresOnline: b.torcedoresOnline.size,
    })
  }
  return result
}
