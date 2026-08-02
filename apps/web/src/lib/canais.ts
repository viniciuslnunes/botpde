import 'server-only'

import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { formatNomeTorcida, SYSTEM_ROLES } from '@torcida/types'
import { tagCanaisVisiveis } from './comunidade-cache'
import { ExpectedError } from './expected-error'
import {
  getDescendantTenantIds,
  getTenantRelation,
  getTorcidaLineageTenantIds,
  getVisibleTenantIds,
} from './hierarquia'
import { getTenantsRestritos } from './isolamento'
import {
  postInclude,
  projetarPost,
  finalizarPosts,
  buildCursorWhere,
  decodeCursor,
  encodeCursor,
  type FeedOpts,
  type FeedPersonalizadoResult,
  type PostRaw,
  type PostSocialItem,
} from './feed'
import {
  decidePodeVerCanal,
  type CanalItem,
  type CandidatoMembroCanalItem,
  type MembroCanalItem,
  type PedidoCanalItem,
  type SugestaoCanalAside,
  type UnidadeBuscaItem,
  type VisibilidadeCanal,
} from './canais-shared'

/** Canal oficial representa uma unidade da torcida; seu nome é sempre visualizado em caixa alta. */
function formatNomeCanal(nome: string | null, canalOficial: boolean): string | null {
  if (!nome || !canalOficial) return nome
  return formatNomeTorcida(nome)
}

export type {
  CanalItem,
  CandidatoMembroCanalItem,
  MembroCanalItem,
  PedidoCanalItem,
  SugestaoCanalAside,
  UnidadeBuscaItem,
  VisibilidadeCanal,
} from './canais-shared'
export {
  decidePodeVerCanal,
  isConversaGrupoLike,
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkCanalComunidade,
  linkUnidadeComunidade,
} from './canais-shared'

/** Cap de unidades Caso B materializadas no load de `/canais`. */
const MAX_CANAIS_OFICIAIS_PROVISION = 50

/**
 * Sócio (vínculo `SaasMembro` APROVADO com `tipo: 'SOCIO'`) em qualquer
 * unidade da mesma torcida (sede/subsedes/PDEs) — não só no `viewerTenantId`
 * atual, já que o vínculo pode ter sido feito numa subsede e o usuário
 * navegar pela sede (ou vice-versa). Torcedor (vínculo `TORCEDOR` ou nenhum
 * vínculo aprovado) não conta. Quem foi desligado também não: `desligarMembro`
 * mantém `status: APROVADO` e só grava `desligadoEm` (Achado 11), então o
 * filtro precisa dos dois — como já faz `elegibilidadeCanalMembro` abaixo.
 */
const isSocioDaTorcida = cache(async function isSocioDaTorcida(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const lineage = await getTorcidaLineageTenantIds(tenantId)
  const membro: { id: string } | null = await db.saasMembro.findFirst({
    where: {
      userId,
      status: 'APROVADO',
      desligadoEm: null,
      tipo: 'SOCIO',
      tenantId: { in: lineage },
    },
    select: { id: true },
  })
  return !!membro
})

export async function podeVerCanal(
  viewerTenantId: string,
  canalTenantId: string,
  visibilidade: VisibilidadeCanal,
  userId: string,
): Promise<boolean> {
  const [isSocio, relation] = await Promise.all([
    isSocioDaTorcida(userId, viewerTenantId),
    viewerTenantId === canalTenantId
      ? Promise.resolve('self' as const)
      : getTenantRelation(viewerTenantId, canalTenantId),
  ])

  return decidePodeVerCanal({ relation, visibilidade, isSocio })
}

export type NivelElegibilidadeCanal = 'PENDENTE' | 'ATIVO'

/**
 * Gate único para materializar roster. Descoberta cross-tenant não concede
 * participação: canal real exige vínculo local; ativação exige vínculo ativo.
 *
 * "Local" é o tenant **dono** do canal, que nem sempre é `Conversa.tenantId`:
 * unidade Caso B (tenant próprio) promovida depois costuma manter o canal
 * oficial *emprestado* no tenant da mãe (`Sede.canalConversaId` aponta para uma
 * Conversa de outro tenant). Aí o vínculo na própria unidade também vale — sem
 * isso, quem entra pelo link da subsede/PDE é barrado do próprio canal.
 */
export async function assertElegibilidadeMembroCanal(
  conversaId: string,
  userId: string,
  nivel: NivelElegibilidadeCanal,
): Promise<void> {
  const conversa: {
    tipo: string
    comunidade: boolean
    tenantId: string
    tenant: { sintetico: boolean }
  } | null = await db.conversa.findUnique({
    where: { id: conversaId },
    select: {
      tipo: true,
      comunidade: true,
      tenantId: true,
      tenant: { select: { sintetico: true } },
    },
  })
  if (!conversa) throw new ExpectedError('Canal não encontrado.')
  if (conversa.tipo === 'DIRETA' || conversa.comunidade || conversa.tenant.sintetico) return

  type VinculoCanal = { status: string; tipo: string; desligadoEm: Date | null }
  const estaAtivo = (m: VinculoCanal | null): boolean =>
    Boolean(m && m.status === 'APROVADO' && !m.desligadoEm)

  let tenantVinculoId = conversa.tenantId
  let membro: VinculoCanal | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: conversa.tenantId, userId } },
    select: { status: true, tipo: true, desligadoEm: true },
  })

  // Canal emprestado: só consulta a unidade dona quando o vínculo no tenant
  // hospedeiro não resolve — mantém o caminho comum em uma query.
  if (!estaAtivo(membro)) {
    const unidadeDona: { tenantId: string | null } | null = await db.sede.findFirst({
      where: { canalConversaId: conversaId, tenantId: { not: conversa.tenantId } },
      select: { tenantId: true },
    })
    if (unidadeDona?.tenantId) {
      const naUnidade: VinculoCanal | null = await db.saasMembro.findUnique({
        where: { tenantId_userId: { tenantId: unidadeDona.tenantId, userId } },
        select: { status: true, tipo: true, desligadoEm: true },
      })
      if (naUnidade && (!membro || estaAtivo(naUnidade))) {
        membro = naUnidade
        tenantVinculoId = unidadeDona.tenantId
      }
    }
  }

  if (!membro) {
    throw new ExpectedError('Você precisa ter vínculo com a torcida deste canal para participar.')
  }
  if (nivel === 'PENDENTE') return
  if (!estaAtivo(membro)) {
    throw new ExpectedError('O vínculo com a torcida deste canal ainda não foi aprovado.')
  }
  if (membro.tipo === 'SOCIO') {
    const socio: { validade: Date } | null = await db.saasSocio.findUnique({
      where: { tenantId_userId: { tenantId: tenantVinculoId, userId } },
      select: { validade: true },
    })
    if (socio && socio.validade < new Date()) {
      throw new ExpectedError('Sua carteirinha nesta torcida está vencida.')
    }
  }
}

/**
 * Fallback de avatar dos canais oficiais: quando `Conversa.avatarUrl` é nulo,
 * 1) `Sede.fotoUrl` da unidade ligada ao canal (`canalConversaId`) — preferido
 * 2) `Sede.fotoUrl` da sede raiz do tenant do canal
 * 3) `Tenant.logoUrl`
 * Batch por tenantId para evitar N+1 em listagens. Sem (1), canais de
 * SUBSEDE/PDE no tenant da mãe herdavam o logo da torcida (sede raiz).
 */
async function resolveFallbackAvatarsCanalOficial(
  tenantIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(tenantIds)]
  if (uniqueIds.length === 0) return new Map()

  const [sedes, tenants]: [
    Array<{ id: string; tenantId: string | null; sedeId: string | null; fotoUrl: string | null }>,
    Array<{ id: string; logoUrl: string | null }>,
  ] = await Promise.all([
    db.sede.findMany({
      where: { tenantId: { in: uniqueIds } },
      select: { id: true, tenantId: true, sedeId: true, fotoUrl: true },
    }),
    db.tenant.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, logoUrl: true },
    }),
  ])

  const sedesPorTenant = new Map<string, Array<{ id: string; sedeId: string | null; fotoUrl: string | null }>>()
  for (const s of sedes) {
    if (!s.tenantId) continue
    const list = sedesPorTenant.get(s.tenantId) ?? []
    list.push({ id: s.id, sedeId: s.sedeId, fotoUrl: s.fotoUrl })
    sedesPorTenant.set(s.tenantId, list)
  }

  const sedeRaizFoto = new Map<string, string | null>()
  for (const [tenantId, list] of sedesPorTenant) {
    const ids = new Set(list.map((s) => s.id))
    const raiz = list.find((s) => !s.sedeId || !ids.has(s.sedeId))
    sedeRaizFoto.set(tenantId, raiz?.fotoUrl ?? null)
  }

  const tenantMap = new Map(tenants.map((t) => [t.id, t.logoUrl]))

  const result = new Map<string, string | null>()
  for (const id of uniqueIds) {
    result.set(id, sedeRaizFoto.get(id) ?? tenantMap.get(id) ?? null)
  }
  return result
}

/** Resolve o avatar efetivo de um `CanalItem`, aplicando o fallback só para canais oficiais. */
function resolveAvatarCanalOficial(
  row: { tenantId: string; avatarUrl: string | null; canalOficial: boolean },
  fallbackMap: Map<string, string | null>,
  /** Foto da `Sede` ligada ao canal (unidade), se houver. */
  sedeFotoUrl?: string | null,
): string | null {
  if (row.avatarUrl) return row.avatarUrl
  if (!row.canalOficial) return null
  if (sedeFotoUrl) return sedeFotoUrl
  return fallbackMap.get(row.tenantId) ?? null
}

/**
 * Resolve um userId para `Conversa.criadoPorId` (FK obrigatória). Não implica
 * admin do canal — propriedade/membros vêm depois via config ou aprovação.
 * Ordem: owner → admin → sócio aprovado → fallback explícito (ex.: viewer).
 */
async function resolverCriadoPorId(
  tenantId: string,
  fallbackUserId?: string | null,
): Promise<string | null> {
  const owner: { userId: string } | null = await db.userRole.findFirst({
    where: { tenantId, role: { nome: SYSTEM_ROLES.OWNER, isSystem: true } },
    select: { userId: true },
  })
  if (owner) return owner.userId

  const admin: { userId: string } | null = await db.userRole.findFirst({
    where: { tenantId, role: { nome: SYSTEM_ROLES.ADMIN, isSystem: true } },
    select: { userId: true },
  })
  if (admin) return admin.userId

  const membro: { userId: string } | null = await db.saasMembro.findFirst({
    // StatusMembro não tem 'ATIVO' — APROVADO é o estado ativo terminal.
    where: { tenantId, status: 'APROVADO' },
    select: { userId: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (membro) return membro.userId
  return fallbackUserId ?? null
}

/** Defaults de canal oficial (privado / pedido de entrada; descoberta ALIADOS). */
const CANAL_OFICIAL_DEFAULTS = {
  institucional: true as const,
  canalOficial: true as const,
  visibilidadeCanal: 'ALIADOS' as const,
  somenteAdminPublica: false as const,
  publica: false as const,
  descricao: 'Canal oficial da unidade',
}

/**
 * Provisiona o canal oficial de uma unidade Caso A (SUBSEDE/PDE no tenant da
 * mãe) e grava `Sede.canalConversaId`. Idempotente se o ponteiro já existe.
 *
 * Por regra o canal nasce **privado** (`publica: false`) e **sem**
 * `MembroConversa` ADMIN — o admin do sistema atribui propriedade depois;
 * `criadoPorId` só satisfaz a FK (ator / owner / fallback).
 */
export async function ensureCanalOficialParaSede(opts: {
  sedeId: string
  tenantId: string
  nome: string
  criadoPorId: string
  /** Se true, cria o ator como ADMIN (fluxo de afiliação aprovada). Default false. */
  atorComoAdmin?: boolean
  /** Foto da unidade → `Conversa.avatarUrl` (evita herdar logo da torcida-mãe). */
  avatarUrl?: string | null
}): Promise<{ id: string; criadoAgora: boolean }> {
  const sede: { id: string; canalConversaId: string | null; fotoUrl: string | null } | null =
    await db.sede.findUnique({
      where: { id: opts.sedeId },
      select: { id: true, canalConversaId: true, fotoUrl: true },
    })
  if (!sede) throw new ExpectedError('Unidade não encontrada.')
  if (sede.canalConversaId) return { id: sede.canalConversaId, criadoAgora: false }

  const avatarUrl = opts.avatarUrl ?? sede.fotoUrl ?? null

  const canal: { id: string } = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: opts.tenantId,
      nome: opts.nome,
      ...CANAL_OFICIAL_DEFAULTS,
      avatarUrl,
      criadoPorId: opts.criadoPorId,
      ...(opts.atorComoAdmin
        ? {
            membros: {
              create: { userId: opts.criadoPorId, papel: 'ADMIN' as const, status: 'ATIVO' as const },
            },
          }
        : {}),
    },
    select: { id: true },
  })

  const linked = await db.sede.updateMany({
    where: { id: opts.sedeId, canalConversaId: null },
    data: { canalConversaId: canal.id },
  })
  if (linked.count === 0) {
    await db.conversa.delete({ where: { id: canal.id } }).catch(() => undefined)
    const again: { canalConversaId: string | null } | null = await db.sede.findUnique({
      where: { id: opts.sedeId },
      select: { canalConversaId: true },
    })
    if (again?.canalConversaId) return { id: again.canalConversaId, criadoAgora: false }
    throw new ExpectedError('Não foi possível vincular o canal oficial à unidade.')
  }

  return { id: canal.id, criadoAgora: true }
}

/**
 * Garante que o responsável (liderança) de uma unidade Caso A seja ADMIN do
 * canal oficial dela. Cobre a criação (canal e responsável definidos juntos)
 * e a edição (responsável trocado depois que o canal já existe) — antes
 * disso a liderança só entrava via `pedirEntradaCanal`. Idempotente, no-op
 * se a unidade ainda não tem canal ou responsável.
 */
export async function vincularResponsavelAoCanalDaSede(opts: {
  sedeId: string
  canalConversaId: string | null
  responsavelUserId: string | null
}): Promise<void> {
  if (!opts.canalConversaId || !opts.responsavelUserId) return
  await assertElegibilidadeMembroCanal(opts.canalConversaId, opts.responsavelUserId, 'ATIVO')
  await db.membroConversa.upsert({
    where: {
      conversaId_userId: { conversaId: opts.canalConversaId, userId: opts.responsavelUserId },
    },
    create: {
      conversaId: opts.canalConversaId,
      userId: opts.responsavelUserId,
      papel: 'ADMIN',
      status: 'ATIVO',
    },
    // Pedido de entrada prévio deixa status PENDENTE — promover ao vincular.
    update: { papel: 'ADMIN', saiuEm: null, status: 'ATIVO' },
  })
}

export async function getOrCreateCanalOficial(
  tenantId: string,
  fallbackCriadoPorId?: string | null,
): Promise<{ id: string; criadoAgora: boolean }> {
  // Ponteiro canônico do mural do *portal* (não misturar com canais Caso A de
  // SUBSEDE/PDE no mesmo tenant):
  // 1) Sede tipo SEDE com canal
  // 2) Caso B: única Sede deste tenant com canal (unidade promovida; canal
  //    pode estar "emprestado" no tenant da mãe)
  const sedesComCanal: Array<{
    canalConversaId: string | null
    tipo: string
  }> = await db.sede.findMany({
    where: { tenantId, canalConversaId: { not: null } },
    select: { canalConversaId: true, tipo: true },
  })
  const sedeRaiz = sedesComCanal.find((s) => s.tipo === 'SEDE')
  if (sedeRaiz?.canalConversaId) {
    return { id: sedeRaiz.canalConversaId, criadoAgora: false }
  }
  if (sedesComCanal.length === 1 && sedesComCanal[0]?.canalConversaId) {
    return { id: sedesComCanal[0].canalConversaId, criadoAgora: false }
  }

  // Mural do tenant: preferir canal ligado a SEDE; senão o mais antigo oficial
  // que *não* está ligado a SUBSEDE/PDE (evita devolver canal de unidade Caso A).
  const canaisOficiais: Array<{ id: string }> = await db.conversa.findMany({
    where: { tenantId, tipo: 'CANAL', canalOficial: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true },
  })
  if (canaisOficiais.length > 0) {
    const idsCasoA = new Set(
      sedesComCanal
        .filter((s) => s.tipo === 'SUBSEDE' || s.tipo === 'PONTO_ENCONTRO')
        .map((s) => s.canalConversaId)
        .filter((id): id is string => Boolean(id)),
    )
    const mural = canaisOficiais.find((c) => !idsCasoA.has(c.id)) ?? null
    if (mural) {
      // Liga à SEDE raiz se ainda não tiver ponteiro (tenants antigos).
      await db.sede.updateMany({
        where: { tenantId, tipo: 'SEDE', canalConversaId: null },
        data: { canalConversaId: mural.id },
      })
      return { id: mural.id, criadoAgora: false }
    }
  }

  const tenant: { nome: string } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { nome: true },
  })
  if (!tenant) throw new ExpectedError('Unidade não encontrada.')

  const liderancaId = await resolverCriadoPorId(tenantId, null)
  const criadoPorId = liderancaId ?? fallbackCriadoPorId ?? null
  if (!criadoPorId) {
    throw new ExpectedError(
      'Tenant sem membros ativos para provisionar o canal oficial. Crie o canal depois de haver um responsável.',
    )
  }

  // Só promove a ADMIN quem já é liderança do tenant — fallback (viewer) não
  // herda propriedade do mural oficial.
  const canal: { id: string } = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId,
      nome: formatNomeTorcida(tenant.nome),
      ...CANAL_OFICIAL_DEFAULTS,
      criadoPorId,
      ...(liderancaId
        ? {
            membros: {
              create: { userId: liderancaId, papel: 'ADMIN' as const, status: 'ATIVO' as const },
            },
          }
        : {}),
    },
    select: { id: true },
  })

  await db.sede.updateMany({
    where: { tenantId, tipo: 'SEDE', canalConversaId: null },
    data: { canalConversaId: canal.id },
  })

  return { id: canal.id, criadoAgora: true }
}

/**
 * Vínculo automático de canais na aprovação de sócio (governança hierárquica,
 * Fase 2): entra SÓ no canal da própria unidade (`SaasMembro.sedeId` →
 * `Sede.canalConversaId`) e no canal principal (mural oficial — `Sede` tipo
 * SEDE, com fallback `getOrCreateCanalOficial` para tenants novos sem
 * ponteiro ainda). Demais canais de unidade permanecem privados: entrada só
 * via `pedirEntradaCanal` / `decidirPedidoCanal` / `adicionarMembroCanal`.
 * Idempotente — seguro chamar mais de uma vez para o mesmo usuário/tenant.
 */
export async function vincularMembroCanaisAposAprovacao(opts: {
  tenantId: string
  userId: string
  sedeId: string | null
  /** Fallback de `criadoPorId` se o canal principal ainda não existir. */
  fallbackCriadoPorId?: string | null
}): Promise<void> {
  const canalIds = new Set<string>()

  if (opts.sedeId) {
    const sedeUnidade: { canalConversaId: string | null } | null = await db.sede.findFirst({
      where: { id: opts.sedeId, tenantId: opts.tenantId },
      select: { canalConversaId: true },
    })
    if (sedeUnidade?.canalConversaId) canalIds.add(sedeUnidade.canalConversaId)
  }

  const sedeRaiz: { canalConversaId: string | null } | null = await db.sede.findFirst({
    where: { tenantId: opts.tenantId, tipo: 'SEDE', canalConversaId: { not: null } },
    select: { canalConversaId: true },
  })
  if (sedeRaiz?.canalConversaId) {
    canalIds.add(sedeRaiz.canalConversaId)
  } else {
    const principal = await getOrCreateCanalOficial(opts.tenantId, opts.fallbackCriadoPorId)
    canalIds.add(principal.id)
  }

  for (const conversaId of canalIds) {
    await assertElegibilidadeMembroCanal(conversaId, opts.userId, 'ATIVO')
    await db.membroConversa.upsert({
      where: { conversaId_userId: { conversaId, userId: opts.userId } },
      create: { conversaId, userId: opts.userId, papel: 'MEMBRO', status: 'ATIVO' },
      // Pedido de entrada prévio deixa status PENDENTE — promover ao vincular.
      update: { saiuEm: null, status: 'ATIVO' },
    })
  }
}

/**
 * Garante canais oficiais visíveis na listagem do tenant ativo:
 * - self + descendentes Caso B (`getOrCreateCanalOficial`)
 * - unidades Caso A (SUBSEDE/PDE no mesmo tenant sem `Sede.canalConversaId`)
 *   — inclusive sob cada descendente Caso B visitável na worktree
 *
 * Não materializa ancestral/aliado (write-on-GET cross-tenant). Cap de
 * descendentes para não explodir o load de `/canais`.
 *
 * `fallbackCriadoPorId` (tipicamente o viewer) só preenche `criadoPorId` quando
 * o tenant ainda não tem liderança/sócio — o canal nasce sem ADMIN.
 */
export async function ensureCanaisOficiaisHierarquia(
  tenantId: string,
  fallbackCriadoPorId?: string | null,
): Promise<void> {
  const descendentes = await getDescendantTenantIds(tenantId)
  const tenantIds = [tenantId, ...descendentes].slice(0, MAX_CANAIS_OFICIAIS_PROVISION)

  const criadosCasoB = await Promise.all(
    tenantIds.map(async (id) => {
      try {
        return await getOrCreateCanalOficial(id, fallbackCriadoPorId)
      } catch {
        // Tenant sem qualquer user resolvível — não bloqueia a listagem.
        return { id: '', criadoAgora: false }
      }
    }),
  )
  let materializou = criadosCasoB.some((c) => c.criadoAgora)

  // Oficiais ainda no default antigo (HIERARQUIA) → ALIADOS, para aliados
  // descobrirem e pedirem entrada. Temáticos não são tocados.
  const bumped = await db.conversa.updateMany({
    where: {
      tenantId: { in: tenantIds },
      tipo: 'CANAL',
      canalOficial: true,
      visibilidadeCanal: 'HIERARQUIA',
    },
    data: { visibilidadeCanal: 'ALIADOS' },
  })
  if (bumped.count > 0) materializou = true

  // Caso A: subsede/PDE em cada tenant da worktree, sem ponteiro de canal.
  const sedesSemCanal: Array<{ id: string; nome: string; tenantId: string }> = await db.sede.findMany({
    where: {
      tenantId: { in: tenantIds },
      ativa: true,
      canalConversaId: null,
      tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] },
    },
    select: { id: true, nome: true, tenantId: true },
    take: MAX_CANAIS_OFICIAIS_PROVISION,
  })

  for (const sede of sedesSemCanal) {
    const criadoPorId = await resolverCriadoPorId(sede.tenantId, fallbackCriadoPorId)
    if (!criadoPorId) continue
    const { criadoAgora } = await ensureCanalOficialParaSede({
      sedeId: sede.id,
      tenantId: sede.tenantId,
      nome: sede.nome,
      criadoPorId,
      atorComoAdmin: false,
    })
    if (criadoAgora) materializou = true
  }

  // Listagem usa unstable_cache — sem invalidate, canais novos ficam invisíveis ~120s.
  if (materializou) {
    revalidateTag(tagCanaisVisiveis(tenantId), 'max')
  }
}

/** Entrada imediata (canal `publica: true`) — sem pedido, sem aprovação. */
export async function inscreverCanal(
  conversaId: string,
  userId: string,
): Promise<void> {
  await assertElegibilidadeMembroCanal(conversaId, userId, 'ATIVO')
  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId, userId } },
    create: { conversaId, userId, papel: 'MEMBRO', status: 'ATIVO' },
    update: { saiuEm: null, status: 'ATIVO' },
  })
}

export const listCanaisVisiveis = cache(async function listCanaisVisiveis(
  viewerTenantId: string,
  userId: string,
): Promise<CanalItem[]> {
  const visibleTenantIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')
  const visibleTenantIdsKey = [...visibleTenantIds].sort().join(',')

  const rows = await unstable_cache(
    async (): Promise<
      Array<{
        id: string
        tenantId: string
        nome: string | null
        descricao: string | null
        avatarUrl: string | null
        institucional: boolean
        canalOficial: boolean
        visibilidadeCanal: VisibilidadeCanal
        somenteAdminPublica: boolean
        publica: boolean
        tenant: { nome: string }
        _count: { membros: number }
      }>
    > =>
      db.conversa.findMany({
        where: { tenantId: { in: visibleTenantIds }, tipo: 'CANAL' },
        orderBy: [{ canalOficial: 'desc' }, { atualizadoEm: 'desc' }],
        take: 80,
        select: {
          id: true,
          tenantId: true,
          nome: true,
          descricao: true,
          avatarUrl: true,
          institucional: true,
          canalOficial: true,
          visibilidadeCanal: true,
          somenteAdminPublica: true,
          publica: true,
          tenant: { select: { nome: true } },
          _count: { select: { membros: { where: { saiuEm: null } } } },
        },
      }),
    ['canais-visiveis-base', viewerTenantId, visibleTenantIdsKey],
    { revalidate: 120, tags: [tagCanaisVisiveis(viewerTenantId)] },
  )()

  const memberships: Array<{
    conversaId: string
    papel: 'ADMIN' | 'MEMBRO'
    status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
    silenciada: boolean
  }> = await db.membroConversa.findMany({
    where: {
      userId,
      saiuEm: null,
      conversaId: { in: rows.map((row) => row.id) },
    },
    select: { conversaId: true, papel: true, status: true, silenciada: true },
  })
  const membershipMap = new Map(memberships.map((item) => [item.conversaId, item]))

  type SedeCanalLoc = {
    canalConversaId: string | null
    tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
    cidade: string | null
    estado: string | null
    lat: number | null
    lng: number | null
    fotoUrl: string | null
  }

  // Visibilidade por canal em paralelo — getTenantRelation é dedupado por
  // React.cache, então pares (viewer, tenant) repetidos não repetem query.
  const [visiveis, fallbackAvatars, sedesPorCanal]: [
    boolean[],
    Map<string, string | null>,
    SedeCanalLoc[],
  ] = await Promise.all([
    Promise.all(rows.map((row) => podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal, userId))),
    resolveFallbackAvatarsCanalOficial(
      rows.filter((row) => row.canalOficial && !row.avatarUrl).map((row) => row.tenantId),
    ),
    rows.length === 0
      ? Promise.resolve([] as SedeCanalLoc[])
      : db.sede.findMany({
          where: { canalConversaId: { in: rows.map((row) => row.id) } },
          select: {
            canalConversaId: true,
            tipo: true,
            cidade: true,
            estado: true,
            lat: true,
            lng: true,
            fotoUrl: true,
          },
        }),
  ])

  const sedeMap = new Map(
    sedesPorCanal
      .filter((s): s is SedeCanalLoc & { canalConversaId: string } => !!s.canalConversaId)
      .map((s) => [s.canalConversaId, s]),
  )

  const result: CanalItem[] = []
  rows.forEach((row, i) => {
    if (!visiveis[i]) return
    const membro = membershipMap.get(row.id)
    const sede = sedeMap.get(row.id)
    result.push({
      id: row.id,
      tenantId: row.tenantId,
      nome: formatNomeCanal(row.nome, row.canalOficial),
      descricao: row.descricao,
      avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars, sede?.fotoUrl),
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: membro?.status === 'ATIVO',
      souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
      pedidoPendente: membro?.status === 'PENDENTE',
      silenciada: membro?.status === 'ATIVO' ? membro.silenciada : false,
      tenantNome: formatNomeTorcida(row.tenant.nome),
      tipoUnidade: sede?.tipo ?? null,
      cidade: sede?.cidade ?? null,
      estado: sede?.estado ?? null,
      lat: sede?.lat ?? null,
      lng: sede?.lng ?? null,
    })
  })
  return result
})

/**
 * Canais visíveis em que o viewer ainda não está inscrito — painel
 * "Canais sugeridos" no rail direito do feed (entre salas e mensagens).
 * Abertos → Entrar; fechados → Solicitar (inclui cross-tenant quando
 * `podeVerCanal` — `pedirEntradaCanal` aceita canais visíveis fora do tenant).
 */
export const getSugestoesCanaisParaAside = cache(async function getSugestoesCanaisParaAside(
  tenantId: string,
  userId: string,
): Promise<SugestaoCanalAside[]> {
  const canais = await listCanaisVisiveis(tenantId, userId)
  return canais
    .filter((c) => !c.souMembro && !c.pedidoPendente)
    .sort((a, b) => {
      if (a.tenantId === tenantId && b.tenantId !== tenantId) return -1
      if (b.tenantId === tenantId && a.tenantId !== tenantId) return 1
      if (a.canalOficial !== b.canalOficial) return a.canalOficial ? -1 : 1
      return b.membros - a.membros
    })
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      nome: c.nome,
      avatarUrl: c.avatarUrl,
      membros: c.membros,
      canalOficial: c.canalOficial,
      publica: c.publica,
      tenantNome: c.tenantNome,
    }))
})

/**
 * Canais `PUBLICO` das unidades reais (não sintéticas) do clube — vitrine da
 * Comunidade Nacional. Sem gate de `podeVerCanal`: visibilidade `PUBLICO` já
 * é o próprio critério (comunidade aberta), igual ao card de vitrine cross-tenant.
 */
export const listCanaisPublicosPorAfiliacao = cache(async function listCanaisPublicosPorAfiliacao(
  afiliacaoId: string,
  userId?: string,
): Promise<CanalItem[]> {
  const rowsBrutas: Array<{
    id: string
    tenantId: string
    nome: string | null
    descricao: string | null
    avatarUrl: string | null
    institucional: boolean
    canalOficial: boolean
    visibilidadeCanal: VisibilidadeCanal
    somenteAdminPublica: boolean
    publica: boolean
    tenant: { nome: string }
    _count: { membros: number }
  }> = await db.conversa.findMany({
    where: {
      tipo: 'CANAL',
      visibilidadeCanal: 'PUBLICO',
      tenant: { afiliacaoId, ativo: true, sintetico: false },
    },
    orderBy: [{ canalOficial: 'desc' }, { atualizadoEm: 'desc' }],
    take: 80,
    select: {
      id: true,
      tenantId: true,
      nome: true,
      descricao: true,
      avatarUrl: true,
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: true,
      somenteAdminPublica: true,
      publica: true,
      tenant: { select: { nome: true } },
      _count: { select: { membros: { where: { saiuEm: null } } } },
    },
  })

  // R5 — vitrine da CN não passa por `podeVerCanal` (visibilidade PUBLICO já é
  // o critério), então o canal de uma unidade restrita precisa ser cortado aqui.
  const restritos = await getTenantsRestritos()
  const rows = rowsBrutas.filter((row) => !restritos.has(row.tenantId))

  const memberships: Array<{
    conversaId: string
    papel: 'ADMIN' | 'MEMBRO'
    status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
    silenciada: boolean
  }> = userId
    ? await db.membroConversa.findMany({
        where: { userId, saiuEm: null, conversaId: { in: rows.map((row) => row.id) } },
        select: { conversaId: true, papel: true, status: true, silenciada: true },
      })
    : []
  const membershipMap = new Map(memberships.map((item) => [item.conversaId, item]))

  const fallbackAvatars = await resolveFallbackAvatarsCanalOficial(
    rows.filter((row) => row.canalOficial && !row.avatarUrl).map((row) => row.tenantId),
  )

  const sedesPorCanal: Array<{
    canalConversaId: string | null
    tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
    cidade: string | null
    estado: string | null
    lat: number | null
    lng: number | null
    fotoUrl: string | null
  }> =
    rows.length === 0
      ? []
      : await db.sede.findMany({
          where: { canalConversaId: { in: rows.map((row) => row.id) } },
          select: {
            canalConversaId: true,
            tipo: true,
            cidade: true,
            estado: true,
            lat: true,
            lng: true,
            fotoUrl: true,
          },
        })
  const sedeMap = new Map(
    sedesPorCanal.filter((s) => s.canalConversaId).map((s) => [s.canalConversaId!, s]),
  )

  return rows.map((row) => {
    const membro = membershipMap.get(row.id)
    const sede = sedeMap.get(row.id)
    return {
      id: row.id,
      tenantId: row.tenantId,
      nome: formatNomeCanal(row.nome, row.canalOficial),
      descricao: row.descricao,
      avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars, sede?.fotoUrl),
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: membro?.status === 'ATIVO',
      souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
      pedidoPendente: membro?.status === 'PENDENTE',
      silenciada: membro?.status === 'ATIVO' ? membro.silenciada : false,
      tenantNome: formatNomeTorcida(row.tenant.nome),
      tipoUnidade: sede?.tipo ?? null,
      cidade: sede?.cidade ?? null,
      estado: sede?.estado ?? null,
      lat: sede?.lat ?? null,
      lng: sede?.lng ?? null,
    }
  })
})

/**
 * Canais públicos sugeridos no rail da Comunidade Nacional — mesmo recorte de
 * `getSugestoesCanaisParaAside`, mas agregado por clube em vez de tenant.
 */
export const getSugestoesCanaisPublicosParaAside = cache(async function getSugestoesCanaisPublicosParaAside(
  afiliacaoId: string,
  userId?: string,
): Promise<SugestaoCanalAside[]> {
  const canais = await listCanaisPublicosPorAfiliacao(afiliacaoId, userId)
  return canais
    .filter((c) => !c.souMembro && !c.pedidoPendente)
    .sort((a, b) => {
      if (a.canalOficial !== b.canalOficial) return a.canalOficial ? -1 : 1
      return b.membros - a.membros
    })
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      nome: c.nome,
      avatarUrl: c.avatarUrl,
      membros: c.membros,
      canalOficial: c.canalOficial,
      publica: c.publica,
      tenantNome: c.tenantNome,
    }))
})

export async function getCanalPorId(
  conversaId: string,
  viewerTenantId: string,
  userId: string,
): Promise<CanalItem | null> {
  const row: {
    id: string
    tenantId: string
    nome: string | null
    descricao: string | null
    avatarUrl: string | null
    institucional: boolean
    canalOficial: boolean
    visibilidadeCanal: VisibilidadeCanal
    somenteAdminPublica: boolean
    publica: boolean
    tipo: string
    tenant: { nome: string }
    _count: { membros: number }
    membros: Array<{
      papel: 'ADMIN' | 'MEMBRO'
      status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
      silenciada: boolean
    }>
  } | null = await db.conversa.findFirst({
    where: { id: conversaId, tipo: 'CANAL' },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      descricao: true,
      avatarUrl: true,
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: true,
      somenteAdminPublica: true,
      publica: true,
      tipo: true,
      tenant: { select: { nome: true } },
      _count: { select: { membros: { where: { saiuEm: null } } } },
      membros: {
        where: { userId, saiuEm: null },
        select: { papel: true, status: true, silenciada: true },
        take: 1,
      },
    },
  })
  if (!row) return null

  const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal, userId)
  if (!podeVer) return null

  const fallbackAvatars =
    row.canalOficial && !row.avatarUrl
      ? await resolveFallbackAvatarsCanalOficial([row.tenantId])
      : new Map<string, string | null>()

  const membro = row.membros[0]
  const sede: {
    tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
    cidade: string | null
    estado: string | null
    lat: number | null
    lng: number | null
    fotoUrl: string | null
  } | null = await db.sede.findFirst({
    where: { canalConversaId: row.id },
    select: { tipo: true, cidade: true, estado: true, lat: true, lng: true, fotoUrl: true },
  })

  return {
    id: row.id,
    tenantId: row.tenantId,
    nome: formatNomeCanal(row.nome, row.canalOficial),
    descricao: row.descricao,
    avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars, sede?.fotoUrl),
    institucional: row.institucional,
    canalOficial: row.canalOficial,
    visibilidadeCanal: row.visibilidadeCanal,
    somenteAdminPublica: row.somenteAdminPublica,
    publica: row.publica,
    membros: row._count.membros,
    souMembro: membro?.status === 'ATIVO',
    souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
    pedidoPendente: membro?.status === 'PENDENTE',
    silenciada: membro?.status === 'ATIVO' ? membro.silenciada : false,
    tenantNome: formatNomeTorcida(row.tenant.nome),
    tipoUnidade: sede?.tipo ?? null,
    cidade: sede?.cidade ?? null,
    estado: sede?.estado ?? null,
    lat: sede?.lat ?? null,
    lng: sede?.lng ?? null,
  }
}

export async function getPostsDoCanal(
  conversaId: string,
  tenantId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null, status: 'ATIVO' },
    select: { id: true },
  })
  if (!membro) return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }

  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const cursorWhere = buildCursorWhere(decodeCursor(opts.cursor))

  const postsRaw = (await db.post.findMany({
    where: { conversaId, tenantId, oculto: false, ...cursorWhere },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: postInclude(userId),
  })) as PostRaw[]

  const posts = postsRaw.map(projetarPost)
  const hasMore = posts.length > take
  const pagina = await finalizarPosts(posts.slice(0, take))

  return {
    posts: pagina,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null,
    },
  }
}

/**
 * Lista membros ativos de um canal (para o modal de delegação de admin —
 * Tarefa D2). Sem gate de visibilidade próprio: quem chama já deve ter
 * confirmado `canal.souAdmin` (ou permissão equivalente) antes de exibir a UI.
 */
export async function listMembrosCanal(conversaId: string): Promise<MembroCanalItem[]> {
  const rows: Array<{
    userId: string
    papel: 'ADMIN' | 'MEMBRO'
    user: { nome: string | null; avatarUrl: string | null }
  }> = await db.membroConversa.findMany({
    where: { conversaId, saiuEm: null, status: 'ATIVO' },
    orderBy: [{ papel: 'asc' }],
    select: {
      userId: true,
      papel: true,
      user: { select: { nome: true, avatarUrl: true } },
    },
  })
  return rows.map((row) => ({
    userId: row.userId,
    nome: row.user.nome,
    avatarUrl: row.user.avatarUrl,
    papel: row.papel,
  }))
}

/**
 * Membros aprovados do tenant do canal, elegíveis pra adicionar direto (sem
 * esperar pedido) num canal fechado. Exclui quem já está ativo no canal.
 */
export async function listCandidatosMembroCanal(
  tenantId: string,
  conversaId: string,
): Promise<CandidatoMembroCanalItem[]> {
  const [membrosAtivosCanal, saasMembros]: [
    Array<{ userId: string }>,
    Array<{ userId: string; nome: string; user: { nome: string | null } }>,
  ] = await Promise.all([
    db.membroConversa.findMany({
      where: { conversaId, status: 'ATIVO', saiuEm: null },
      select: { userId: true },
    }),
    db.saasMembro.findMany({
      where: { tenantId, status: 'APROVADO' },
      orderBy: { nome: 'asc' },
      take: 200,
      select: { userId: true, nome: true, user: { select: { nome: true } } },
    }),
  ])
  const jaAtivos = new Set(membrosAtivosCanal.map((m) => m.userId))
  return saasMembros
    .filter((m) => !jaAtivos.has(m.userId))
    .map((m) => ({ userId: m.userId, nome: m.user.nome ?? m.nome }))
}

export async function podePublicarNoCanal(
  canal: Pick<CanalItem, 'tenantId' | 'somenteAdminPublica' | 'souAdmin'>,
  viewerTenantId: string,
  permissoes: string[],
): Promise<boolean> {
  if (canal.tenantId !== viewerTenantId) return false
  if (!canal.somenteAdminPublica) return true
  const { PERMISSIONS, hasPermission } = await import('@torcida/types')
  return (
    canal.souAdmin ||
    hasPermission(permissoes, PERMISSIONS.CHANNELS_MANAGE) ||
    hasPermission(permissoes, PERMISSIONS.COMMUNITY_MANAGE) ||
    hasPermission(permissoes, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
  )
}

/**
 * Quem pode ver/decidir pedidos de entrada de um canal fechado
 * (`publica: false`): admin local do canal (temático) ou quem tem
 * `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no tenant — para canal oficial soma
 * `ANNOUNCEMENTS_PUBLISH` (mesmo conjunto de `podePublicarNoCanal`, já que
 * canal oficial não delega admin via `MembroConversa`).
 */
export async function podeGerenciarPedidosCanal(
  canal: Pick<CanalItem, 'tenantId' | 'canalOficial' | 'souAdmin'>,
  viewerTenantId: string,
  permissoes: string[],
): Promise<boolean> {
  if (canal.tenantId !== viewerTenantId) return false
  if (canal.souAdmin) return true
  const { PERMISSIONS, hasPermission } = await import('@torcida/types')
  return (
    hasPermission(permissoes, PERMISSIONS.CHANNELS_MANAGE) ||
    hasPermission(permissoes, PERMISSIONS.COMMUNITY_MANAGE) ||
    (canal.canalOficial && hasPermission(permissoes, PERMISSIONS.ANNOUNCEMENTS_PUBLISH))
  )
}

/**
 * Lista pedidos de entrada de um canal fechado — `PENDENTE` (a decidir) ou
 * `REJEITADO` (histórico de recusados; `saiuEm: null` os distingue de membro
 * removido depois de aprovado, que também vira `REJEITADO` mas com `saiuEm`
 * setado). Sem gate de visibilidade próprio — quem chama já deve ter
 * confirmado `podeGerenciarPedidosCanal` antes de exibir a UI (mesmo padrão
 * de `listMembrosCanal`).
 */
export async function listPedidosCanal(
  conversaId: string,
  status: 'PENDENTE' | 'REJEITADO' = 'PENDENTE',
): Promise<PedidoCanalItem[]> {
  const rows: Array<{
    userId: string
    entrouEm: Date
    user: { nome: string | null; avatarUrl: string | null }
  }> = await db.membroConversa.findMany({
    where: { conversaId, status, saiuEm: null },
    orderBy: { entrouEm: status === 'PENDENTE' ? 'asc' : 'desc' },
    take: status === 'PENDENTE' ? undefined : 30,
    select: {
      userId: true,
      entrouEm: true,
      user: { select: { nome: true, avatarUrl: true } },
    },
  })
  return rows.map((row) => ({
    userId: row.userId,
    nome: row.user.nome,
    avatarUrl: row.user.avatarUrl,
    pedidoEm: row.entrouEm.toISOString(),
  }))
}

export async function listUnidadesVisiveis(
  viewerTenantId: string,
): Promise<UnidadeBuscaItem[]> {
  const visibleIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')
  const [tenants, sedes]: [
    Array<{ id: string; nome: string; logoUrl: string | null }>,
    Array<{ tenantId: string | null; tipo: string; cidade: string | null }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: visibleIds }, ativo: true, sintetico: false },
      select: { id: true, nome: true, logoUrl: true },
      orderBy: { nome: 'asc' },
    }),
    db.sede.findMany({
      where: { tenantId: { in: visibleIds } },
      select: { tenantId: true, tipo: true, cidade: true },
    }),
  ])
  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))

  return tenants.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      logoUrl: t.logoUrl,
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
    }
  })
}

export async function buscarCanaisEUnidades(
  viewerTenantId: string,
  userId: string,
  q: string,
  opts: { visibleTenantIds?: string[] } = {},
): Promise<{ canais: CanalItem[]; unidades: UnidadeBuscaItem[] }> {
  const termo = q.trim()
  if (termo.length < 2) return { canais: [], unidades: [] }

  const visibleIds = opts.visibleTenantIds ?? (await getVisibleTenantIds(viewerTenantId, 'comunidade'))

  const [canalRows, tenantRows]: [
    Array<{
      id: string
      tenantId: string
      nome: string | null
      descricao: string | null
      avatarUrl: string | null
      institucional: boolean
      canalOficial: boolean
      visibilidadeCanal: VisibilidadeCanal
      somenteAdminPublica: boolean
      publica: boolean
      tenant: { nome: string }
      _count: { membros: number }
      membros: Array<{
        papel: 'ADMIN' | 'MEMBRO'
        status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
        silenciada: boolean
      }>
    }>,
    Array<{ id: string; nome: string; logoUrl: string | null }>,
  ] = await Promise.all([
    db.conversa.findMany({
      where: {
        tenantId: { in: visibleIds },
        tipo: 'CANAL',
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          { descricao: { contains: termo, mode: 'insensitive' } },
        ],
      },
      take: 15,
      select: {
        id: true,
        tenantId: true,
        nome: true,
        descricao: true,
        avatarUrl: true,
        institucional: true,
        canalOficial: true,
        visibilidadeCanal: true,
        somenteAdminPublica: true,
        publica: true,
        tenant: { select: { nome: true } },
        _count: { select: { membros: { where: { saiuEm: null } } } },
        membros: {
          where: { userId, saiuEm: null },
          select: { papel: true, status: true, silenciada: true },
          take: 1,
        },
      },
    }),
    db.tenant.findMany({
      where: {
        id: { in: visibleIds },
        ativo: true,
        nome: { contains: termo, mode: 'insensitive' },
      },
      take: 10,
      select: { id: true, nome: true, logoUrl: true },
    }),
  ])

  // Visibilidade dos canais e busca de sedes das unidades são independentes.
  const [canaisVisiveis, sedes, fallbackAvatars, sedesPorCanal]: [
    Array<(typeof canalRows)[number] | null>,
    Array<{ tenantId: string | null; tipo: string; cidade: string | null }>,
    Map<string, string | null>,
    Array<{ canalConversaId: string | null; fotoUrl: string | null }>,
  ] = await Promise.all([
    Promise.all(
      canalRows.map(async (row) => {
        const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal, userId)
        return podeVer ? row : null
      }),
    ),
    db.sede.findMany({
      where: { tenantId: { in: tenantRows.map((t) => t.id) } },
      select: { tenantId: true, tipo: true, cidade: true },
    }),
    resolveFallbackAvatarsCanalOficial(
      canalRows.filter((row) => row.canalOficial && !row.avatarUrl).map((row) => row.tenantId),
    ),
    canalRows.length === 0
      ? Promise.resolve([] as Array<{ canalConversaId: string | null; fotoUrl: string | null }>)
      : db.sede.findMany({
          where: { canalConversaId: { in: canalRows.map((r) => r.id) } },
          select: { canalConversaId: true, fotoUrl: true },
        }),
  ])

  const sedeFotoPorCanal = new Map(
    sedesPorCanal
      .filter((s): s is { canalConversaId: string; fotoUrl: string | null } => !!s.canalConversaId)
      .map((s) => [s.canalConversaId, s.fotoUrl]),
  )

  const canais: CanalItem[] = []
  for (const row of canaisVisiveis) {
    if (!row) continue
    const membro = row.membros[0]
    canais.push({
      id: row.id,
      tenantId: row.tenantId,
      nome: formatNomeCanal(row.nome, row.canalOficial),
      descricao: row.descricao,
      avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars, sedeFotoPorCanal.get(row.id)),
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: membro?.status === 'ATIVO',
      souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
      pedidoPendente: membro?.status === 'PENDENTE',
      silenciada: membro?.status === 'ATIVO' ? membro.silenciada : false,
      tenantNome: formatNomeTorcida(row.tenant.nome),
      tipoUnidade: null,
      cidade: null,
      estado: null,
      lat: null,
      lng: null,
    })
  }

  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))

  const unidades: UnidadeBuscaItem[] = tenantRows.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      logoUrl: t.logoUrl,
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
    }
  })

  return { canais, unidades }
}
