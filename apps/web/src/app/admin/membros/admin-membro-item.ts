export interface AdminMembroItem {
  id: string
  nome: string
  discordTag: string | null
  discordId?: string | null
  email?: string | null
  tipo: string
  /** True quando o cadastro é SOCIO (não torcedor). */
  isSocio: boolean
  cidade: string | null
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
  /** Label do status para usos em texto puro; o badge visual vem de `StatusBadge`. */
  statusLabel: string
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
  // ─── Cadastro completo / LGE (onboarding SOCIO) ───────────────────────────
  dataNascimentoLabel?: string | null
  sexo?: string | null
  estadoCivil?: string | null
  nacionalidade?: string | null
  rg?: string | null
  /** CPF formatado para exibição admin (dado RESTRITO). */
  cpf?: string | null
  filiacao?: string | null
  escolaridade?: string | null
  profissao?: string | null
  logradouro?: string | null
  bairro?: string | null
  uf?: string | null
  fotoDocumentoUrl?: string | null
  comprovanteResidenciaUrl?: string | null
  responsavelNome?: string | null
  responsavelDocumento?: string | null
  autorizacaoMenorAceitaLabel?: string | null
  termoResponsabilidadeAceitoLabel?: string | null
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
  /** true = registro espelho na Sede (fila compartilhada Caso B; origem na unidade). */
  espelhado?: boolean
  /** Nome da Subsede/PDE de origem do vínculo (quando espelhado). */
  aprovadoNaUnidadeNome?: string | null
}
