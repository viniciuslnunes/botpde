export interface AdminMembroItem {
  id: string
  nome: string
  discordTag: string | null
  discordId?: string | null
  email?: string | null
  tipo: string
  cidade: string | null
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
  statusLabel: string
  statusClass: string
  criadoEmLabel: string
  atualizadoEmLabel?: string | null
  avatarUrl: string | null
  inicial: string
  telefone?: string | null
  idade?: number | null
  /** Departamento pretendido no onboarding (sócio); null se não informou. */
  departamentoNome?: string | null
  /** Unidade territorial (Sede/Subsede/PDE). */
  sedeNome?: string | null
  /** Comprovante de vínculo (só sócio; dado RESTRITO — nunca cachear). */
  imagemProva?: string | null
  numeroAssociado?: string | null
  anosSocio?: number | null
  cep?: string | null
  numero?: string | null
  bloco?: string | null
  complemento?: string | null
  adimplente?: boolean
  aprovadoPorNome?: string | null
  aprovadoEmLabel?: string | null
  desligadoEmLabel?: string | null
  desligadoMotivo?: string | null
  /** True quando o usuário já é sócio aprovado em torcida rival (sem identificá-la). */
  alertaRivalSocio?: boolean
  /** Nº de recrutamentos de sócio reprovados em OUTRAS torcidas/clubes (sem identificar qual). */
  reprovacoesOutraTorcida?: number
  /** Nº de solicitações (cadastro + recadastros) registradas no AuditLog. */
  tentativas?: number
  ultimoMotivoReprovacao?: string
}
