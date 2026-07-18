import { db } from '@torcida/db'
import type { PostSocialItem } from './feed'

export interface AutorBadge {
  sedeNome: string | null
  cargoNome: string | null
  departamentoNome: string | null
}

function chave(autorId: string, tenantId: string): string {
  return `${autorId}:${tenantId}`
}

export async function getBadgesPorAutorTenant(
  pares: Array<{ autorId: string; tenantId: string }>,
): Promise<Map<string, AutorBadge>> {
  const vistos = new Set<string>()
  const unicos = pares.filter((p) => {
    const k = chave(p.autorId, p.tenantId)
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  if (unicos.length === 0) return new Map()

  const autorIds = [...new Set(unicos.map((p) => p.autorId))]
  const tenantIds = [...new Set(unicos.map((p) => p.tenantId))]

  const [membros, roles]: [
    Array<{
      userId: string
      tenantId: string
      sede: { nome: string } | null
      departamento: { nome: string } | null
    }>,
    Array<{ userId: string; tenantId: string; role: { nome: string } }>,
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds }, status: 'APROVADO' },
      select: {
        userId: true,
        tenantId: true,
        sede: { select: { nome: true } },
        departamento: { select: { nome: true } },
      },
    }),
    db.userRole.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds } },
      select: { userId: true, tenantId: true, role: { select: { nome: true } } },
    }),
  ])

  const map = new Map<string, AutorBadge>()
  for (const p of unicos) {
    const membro = membros.find((m) => m.userId === p.autorId && m.tenantId === p.tenantId)
    const role = roles.find((r) => r.userId === p.autorId && r.tenantId === p.tenantId)
    map.set(chave(p.autorId, p.tenantId), {
      sedeNome: membro?.sede?.nome ?? null,
      cargoNome: role?.role.nome ?? null,
      departamentoNome: membro?.departamento?.nome ?? null,
    })
  }
  return map
}

export async function enriquecerPostsComBadges(posts: PostSocialItem[]): Promise<PostSocialItem[]> {
  if (posts.length === 0) return posts
  const badges = await getBadgesPorAutorTenant(
    posts.map((p) => ({ autorId: p.autorId, tenantId: p.tenantId })),
  )
  return posts.map((p) => {
    const b = badges.get(chave(p.autorId, p.tenantId))
    if (!b) return p
    return {
      ...p,
      autor: {
        ...p.autor,
        sedeNome: b.sedeNome,
        cargoNome: b.cargoNome,
        departamentoNome: b.departamentoNome,
      },
    }
  })
}
