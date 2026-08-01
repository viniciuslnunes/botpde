import type { TipoNotificacao } from '@torcida/db'
import {
  AtSign,
  Handshake,
  Heart,
  IdCard,
  Lock,
  LockOpen,
  Mail,
  Megaphone,
  MessageCircle,
  PackageCheck,
  PackageX,
  Repeat2,
  ShieldAlert,
  ShieldOff,
  Truck,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  UserMinus,
  Users,
  Wallet,
  Calendar,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'

/** Ícone por tipo de notificação — estilo redes sociais. */
const ICONE_POR_TIPO: Record<TipoNotificacao, LucideIcon> = {
  SEGUIMENTO_PENDENTE: UserPlus,
  SEGUIMENTO_APROVADO: UserCheck,
  SEGUIMENTO_REJEITADO: UserX,
  NOVO_COMENTARIO: MessageCircle,
  NOVA_REACAO: Heart,
  COMUNICADO_URGENTE: Megaphone,
  DENUNCIA_NOVA: ShieldAlert,
  DENUNCIA_RESOLVIDA: ShieldAlert,
  NOVA_MENSAGEM: Mail,
  MENSAGEM_SOLICITACAO_PENDENTE: Mail,
  MENSAGEM_SOLICITACAO_APROVADA: UserCheck,
  MENSAGEM_SOLICITACAO_REJEITADA: UserX,
  MENCAO: AtSign,
  REPOST: Repeat2,
  ALIANCA_PROPOSTA: Handshake,
  ALIANCA_ACEITA: Handshake,
  ALIANCA_REJEITADA: Handshake,
  ALIANCA_ENCERRADA: Handshake,
  ALIANCA_CANCELADA: Handshake,
  MEMBRO_APROVADO: UserCheck,
  MEMBRO_REPROVADO: UserX,
  MEMBRO_SOLICITADO: UserCog,
  COBRANCA_PENDENTE: Wallet,
  COBRANCA_VENCIDA: Wallet,
  EVENTO_LEMBRETE: Calendar,
  EVENTO_RSVP: Calendar,
  EVENTO_DIA_GESTOR: Calendar,
  GRUPO_PEDIDO: Users,
  GRUPO_APROVADO: UserCheck,
  GRUPO_REJEITADO: UserX,
  GRUPO_ADMIN: ShieldAlert,
  GRUPO_REMOVIDO: UserMinus,
  CANAL_PEDIDO: Users,
  CANAL_APROVADO: UserCheck,
  CANAL_REJEITADO: UserX,
  PEDIDO_CONFIRMADO: PackageCheck,
  PEDIDO_CANCELADO: PackageX,
  PEDIDO_ENTREGUE: Truck,
  SOCIO_CARTEIRINHA_EMITIDA: IdCard,
  SOCIO_CARTEIRINHA_RENOVADA: IdCard,
  SOCIO_CARTEIRINHA_REVOGADA: ShieldOff,
  ACESSO_ATUALIZADO: UserCog,
  DEPARTAMENTO_ADICIONADO: Users,
  DEPARTAMENTO_REMOVIDO: UserMinus,
  SEDE_RESPONSAVEL_DEFINIDO: UserCog,
  BAR_VENDA_ESTORNADA: PackageX,
  BAR_ESTOQUE_BAIXO: PackageX,
  BAR_FIADO_VENCIDO: Wallet,
  BAR_COMANDA_VENCIDA: Wallet,
  BAR_TURNO_DIVERGENCIA: ShieldAlert,
  BAR_ESTORNO_ANOMALO: ShieldAlert,
  PATRIMONIO_RESPONSAVEL_DEFINIDO: UserCog,
  PEDIDO_RECEBIDO: PackageCheck,
  SOLICITACAO_UNIDADE_CRIADA: MapPin,
  CANAL_RESTRITO_ATIVADO: Lock,
  CANAL_REATIVACAO_SOLICITADA: LockOpen,
  CANAL_REATIVACAO_RECUSADA: ShieldOff,
  CANAL_REATIVADO: LockOpen,
}

export interface NotificacaoAtorInfo {
  nome: string | null
  avatarUrl: string | null
}

/** Título com o nome de quem gerou a ação, para os tipos com ator social. */
const TITULO_COM_ATOR: Partial<Record<TipoNotificacao, (nome: string) => string>> = {
  SEGUIMENTO_PENDENTE: (nome) => `${nome} quer seguir você`,
  SEGUIMENTO_APROVADO: (nome) => `${nome} aceitou você`,
  SEGUIMENTO_REJEITADO: (nome) => `${nome} não aceitou seu pedido para seguir`,
  NOVO_COMENTARIO: (nome) => `${nome} comentou no seu post`,
  NOVA_REACAO: (nome) => `${nome} curtiu seu post`,
  MENCAO: (nome) => `${nome} mencionou você`,
  REPOST: (nome) => `${nome} compartilhou seu post`,
  MENSAGEM_SOLICITACAO_PENDENTE: (nome) => `${nome} quer conversar com você`,
  MENSAGEM_SOLICITACAO_APROVADA: (nome) => `${nome} aceitou sua solicitação de mensagem`,
  MENSAGEM_SOLICITACAO_REJEITADA: (nome) => `${nome} recusou sua solicitação de mensagem`,
  GRUPO_PEDIDO: (nome) => `${nome} pediu para entrar no grupo`,
  GRUPO_APROVADO: (nome) => `${nome} aprovou sua entrada no grupo`,
  GRUPO_REJEITADO: (nome) => `${nome} recusou sua entrada no grupo`,
  GRUPO_ADMIN: (nome) => `${nome} tornou você admin do grupo`,
  GRUPO_REMOVIDO: (nome) => `${nome} removeu você do grupo`,
  CANAL_PEDIDO: (nome) => `${nome} pediu para entrar no canal`,
  CANAL_APROVADO: (nome) => `${nome} aprovou sua entrada no canal`,
  CANAL_REJEITADO: (nome) => `${nome} recusou sua entrada no canal`,
}

/**
 * Título de exibição da notificação: usa o nome do ator quando disponível
 * (tipos sociais), senão cai no título salvo (tipos sistêmicos ou registros
 * antigos sem ator).
 */
export function formatarTituloNotificacao(item: {
  tipo: TipoNotificacao
  titulo: string
  ator: NotificacaoAtorInfo | null
}): string {
  const nome = item.ator?.nome?.trim()
  if (!nome) return item.titulo

  const formatar = TITULO_COM_ATOR[item.tipo]
  return formatar ? formatar(nome) : item.titulo
}

/**
 * Avatar do ator com badge do tipo (Instagram/Twitter). Sem ator, mostra só o
 * ícone do tipo num círculo — notificações operacionais/sistêmicas.
 */
export function NotificationAvatar({
  ator,
  tipo,
  size = 'md',
}: {
  ator: NotificacaoAtorInfo | null
  tipo: TipoNotificacao
  size?: 'sm' | 'md'
}) {
  const Icone = ICONE_POR_TIPO[tipo]
  const circulo = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10'
  const icone = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  if (!ator) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex ${circulo} shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]`}
      >
        <Icone className={icone} />
      </span>
    )
  }

  return (
    <span className="relative inline-flex shrink-0">
      <Avatar nome={ator.nome} avatarUrl={ator.avatarUrl} size={size === 'sm' ? 'sm' : 'md'} />
      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--color-primary-fg))]"
      >
        <Icone className="h-2.5 w-2.5" />
      </span>
    </span>
  )
}
