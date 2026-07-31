export interface MembroReprovacaoDetalhe {
  motivo: string
  categoriaId: string | null
  categoriaLabel: string | null
  /** Ids de `PONTOS_REPROVACAO` apontados como incorretos. */
  pontos: string[]
  emLabel: string | null
  porNome: string | null
  /** false = reprovação definitiva; o solicitante não pode reenviar. */
  permiteReenvio: boolean
}

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
  /**
   * Departamento pretendido no onboarding (sócio); null se não informou.
   * Sempre a área NESTE tenant — na linha de origem em Subsede/PDE é a área na
   * unidade; no espelho da Sede, a área na Sede.
   */
  departamentoNome?: string | null
  /**
   * Só na origem de um vínculo nascido em unidade com portal próprio: a área
   * pretendida na Sede. Deixa a diretoria da unidade ver o quadro completo.
   */
  departamentoSedeNome?: string | null
  /**
   * Sócio já APROVADO cuja área pretendida **neste tenant** ainda não entrou em
   * vigor — acontece quando o outro nível da hierarquia venceu o first-wins da
   * fila. Habilita a ação de efetivar a área aqui. `undefined` = a tela não
   * calculou (não mostra a ação).
   */
  areaPendenteEfetivacao?: boolean
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
  /**
   * Rastro da reprovação atual (null quando o cadastro não está reprovado).
   * `pontos` são ids de `PONTOS_REPROVACAO` — o card usa para pintar de
   * vermelho a etapa recusada.
   */
  reprovacao?: MembroReprovacaoDetalhe | null
  /** true = registro espelho na Sede (fila compartilhada Caso B; origem na unidade). */
  espelhado?: boolean
  /** Nome da Subsede/PDE de origem do vínculo (quando espelhado). */
  aprovadoNaUnidadeNome?: string | null
}
