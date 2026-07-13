import 'server-only'
import { db } from '@torcida/db'
import { JANELA_ONLINE_MS } from '@/lib/presenca'

export type StatsTorcidaOnboarding = {
  sociosTotal: number
  sociosOnline: number
  torcedoresTotal: number
  torcedoresOnline: number
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

/** Agrega sócios/torcedores aprovados por tenant (torcida organizada). */
export async function calcularStatsTorcidasOnboarding(
  tenantIds: string[],
): Promise<Map<string, StatsTorcidaOnboarding>> {
  if (tenantIds.length === 0) return new Map()

  const limiteOnline = new Date(Date.now() - JANELA_ONLINE_MS)

  type MembroRow = {
    userId: string
    tipo: 'SOCIO' | 'TORCEDOR'
    user: { ultimoAcessoEm: Date | null }
    tenantId: string
  }

  const membros: MembroRow[] = await db.saasMembro.findMany({
    where: {
      status: 'APROVADO',
      tenantId: { in: tenantIds },
      tipo: { in: ['SOCIO', 'TORCEDOR'] },
    },
    select: {
      userId: true,
      tipo: true,
      tenantId: true,
      user: { select: { ultimoAcessoEm: true } },
    },
  })

  const buckets = new Map<string, Bucket>()
  for (const id of tenantIds) buckets.set(id, criarBucket())

  function online(d: Date | null): boolean {
    return Boolean(d && d >= limiteOnline)
  }

  for (const m of membros) {
    const b = buckets.get(m.tenantId)
    if (!b) continue
    if (m.tipo === 'SOCIO') {
      b.socios.add(m.userId)
      if (online(m.user.ultimoAcessoEm)) b.sociosOnline.add(m.userId)
    } else {
      b.torcedores.add(m.userId)
      if (online(m.user.ultimoAcessoEm)) b.torcedoresOnline.add(m.userId)
    }
  }

  const result = new Map<string, StatsTorcidaOnboarding>()
  for (const [tenantId, b] of buckets) {
    result.set(tenantId, {
      sociosTotal: b.socios.size,
      sociosOnline: b.sociosOnline.size,
      torcedoresTotal: b.torcedores.size,
      torcedoresOnline: b.torcedoresOnline.size,
    })
  }
  return result
}
