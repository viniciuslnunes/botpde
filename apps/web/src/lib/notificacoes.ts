import { db } from '@torcida/db'
import type { Notificacao, TipoNotificacao } from '@torcida/db'

type CriarNotificacaoInput = {
  userId: string
  tenantId: string
  tipo: TipoNotificacao
  titulo: string
  corpo?: string
  link?: string
}

export async function criarNotificacao(input: CriarNotificacaoInput): Promise<Notificacao> {
  return db.notificacao.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo,
      link: input.link,
    },
  })
}
