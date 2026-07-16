import { db } from '@torcida/db'
import { MAX_MENCOES_POR_CONTEUDO } from '@torcida/types'
import { criarNotificacao } from '@/lib/notificacoes'
import { extrairHashtags, extrairMencoes } from '@/lib/comunidade-social'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'

export async function sincronizarHashtagsDoPost(
  postId: string,
  tenantId: string,
  conteudo: string,
): Promise<void> {
  const tags = extrairHashtags(conteudo)
  await db.postHashtag.deleteMany({ where: { postId } })
  if (tags.length === 0) return

  for (const tag of tags) {
    const hashtag: { id: string } = await db.hashtag.upsert({
      where: { tenantId_tag: { tenantId, tag } },
      create: { tenantId, tag },
      update: {},
      select: { id: true },
    })
    await db.postHashtag.upsert({
      where: { postId_hashtagId: { postId, hashtagId: hashtag.id } },
      create: { postId, hashtagId: hashtag.id },
      update: {},
    })
  }
}

export async function notificarMencoesDoPost(opts: {
  conteudo: string
  autorId: string
  autorNome: string | null
  tenantId: string
  postId: string
  link: string
}): Promise<void> {
  const limiterKey = `mencoes:${opts.tenantId}:${opts.autorId}`
  if (excedeuLimiteEngajamento(limiterKey)) return

  const mencoes = extrairMencoes(opts.conteudo)
    .filter((m) => m.userId !== opts.autorId)
    .slice(0, MAX_MENCOES_POR_CONTEUDO)

  if (mencoes.length === 0) return

  registrarAcaoEngajamento(limiterKey)

  for (const m of mencoes) {
    await criarNotificacao({
      userId: m.userId,
      tenantId: opts.tenantId,
      tipo: 'MENCAO',
      titulo: 'Você foi mencionado',
      corpo: `${opts.autorNome ?? 'Um membro'} mencionou você em uma publicação.`,
      link: opts.link,
      atorId: opts.autorId,
    })
  }
}
