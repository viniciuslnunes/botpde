import 'server-only'
import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { StatusReativacaoCanal, TipoNotificacao } from '@torcida/db'
import { PERMISSIONS, formatNomeTorcida } from '@torcida/types'
import { getAncestorTenantIds, invalidateHierarchyCache } from '@/lib/hierarquia'
import {
  invalidarCacheSalasPresenca,
  invalidarCachesComunidadeFeed,
  invalidarFeedNacional,
} from '@/lib/comunidade-cache'
import { invalidateIsolamentoCache } from '@/lib/isolamento'
import { notificarUsuariosComPermissao } from '@/lib/notificacoes'

/**
 * R5 — transições de canal restrito compartilhadas entre a unidade
 * (`/admin/configuracoes`), a Sede (`/admin/sedes`) e o cron de expiração.
 * Toda transição passa por aqui para que invalidação de cache, auditoria e
 * notificação nunca fiquem de fora de um caminho.
 */

/**
 * Devolve (ou retira) a torcida da malha de interação. Como o isolamento é
 * derivado em LEITURA, invalidar os caches é literalmente o que reestabelece
 * alianças, comunidade nacional, salas, lojas e conversas — nenhum dado
 * precisa ser reescrito.
 */
export async function propagarMudancaDeIsolamento(tenantId: string): Promise<void> {
  invalidateIsolamentoCache()
  invalidateHierarchyCache(tenantId)
  invalidarCachesComunidadeFeed(tenantId)

  // A Comunidade Nacional é chaveada por CLUBE, não por tenant: sem esta tag,
  // o feed nacional continuaria servindo (ou escondendo) a unidade até o
  // `revalidate` natural. Vale para os dois sentidos do toggle.
  const tenant: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { afiliacaoId: true },
  })
  if (tenant?.afiliacaoId) {
    invalidarFeedNacional(tenant.afiliacaoId)
    invalidarCacheSalasPresenca(tenantId, tenant.afiliacaoId)
  }

  // A Sede da unidade também mostra badge e ações — o feed dela muda junto.
  const raiz = await resolverSedeRaiz(tenantId)
  if (raiz) invalidarCachesComunidadeFeed(raiz)

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/sedes')
  revalidatePath('/admin/torcida')
}

/** Tenant raiz da torcida (a Sede) a partir de uma unidade descendente. */
export async function resolverSedeRaiz(tenantId: string): Promise<string | null> {
  const ancestrais = await getAncestorTenantIds(tenantId)
  return ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : null
}

interface AvisoCanal {
  tipo: TipoNotificacao
  titulo: string
  corpo: string
  /** Tenant que recebe o aviso; padrão: a Sede raiz da unidade. */
  tenantDestinoId?: string
}

/** Avisa a administração da Sede sobre uma mudança no canal de uma unidade. */
export async function notificarSedeSobreCanal(
  tenantId: string,
  atorId: string | null,
  aviso: AvisoCanal,
): Promise<void> {
  const destino = aviso.tenantDestinoId ?? (await resolverSedeRaiz(tenantId))
  if (!destino) return

  await notificarUsuariosComPermissao(PERMISSIONS.TORCIDA_GLOBAL_VIEW, {
    tenantId: destino,
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    corpo: aviso.corpo,
    link: '/admin/sedes',
    atorId: atorId ?? undefined,
  })
}

/** Avisa a liderança da unidade (quem decide o canal). */
export async function notificarUnidadeSobreCanal(
  tenantId: string,
  atorId: string | null,
  aviso: Omit<AvisoCanal, 'tenantDestinoId'>,
): Promise<void> {
  await notificarUsuariosComPermissao(PERMISSIONS.SETTINGS_MANAGE, {
    tenantId,
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    corpo: aviso.corpo,
    link: '/admin/configuracoes',
    atorId: atorId ?? undefined,
  })
}

interface ReabrirCanalInput {
  tenantId: string
  tenantNome: string
  /** Null no cron (reativação automática, sem ator humano). */
  atorId: string | null
  /** Ação registrada no AuditLog. */
  acao: string
  /** Desfecho gravado nas solicitações que estavam em aberto. */
  statusSolicitacao: Extract<StatusReativacaoCanal, 'APROVADA' | 'EXPIRADA' | 'IMPOSTA'>
  motivo?: string
  corpoNotificacao: string
}

/**
 * Reabre o canal: zera a flag no tenant, fecha as solicitações em aberto com o
 * desfecho informado, audita e avisa os dois lados. Idempotente — reabrir um
 * canal já aberto não gera efeito colateral além do log.
 */
export async function reabrirCanal(input: ReabrirCanalInput): Promise<void> {
  const agora = new Date()

  await db.$transaction([
    db.tenant.update({
      where: { id: input.tenantId },
      data: { canalRestrito: false, canalRestritoDesde: null, canalRestritoPorId: null },
    }),
    db.solicitacaoReativacaoCanal.updateMany({
      where: { tenantId: input.tenantId, status: 'PENDENTE' },
      data: {
        status: input.statusSolicitacao,
        decididoPorId: input.atorId,
        decididoEm: agora,
        ...(input.motivo ? { motivo: input.motivo } : {}),
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        atorId: input.atorId,
        acao: input.acao,
        entidade: 'Tenant',
        entidadeId: input.tenantId,
        detalhes: {
          restrito: false,
          desfecho: input.statusSolicitacao,
          ...(input.motivo ? { motivo: input.motivo } : {}),
        },
      },
    }),
  ])

  await propagarMudancaDeIsolamento(input.tenantId)

  const nome = formatNomeTorcida(input.tenantNome)
  await Promise.all([
    notificarSedeSobreCanal(input.tenantId, input.atorId, {
      tipo: 'CANAL_REATIVADO',
      titulo: `Canal de ${nome} reativado`,
      corpo: input.corpoNotificacao,
    }),
    notificarUnidadeSobreCanal(input.tenantId, input.atorId, {
      tipo: 'CANAL_REATIVADO',
      titulo: 'O canal da unidade voltou a ser aberto',
      corpo: input.corpoNotificacao,
    }),
  ])
}
