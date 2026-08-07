import 'server-only'

import { db } from '@torcida/db'
import { orPostsDoMuralCanal } from '@/lib/canais-shared'
import { resolverFeedInternoDoMural } from '@/lib/canais'
import {
  MAX_CANAIS_ATIVIDADE,
  chaveAtividadeCanal,
  chaveAtividadeNacional,
} from '@/lib/comunidade-canal-atividade'

export type AtividadeCanaisBarraResult = {
  /** chave → ISO do post mais recente (só chaves com atividade). */
  heads: Record<string, string>
}

/**
 * Cabeça de atividade dos murais abertos na barra de escudos.
 * Membership (ou leitura operador) gateia os conversaIds; nacional é opcional.
 */
export async function getAtividadeCanaisBarra(opts: {
  userId: string
  conversaIds: string[]
  afiliacaoId?: string | null
  viewerTenantId?: string | null
  leituraOperador?: boolean
}): Promise<AtividadeCanaisBarraResult> {
  const ids = [...new Set(opts.conversaIds.filter(Boolean))].slice(0, MAX_CANAIS_ATIVIDADE)
  const heads: Record<string, string> = {}

  const [permitidos, nacionalHead] = await Promise.all([
    ids.length > 0
      ? filtrarConversaIdsPermitidos(opts.userId, ids, opts.leituraOperador === true)
      : Promise.resolve([] as string[]),
    opts.afiliacaoId
      ? maxCriadoEmNacional(opts.afiliacaoId)
      : Promise.resolve(null as Date | null),
  ])

  if (nacionalHead) {
    heads[chaveAtividadeNacional(opts.afiliacaoId!)] = nacionalHead.toISOString()
  }

  if (permitidos.length === 0) {
    return { heads }
  }

  const meta: Array<{ id: string; canalOficial: boolean; tenantId: string }> =
    await db.conversa.findMany({
      where: { id: { in: permitidos }, tipo: 'CANAL' },
      select: { id: true, canalOficial: true, tenantId: true },
    })

  const porId = new Map(meta.map((c) => [c.id, c]))
  const idsValidos = permitidos.filter((id) => porId.has(id))

  const grouped: Array<{ conversaId: string | null; _max: { criadoEm: Date | null } }> =
    await db.post.groupBy({
      by: ['conversaId'],
      where: {
        conversaId: { in: idsValidos },
        oculto: false,
      },
      _max: { criadoEm: true },
    })

  for (const row of grouped) {
    if (!row.conversaId || !row._max.criadoEm) continue
    heads[chaveAtividadeCanal(row.conversaId)] = row._max.criadoEm.toISOString()
  }

  // Oficiais na barra (Minha torcida / unidade): misturam "Só torcida" sem conversaId.
  if (opts.viewerTenantId) {
    const oficiais = idsValidos.filter((id) => porId.get(id)?.canalOficial)
    await Promise.all(
      oficiais.map(async (canalId) => {
        const feed = await resolverFeedInternoDoMural({
          canalId,
          canalOficial: true,
          userId: opts.userId,
          viewerTenantId: opts.viewerTenantId!,
        })
        if (!feed.incluir || !feed.feedInternoTenantId) return

        const interno: { criadoEm: Date } | null = await db.post.findFirst({
          where: {
            oculto: false,
            AND: [{ OR: orPostsDoMuralCanal(canalId, feed.feedInternoTenantId) }],
          },
          orderBy: { criadoEm: 'desc' },
          select: { criadoEm: true },
        })
        if (!interno) return

        const chave = chaveAtividadeCanal(canalId)
        const atual = heads[chave]
        const iso = interno.criadoEm.toISOString()
        if (!atual || Date.parse(iso) > Date.parse(atual)) {
          heads[chave] = iso
        }
      }),
    )
  }

  return { heads }
}

async function filtrarConversaIdsPermitidos(
  userId: string,
  ids: string[],
  leituraOperador: boolean,
): Promise<string[]> {
  if (leituraOperador) return ids

  const [membros, vinculoOficiais] = await Promise.all([
    db.membroConversa.findMany({
      where: {
        userId,
        conversaId: { in: ids },
        saiuEm: null,
        status: 'ATIVO',
      },
      select: { conversaId: true },
    }) as Promise<Array<{ conversaId: string }>>,
    // Oficial do vínculo (sede.canalConversaId) — torcedor na unidade e
    // sócio na Sede/unidade, mesmo se o roster ainda não espelhou.
    db.saasMembro.findMany({
      where: {
        userId,
        espelhado: false,
        desligadoEm: null,
        OR: [
          { status: 'APROVADO' },
          { status: 'PENDENTE', tipo: 'SOCIO' },
        ],
        sede: { canalConversaId: { in: ids } },
      },
      select: { sede: { select: { canalConversaId: true } } },
    }) as Promise<Array<{ sede: { canalConversaId: string | null } | null }>>,
  ])

  const permitidos = new Set<string>()
  for (const m of membros) permitidos.add(m.conversaId)
  for (const v of vinculoOficiais) {
    const cid = v.sede?.canalConversaId
    if (cid && ids.includes(cid)) permitidos.add(cid)
  }
  return [...permitidos]
}

/** Aproximação leve do topo Descobrir CN (sintético + alcanceNacional). */
async function maxCriadoEmNacional(afiliacaoId: string): Promise<Date | null> {
  const post: { criadoEm: Date } | null = await db.post.findFirst({
    where: {
      oculto: false,
      visibilidade: 'PUBLICO',
      tipo: 'MEMBRO',
      conversaId: null,
      OR: [
        { tenant: { afiliacaoId, sintetico: true } },
        { alcanceNacional: true, tenant: { afiliacaoId } },
      ],
    },
    orderBy: { criadoEm: 'desc' },
    select: { criadoEm: true },
  })
  return post?.criadoEm ?? null
}
