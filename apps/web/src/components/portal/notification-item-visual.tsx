import type { TipoNotificacao } from '@torcida/db'
import {
  AtSign,
  Handshake,
  Heart,
  Mail,
  Megaphone,
  MessageCircle,
  Repeat2,
  ShieldAlert,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'

/** Ícone por tipo de notificação — estilo redes sociais. */
const ICONE_POR_TIPO: Record<TipoNotificacao, LucideIcon> = {
  SEGUIMENTO_PENDENTE: UserPlus,
  SEGUIMENTO_APROVADO: UserCheck,
  NOVO_COMENTARIO: MessageCircle,
  NOVA_REACAO: Heart,
  COMUNICADO_URGENTE: Megaphone,
  DENUNCIA_NOVA: ShieldAlert,
  NOVA_MENSAGEM: Mail,
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
}

export interface NotificacaoAtorInfo {
  nome: string | null
  avatarUrl: string | null
}

/** Título com o nome de quem gerou a ação, para os tipos com ator social. */
const TITULO_COM_ATOR: Partial<Record<TipoNotificacao, (nome: string) => string>> = {
  SEGUIMENTO_PENDENTE: (nome) => `${nome} quer seguir você`,
  SEGUIMENTO_APROVADO: (nome) => `${nome} aceitou você`,
  NOVO_COMENTARIO: (nome) => `${nome} comentou no seu post`,
  NOVA_REACAO: (nome) => `${nome} reagiu ao seu post`,
  MENCAO: (nome) => `${nome} mencionou você`,
  REPOST: (nome) => `${nome} compartilhou seu post`,
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
        className={`inline-flex ${circulo} shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]`}
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
        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--primary))]"
      >
        <Icone className="h-2.5 w-2.5" />
      </span>
    </span>
  )
}
