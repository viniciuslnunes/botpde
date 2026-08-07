import { db } from '@torcida/db'
import { formatNomeTorcida, SYSTEM_ROLES } from '@torcida/types'
import { labelTipoUnidade } from '@/lib/torcida-labels'

/**
 * Console de lideranças do super-admin (`/super-admin/liderancas`).
 *
 * O painel antigo listava tenants em ordem alfabética, sem dizer qual era Sede
 * raiz e qual era subsede promovida — um portal de unidade aparecia como se
 * fosse uma torcida qualquer, e não havia como responder "de quais portais eu
 * sou dono sem ser?". Aqui a leitura é a árvore real: torcida no topo, portais
 * de unidade (Caso B) e unidades sem portal (Caso A) abaixo dela, cada linha
 * com quem lidera hoje.
 *
 * Leitura de estrutura — nunca gateada por canal restrito (ARCHITECTURE §5.13).
 */

export type LinhaLideranca = {
  /** Chave estável da linha (tenantId no Caso B, sedeId no Caso A). */
  id: string
  caso: 'A' | 'B'
  tenantId: string
  /** Caso A: unidade cuja liderança muda. `null` no Caso B. */
  sedeId: string | null
  nome: string
  /** "Torcida", "Subsede", "PDE" — natureza da linha na árvore. */
  tipoLabel: string
  slug: string | null
  corPrimaria: string
  lideres: { userId: string; nome: string | null; email: string | null }[]
  /** O super-admin que abriu a página lidera esta unidade. */
  souEu: boolean
}

export type GrupoLideranca = {
  /** Tenant raiz da torcida (Sede principal). */
  tenantId: string
  nome: string
  clubeLabel: string | null
  corPrimaria: string
  raiz: LinhaLideranca
  filhas: LinhaLideranca[]
}

type SedeRow = {
  id: string
  nome: string
  tipo: string
  tenantId: string | null
  sedeId: string | null
  responsavelUserId: string | null
  responsavelUser: { nome: string | null; email: string | null } | null
}

type TenantRow = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
  afiliacao: { nome: string; apelido: string | null; estado: string | null } | null
}

type OwnerRow = {
  tenantId: string
  userId: string
  user: { nome: string | null; email: string | null }
}

function clubeLabel(t: TenantRow): string | null {
  if (!t.afiliacao) return null
  const nome = t.afiliacao.apelido || t.afiliacao.nome
  return t.afiliacao.estado ? `${nome} (${t.afiliacao.estado})` : nome
}

/**
 * Todas as torcidas com sua árvore de lideranças. `meuUserId` marca as linhas
 * em que o próprio super-admin é o líder — é o filtro que responde "tire-me da
 * posse do que não é meu".
 */
export async function carregarLiderancas(meuUserId: string): Promise<GrupoLideranca[]> {
  const [tenants, sedes, owners]: [TenantRow[], SedeRow[], OwnerRow[]] = await Promise.all([
    db.tenant.findMany({
      where: { ativo: true, sintetico: false },
      select: {
        id: true,
        slug: true,
        nome: true,
        corPrimaria: true,
        afiliacao: { select: { nome: true, apelido: true, estado: true } },
      },
      orderBy: { nome: 'asc' },
    }),
    db.sede.findMany({
      where: { tenantId: { not: null } },
      select: {
        id: true,
        nome: true,
        tipo: true,
        tenantId: true,
        sedeId: true,
        responsavelUserId: true,
        responsavelUser: { select: { nome: true, email: true } },
      },
      orderBy: { nome: 'asc' },
    }),
    db.userRole.findMany({
      where: { role: { isSystem: true, nome: SYSTEM_ROLES.OWNER } },
      select: { tenantId: true, userId: true, user: { select: { nome: true, email: true } } },
    }),
  ])

  const sedePorId = new Map(sedes.map((s) => [s.id, s]))

  const ownersPorTenant = new Map<string, OwnerRow[]>()
  for (const o of owners) {
    const lista = ownersPorTenant.get(o.tenantId)
    if (lista) lista.push(o)
    else ownersPorTenant.set(o.tenantId, [o])
  }

  /** Tenant mãe de um tenant de unidade promovida — `null` se for raiz. */
  function tenantMaeDe(tenantId: string): string | null {
    for (const sede of sedes) {
      if (sede.tenantId !== tenantId || !sede.sedeId) continue
      const pai = sedePorId.get(sede.sedeId)
      if (pai?.tenantId && pai.tenantId !== tenantId) return pai.tenantId
    }
    return null
  }

  function linhaTenant(t: TenantRow, tipoLabel: string): LinhaLideranca {
    const lideres = (ownersPorTenant.get(t.id) ?? []).map((o) => ({
      userId: o.userId,
      nome: o.user.nome,
      email: o.user.email,
    }))
    return {
      id: t.id,
      caso: 'B',
      tenantId: t.id,
      sedeId: null,
      nome: formatNomeTorcida(t.nome),
      tipoLabel,
      slug: t.slug,
      corPrimaria: t.corPrimaria,
      lideres,
      souEu: lideres.some((l) => l.userId === meuUserId),
    }
  }

  function linhaSede(sede: SedeRow, corPrimaria: string): LinhaLideranca {
    const lideres = sede.responsavelUserId
      ? [
          {
            userId: sede.responsavelUserId,
            nome: sede.responsavelUser?.nome ?? null,
            email: sede.responsavelUser?.email ?? null,
          },
        ]
      : []
    return {
      id: sede.id,
      caso: 'A',
      tenantId: sede.tenantId!,
      sedeId: sede.id,
      nome: sede.nome,
      tipoLabel: labelTipoUnidade(sede.tipo),
      slug: null,
      corPrimaria,
      lideres,
      souEu: sede.responsavelUserId === meuUserId,
    }
  }

  const maePorTenant = new Map<string, string | null>()
  for (const t of tenants) maePorTenant.set(t.id, tenantMaeDe(t.id))

  const grupos: GrupoLideranca[] = []

  for (const t of tenants) {
    if (maePorTenant.get(t.id)) continue // portal de unidade entra sob a mãe

    const filhas: LinhaLideranca[] = []

    // Portais de unidade (Caso B) desta torcida — e, dentro de cada um, as
    // unidades que continuam sem portal (PDEs que acompanharam a promoção).
    for (const outro of tenants) {
      if (maePorTenant.get(outro.id) !== t.id) continue
      filhas.push(linhaTenant(outro, 'Portal de unidade'))

      const sedesDoPortal = sedes.filter((s) => s.tenantId === outro.id)
      // A Sede que *é* o portal aponta para uma Sede da mãe; as demais são
      // unidades internas dele.
      const sedeDoProprioPortal = sedesDoPortal.find(
        (s) => s.sedeId && sedePorId.get(s.sedeId)?.tenantId === t.id,
      )
      for (const sede of sedesDoPortal) {
        if (sede.id === sedeDoProprioPortal?.id) continue
        filhas.push(linhaSede(sede, outro.corPrimaria))
      }
    }

    // Unidades sem portal (Caso A): Sedes do próprio tenant, exceto a raiz.
    const sedesDoTenant = sedes.filter((s) => s.tenantId === t.id)
    const raizSedeId = sedesDoTenant.find((s) => s.tipo === 'SEDE')?.id ?? null
    for (const sede of sedesDoTenant) {
      if (sede.id === raizSedeId) continue
      filhas.push(linhaSede(sede, t.corPrimaria))
    }

    grupos.push({
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      clubeLabel: clubeLabel(t),
      corPrimaria: t.corPrimaria,
      raiz: linhaTenant(t, 'Torcida'),
      filhas,
    })
  }

  return grupos
}

/** Achata os grupos — base de busca e do filtro "onde eu sou líder". */
export function linhasDeLideranca(grupos: GrupoLideranca[]): LinhaLideranca[] {
  return grupos.flatMap((g) => [g.raiz, ...g.filhas])
}
