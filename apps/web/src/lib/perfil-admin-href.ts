/**
 * Destino operacional da pessoa no admin, a partir do perfil da comunidade.
 *
 * Sócio e torcedor vivem em listagens distintas. O link já leva à aba certa
 * (`status`) e preenche a busca (`q`) com o nome da ficha — senão a página de
 * Sócios cai na fila de solicitações sem filtro, e a pessoa some no meio.
 * Sem ficha, só o super-admin tem tela: a listagem de usuários da plataforma.
 */

import { PARAM_BUSCA, VALOR_FILTRO_TAMANHO_MAX } from '@/lib/listagem'

export type TipoAdminPessoa = 'SOCIO' | 'TORCEDOR'

export type StatusMembroAdmin = 'PENDENTE' | 'APROVADO' | 'REPROVADO'

/** Abas de `/admin/socios` — o default da página (solicitações) é o errado para sócio emitido. */
export type AbaSociosAdmin =
  | 'solicitacoes'
  | 'aguardando'
  | 'todos'
  | 'ativos'
  | 'vencendo'
  | 'vencidos'

export type StatusTorcedoresAdmin = StatusMembroAdmin | 'DESLIGADO'

export interface HrefAdminPessoaArgs {
  membroId: string | null
  userId: string
  superAdmin: boolean
  tipo?: TipoAdminPessoa | null
  status?: string | null
  nome?: string | null
  desligadoEm?: Date | string | null
  /** Carteirinha (`SaasSocio`) no tenant do admin. Sócio aprovado sem ela → Aguardando emissão. */
  temCarteirinha?: boolean
}

function termoBusca(nome: string | null | undefined): string {
  const q = nome?.trim() ?? ''
  if (!q) return ''
  return q.slice(0, VALOR_FILTRO_TAMANHO_MAX)
}

function hrefComBusca(path: string, q: string, extras: Record<string, string> = {}): string {
  const search = new URLSearchParams()
  for (const [chave, valor] of Object.entries(extras)) {
    if (valor) search.set(chave, valor)
  }
  if (q) search.set(PARAM_BUSCA, q)
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

function statusMembro(raw: string | null | undefined): StatusMembroAdmin | null {
  if (raw === 'PENDENTE' || raw === 'APROVADO' || raw === 'REPROVADO') return raw
  return null
}

export function abaSociosAdmin(args: {
  status?: string | null
  temCarteirinha?: boolean
}): AbaSociosAdmin {
  const status = statusMembro(args.status)
  if (status === 'PENDENTE') return 'solicitacoes'
  if (args.temCarteirinha) return 'todos'
  if (status === 'APROVADO') return 'aguardando'
  return 'solicitacoes'
}

export function statusTorcedoresAdmin(args: {
  status?: string | null
  desligadoEm?: Date | string | null
}): StatusTorcedoresAdmin | null {
  if (args.desligadoEm) return 'DESLIGADO'
  return statusMembro(args.status)
}

export function hrefAdminPessoa(args: HrefAdminPessoaArgs): string | null {
  const q = termoBusca(args.nome)

  if (args.membroId) {
    if (args.tipo === 'SOCIO') {
      return hrefComBusca('/admin/socios', q, {
        status: abaSociosAdmin({
          status: args.status,
          temCarteirinha: args.temCarteirinha,
        }),
      })
    }

    const status = statusTorcedoresAdmin({
      status: args.status,
      desligadoEm: args.desligadoEm,
    })
    return hrefComBusca(
      '/admin/torcedores',
      q,
      status ? { status } : {},
    )
  }

  if (args.superAdmin && args.userId) {
    return `/super-admin/usuarios?id=${encodeURIComponent(args.userId)}`
  }
  return null
}
