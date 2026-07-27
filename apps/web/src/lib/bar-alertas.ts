import 'server-only'

import { db, Prisma } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { notificarUsuariosComPermissao } from '@/lib/notificacoes'
import { listarEstoqueBaixo } from '@/lib/bar'

/** Janela de deduplicação do alerta de estoque baixo — não repetir em < 24h. */
const JANELA_DEDUPE_ESTOQUE_MS = 24 * 60 * 60 * 1000

type TenantSedeCombo = { tenantId: string; sedeId: string }

/**
 * Alerta proativo de estoque baixo do Bar (cron).
 * Para cada tenant/sede com produtos ativos abaixo do mínimo, notifica
 * `bar:manage` — sem duplicar quando já existe alerta não lido do mesmo
 * produto criado nas últimas 24h (idempotência via `link` estável).
 */
export async function dispatchAlertasEstoqueBaixoBar(now = new Date()): Promise<{
  processados: number
  notificados: number
}> {
  const combos: TenantSedeCombo[] = await db.barProduto.groupBy({
    by: ['tenantId', 'sedeId'],
    where: {
      ativo: true,
      estoqueMinimo: { not: null },
      tenant: { ativo: true, sintetico: false },
    },
  })

  let processados = 0
  let notificados = 0
  const desde = new Date(now.getTime() - JANELA_DEDUPE_ESTOQUE_MS)

  for (const { tenantId, sedeId } of combos) {
    const baixos = await listarEstoqueBaixo(tenantId, sedeId)
    if (baixos.length === 0) continue

    const links = baixos.map((produto) => `/admin/bar/estoque?produtoId=${produto.id}`)
    const existentes: Array<{ link: string | null }> = await db.notificacao.findMany({
      where: {
        tenantId,
        tipo: 'BAR_ESTOQUE_BAIXO',
        lida: false,
        criadoEm: { gte: desde },
        link: { in: links },
      },
      select: { link: true },
    })
    const jaAlertados = new Set(existentes.map((n) => n.link))

    for (const produto of baixos) {
      processados += 1
      const link = `/admin/bar/estoque?produtoId=${produto.id}`
      if (jaAlertados.has(link)) continue

      notificados += await notificarUsuariosComPermissao(PERMISSIONS.BAR_MANAGE, {
        tenantId,
        tipo: 'BAR_ESTOQUE_BAIXO',
        titulo: 'Estoque baixo no Bar',
        corpo: `${produto.nome} está com ${produto.estoque} un. em estoque (mínimo ${produto.estoqueMinimo}).`,
        link,
      })
    }
  }

  return { processados, notificados }
}

type FiadoVencidoLite = {
  id: string
  tenantId: string
  valor: Prisma.Decimal
  user: { nome: string | null }
}

/**
 * Vence fiados pendentes do Bar (cron) e notifica `bar:manage`.
 * A própria transição PENDENTE → VENCIDA é o gatilho: cada fiado só passa
 * por ela uma vez, então não é preciso checar notificação duplicada.
 */
export async function dispatchAlertasFiadoVencidoBar(now = new Date()): Promise<{
  processados: number
  notificados: number
}> {
  const vencidos: FiadoVencidoLite[] = await db.barFiado.findMany({
    where: { status: 'PENDENTE', vencimento: { lt: now } },
    select: {
      id: true,
      tenantId: true,
      valor: true,
      user: { select: { nome: true } },
    },
  })

  if (vencidos.length === 0) return { processados: 0, notificados: 0 }

  await db.barFiado.updateMany({
    where: { id: { in: vencidos.map((fiado) => fiado.id) } },
    data: { status: 'VENCIDA' },
  })

  let notificados = 0
  for (const fiado of vencidos) {
    const valorFmt = Number(fiado.valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
    const devedor = fiado.user.nome ?? 'associado'
    notificados += await notificarUsuariosComPermissao(PERMISSIONS.BAR_MANAGE, {
      tenantId: fiado.tenantId,
      tipo: 'BAR_FIADO_VENCIDO',
      titulo: 'Fiado vencido no Bar',
      corpo: `${devedor} — ${valorFmt} venceu sem pagamento.`,
      link: '/admin/bar/fiado',
    })
  }

  return { processados: vencidos.length, notificados }
}
