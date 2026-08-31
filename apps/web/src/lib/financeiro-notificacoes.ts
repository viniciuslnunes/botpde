import { db } from '@torcida/db'
import { formatarMoedaBRL, hrefHomeDepartamento, PERMISSIONS } from '@torcida/types'
import {
  criarNotificacoesEmLoteSePendentes,
  listarUserIdsGestoresDepartamento,
  notificarUsuariosComPermissao,
  reconciliarNotificacoesDoEvento,
} from '@/lib/notificacoes'
import { listarDestinatariosPorPermissoes } from '@/lib/notificacoes-routing'

function hrefAdminLancamento(lancamentoId: string): string {
  return `/admin/financeiro/lancamentos?lancamento=${lancamentoId}`
}

function hrefPortalLancamento(slug: string, lancamentoId: string): string {
  return `${hrefHomeDepartamento(slug)}?lancamento=${lancamentoId}`
}

export function linksLancamentoParaReconciliar(lancamentoId: string, slug?: string | null): string[] {
  const links = [hrefAdminLancamento(lancamentoId)]
  if (slug) links.push(hrefPortalLancamento(slug, lancamentoId))
  return links
}

/** Aviso operacional de lançamento avulso — não dispara em Bar/Loja/cobrança auto. */
export async function notificarLancamentoFinanceiroAvulso(opts: {
  tenantId: string
  lancamentoId: string
  tipo: 'RECEITA' | 'DESPESA'
  descricao: string
  valor: number
  departamentoId: string | null
  atorId: string
}): Promise<void> {
  const sinal = opts.tipo === 'RECEITA' ? 'Receita' : 'Despesa'
  const titulo = `${sinal} no caixa: ${formatarMoedaBRL(opts.valor)}`
  const corpo = opts.descricao.slice(0, 280)

  await notificarUsuariosComPermissao(PERMISSIONS.FINANCE_MANAGE, {
    tenantId: opts.tenantId,
    tipo: 'FINANCEIRO_LANCAMENTO',
    titulo,
    corpo,
    link: hrefAdminLancamento(opts.lancamentoId),
    atorId: opts.atorId,
    excetoUserId: opts.atorId,
  })

  if (!opts.departamentoId) return

  const depto: { slug: string } | null = await db.departamento.findFirst({
    where: { id: opts.departamentoId, tenantId: opts.tenantId },
    select: { slug: true },
  })
  if (!depto) return

  const [gestores, financeiros] = await Promise.all([
    listarUserIdsGestoresDepartamento(opts.tenantId, opts.departamentoId, opts.atorId),
    listarDestinatariosPorPermissoes(opts.tenantId, [PERMISSIONS.FINANCE_MANAGE], opts.atorId),
  ])
  const jaAvisados = new Set(financeiros)
  const soDepto = gestores.filter((id) => !jaAvisados.has(id) && id !== opts.atorId)
  if (soDepto.length === 0) return

  await criarNotificacoesEmLoteSePendentes(
    soDepto.map((userId) => ({
      userId,
      tenantId: opts.tenantId,
      tipo: 'FINANCEIRO_LANCAMENTO',
      titulo,
      corpo,
      link: hrefPortalLancamento(depto.slug, opts.lancamentoId),
      atorId: opts.atorId,
    })),
  )
}

export async function reconciliarLancamentoFinanceiroAvulso(
  tenantId: string,
  lancamentoId: string,
  departamentoId?: string | null,
): Promise<void> {
  let slug: string | null = null
  if (departamentoId) {
    const depto: { slug: string } | null = await db.departamento.findFirst({
      where: { id: departamentoId, tenantId },
      select: { slug: true },
    })
    slug = depto?.slug ?? null
  }
  await reconciliarNotificacoesDoEvento(tenantId, {
    tipo: 'FINANCEIRO_LANCAMENTO',
    links: linksLancamentoParaReconciliar(lancamentoId, slug),
  })
}
