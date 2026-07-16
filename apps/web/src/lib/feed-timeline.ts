import { db } from '@torcida/db'

type TimelineSeed = {
  postId: string
  autorId: string
  criadoEm: Date
}

const FEED_SCOPE_WHERE = {
  tipo: 'MEMBRO' as const,
  oculto: false,
  conversaId: null,
}

async function createTimelineEntries(viewerIds: string[], seed: TimelineSeed): Promise<void> {
  const uniqueViewerIds = [...new Set(viewerIds)]
  if (uniqueViewerIds.length === 0) return

  await db.feedTimeline.createMany({
    data: uniqueViewerIds.map((viewerId) => ({
      viewerId,
      postId: seed.postId,
      autorId: seed.autorId,
      criadoEm: seed.criadoEm,
    })),
    skipDuplicates: true,
  })
}

/** Fan-out do post para o próprio autor e seguidores aprovados. */
export async function fanoutPostParaRede(seed: TimelineSeed): Promise<void> {
  const seguidores: Array<{ seguidorId: string }> = await db.seguimento.findMany({
    where: { seguidoId: seed.autorId, status: 'APROVADO' },
    select: { seguidorId: true },
  })

  await createTimelineEntries(
    [seed.autorId, ...seguidores.map((row) => row.seguidorId)],
    seed,
  )
}

/** Só seguidores — autor já materializado no request. */
export async function fanoutSeguidoresPostParaRede(seed: TimelineSeed): Promise<void> {
  const seguidores: Array<{ seguidorId: string }> = await db.seguimento.findMany({
    where: { seguidoId: seed.autorId, status: 'APROVADO' },
    select: { seguidorId: true },
  })
  if (seguidores.length === 0) return
  await createTimelineEntries(
    seguidores.map((row) => row.seguidorId),
    seed,
  )
}

/** Backfill histórico dos posts do autor para um viewer recém-aprovado. */
export async function backfillTimelineDoAutorParaViewer(
  viewerId: string,
  autorId: string,
): Promise<void> {
  const posts: Array<{ id: string; autorId: string; criadoEm: Date }> = await db.post.findMany({
    where: {
      autorId,
      ...FEED_SCOPE_WHERE,
    },
    select: { id: true, autorId: true, criadoEm: true },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })

  if (posts.length === 0) return

  await db.feedTimeline.createMany({
    data: posts.map((post) => ({
      viewerId,
      postId: post.id,
      autorId: post.autorId,
      criadoEm: post.criadoEm,
    })),
    skipDuplicates: true,
  })
}

/** Remove os posts do autor da timeline do viewer ao desfazer um follow aprovado. */
export async function removerTimelineDoAutorParaViewer(
  viewerId: string,
  autorId: string,
): Promise<void> {
  await db.feedTimeline.deleteMany({
    where: { viewerId, autorId },
  })
}

/** Reconstrói a timeline inteira do viewer quando ainda não existe materialização. */
export async function reconstruirTimelineDaRedeDoViewer(viewerId: string): Promise<void> {
  const [seguindo, meusPosts]: [
    Array<{ seguidoId: string }>,
    Array<{ id: string; autorId: string; criadoEm: Date }>,
  ] = await Promise.all([
    db.seguimento.findMany({
      where: { seguidorId: viewerId, status: 'APROVADO' },
      select: { seguidoId: true },
    }),
    db.post.findMany({
      where: { autorId: viewerId, ...FEED_SCOPE_WHERE },
      select: { id: true, autorId: true, criadoEm: true },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    }),
  ])

  const autorIds = [...new Set([viewerId, ...seguindo.map((row) => row.seguidoId)])]
  if (autorIds.length === 0) return

  const posts: Array<{ id: string; autorId: string; criadoEm: Date }> = await db.post.findMany({
    where: {
      autorId: { in: autorIds },
      ...FEED_SCOPE_WHERE,
    },
    select: { id: true, autorId: true, criadoEm: true },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })

  const allPosts = [...meusPosts, ...posts]
  if (allPosts.length === 0) return

  await db.feedTimeline.createMany({
    data: allPosts.map((post) => ({
      viewerId,
      postId: post.id,
      autorId: post.autorId,
      criadoEm: post.criadoEm,
    })),
    skipDuplicates: true,
  })
}

/** Garante a timeline materializada para leitores antigos após o rollout. */
export async function garantirTimelineDaRedeDoViewer(viewerId: string): Promise<void> {
  const existente: { id: string } | null = await db.feedTimeline.findFirst({
    where: { viewerId },
    select: { id: true },
  })
  if (existente) return
  await reconstruirTimelineDaRedeDoViewer(viewerId)
}

/**
 * Materializa só o autor na timeline (rápido) — seguidores vão via
 * `scheduleFanoutPostParaRede` (fila Redis / in-process).
 */
export async function materializarTimelineAutor(seed: TimelineSeed): Promise<void> {
  await createTimelineEntries([seed.autorId], seed)
}


