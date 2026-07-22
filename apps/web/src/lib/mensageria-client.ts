/** DTOs das APIs de mensageria como chegam ao cliente (datas em ISO string). */

export interface AutorDto {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export interface MensagemDto {
  id: string
  conversaId: string
  conteudo: string
  midiaUrls: string[]
  respostaAId: string | null
  editadaEm: string | null
  removida: boolean
  criadoEm: string
  autor: AutorDto
}

export type StatusParticipacaoConversa = 'ATIVO' | 'PENDENTE' | 'REJEITADO'

export interface InboxItemDto {
  id: string
  tipo: 'DIRETA' | 'GRUPO' | 'CANAL'
  nome: string | null
  avatarUrl: string | null
  atualizadoEm: string
  meuPapel: 'ADMIN' | 'MEMBRO'
  meuStatus: StatusParticipacaoConversa
  /** Destinatário com solicitação pendente — exibe aprovar/recusar. */
  solicitacaoRecebida: boolean
  /** Remetente aguardando aprovação do destinatário. */
  aguardandoAprovacao: boolean
  silenciada: boolean
  totalMembros: number
  outroMembro: AutorDto | null
  ultimaMensagem: {
    conteudo: string
    autorNome: string | null
    criadoEm: string
    removida: boolean
  } | null
  naoLidas: number
}

export interface ContatoDto {
  id: string
  nome: string | null
  avatarUrl: string | null
  tenantNome: string
  mesmoTenant: boolean
  /** Precisa enviar solicitação com mensagem inicial em vez de DM direta. */
  requerSolicitacao: boolean
}

export interface MembroConversaDto {
  userId: string
  papel: 'ADMIN' | 'MEMBRO'
  user: AutorDto
}

/** Título exibível de uma conversa (DM usa o outro participante). */
export function tituloConversa(item: InboxItemDto): string {
  if (item.tipo === 'GRUPO' || item.tipo === 'CANAL') return item.nome ?? (item.tipo === 'CANAL' ? 'Canal' : 'Grupo')
  return item.outroMembro?.nome ?? 'Conversa'
}
