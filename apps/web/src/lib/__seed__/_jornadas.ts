/**
 * Contrato compartilhado do lote **jornadas** — o seed (`jornadas.seed.ts`),
 * a auditoria (`jornadas.audit.ts`) e o reset (`packages/db/scripts/
 * reset-jornadas.js`) precisam concordar sobre marcação e expectativas.
 *
 * O que este lote cobre que os outros não cobrem: os seeds de volume gravam
 * `SaasMembro` direto por `createMany`, então o banco fica com o **resultado**
 * de um vínculo sem nunca ter passado pelo **caminho** dele. Aqui cada pessoa
 * entra pelas Server Actions reais, pelos três fluxos de entrada do produto,
 * e o estado esperado de cada um vira dado (`ESPERADO_POR_FLUXO`) — a
 * auditoria compara o banco contra essa tabela em vez de contra prosa.
 */

/** Domínio dos usuários deste lote. Único critério do reset. */
export const DOMINIO_JORNADA = 'jornada.torcida.app'

/** Prefixo de tudo que o lote cria e que não é `User` (canal, post, grupo). */
export const MARCA_JORNADA = '[JORNADA]'

/** Senha de todos os usuários do lote — igual à dos demais seeds de teste. */
export const SENHA_JORNADA = 'm1k43l3n'

/**
 * Os três fluxos de entrada do onboarding. Não são "tipos de usuário": são
 * caminhos distintos, com telas, validações e estado final diferentes.
 *
 * - `torcedor_global`  — concluiu o onboarding sem escolher torcida. Vive na
 *   Comunidade Nacional do clube; nenhum `SaasMembro`.
 * - `torcedor_torcida` — escolheu a torcida como TORCEDOR. Entra APROVADO na
 *   hora (sem fila), no canal da unidade, mas **não** no da Sede: o canal da
 *   Sede é espaço de sócio.
 * - `socio_vinculo`    — «já sou sócio»: informa nº de associado, carteirinha
 *   e prova de vínculo. Nasce PENDENTE.
 * - `socio_associacao` — «quero me associar»: primeira associação, sem nº.
 *   Nasce PENDENTE e fica aguardando emissão de carteirinha.
 */
export type FluxoJornada =
  | 'torcedor_global'
  | 'torcedor_torcida'
  | 'socio_vinculo'
  | 'socio_associacao'

export type DesfechoJornada = 'aprovado' | 'pendente' | 'reprovado'

export interface EsperadoJornada {
  /** Existe `SaasMembro` canônico no tenant de destino? */
  temMembro: boolean
  tipoMembro: 'SOCIO' | 'TORCEDOR' | null
  statusMembro: 'APROVADO' | 'PENDENTE' | 'REPROVADO' | null
  /** `getActiveTenant` deve abrir a torcida (modo sócio) para esta pessoa? */
  abreTenant: boolean
  /** `podeVerFeedSocios` no tenant de destino. */
  veMuralSocios: boolean
  /** Deve estar ATIVO no canal oficial da unidade do vínculo. */
  noCanalDaUnidade: boolean
  /**
   * Deve estar ATIVO no canal oficial da SEDE raiz. Só sócio aprovado —
   * torcedor entra só na unidade (`vincularMembroCanaisAposAprovacao`).
   */
  noCanalDaSede: boolean
}

/**
 * Estado esperado por (fluxo × desfecho). É a matriz que a auditoria usa;
 * mudar regra de negócio deve começar por mudar esta tabela.
 */
export const ESPERADO_POR_FLUXO: Record<
  FluxoJornada,
  Partial<Record<DesfechoJornada, EsperadoJornada>>
> = {
  torcedor_global: {
    pendente: {
      temMembro: false,
      tipoMembro: null,
      statusMembro: null,
      abreTenant: false,
      veMuralSocios: false,
      noCanalDaUnidade: false,
      noCanalDaSede: false,
    },
  },
  torcedor_torcida: {
    aprovado: {
      temMembro: true,
      tipoMembro: 'TORCEDOR',
      statusMembro: 'APROVADO',
      // TORCEDOR não abre modo sócio — `resolveUserTenantSlugForUser` só
      // responde a SOCIO APROVADO.
      abreTenant: false,
      veMuralSocios: false,
      noCanalDaUnidade: true,
      noCanalDaSede: false,
    },
  },
  socio_vinculo: {
    pendente: {
      temMembro: true,
      tipoMembro: 'SOCIO',
      statusMembro: 'PENDENTE',
      abreTenant: false,
      veMuralSocios: false,
      // Regra explícita do onboarding: "sócio pendente: mesma experiência de
      // torcedor (CN + PDE) até a aprovação". Ele **entra** no canal da
      // unidade do convite — o que não pode é o canal da Sede.
      //
      // ⚠️ `dados-reais.audit.ts` afirma o CONTRÁRIO e um repair expulsa essa
      // gente. Enquanto o item 22 de `ARCHITECTURE.md` §7 não for decidido,
      // esta linha segue o que o produto faz — e trocar a decisão começa
      // aqui. Ver §7 22.
      noCanalDaUnidade: true,
      noCanalDaSede: false,
    },
    aprovado: {
      temMembro: true,
      tipoMembro: 'SOCIO',
      statusMembro: 'APROVADO',
      abreTenant: true,
      veMuralSocios: true,
      noCanalDaUnidade: true,
      noCanalDaSede: true,
    },
    reprovado: {
      temMembro: true,
      tipoMembro: 'SOCIO',
      statusMembro: 'REPROVADO',
      abreTenant: false,
      veMuralSocios: false,
      noCanalDaUnidade: false,
      noCanalDaSede: false,
    },
  },
  socio_associacao: {
    pendente: {
      temMembro: true,
      tipoMembro: 'SOCIO',
      statusMembro: 'PENDENTE',
      abreTenant: false,
      veMuralSocios: false,
      // Mesma regra do `socio_vinculo` pendente.
      noCanalDaUnidade: true,
      noCanalDaSede: false,
    },
    aprovado: {
      temMembro: true,
      tipoMembro: 'SOCIO',
      statusMembro: 'APROVADO',
      abreTenant: true,
      veMuralSocios: true,
      noCanalDaUnidade: true,
      noCanalDaSede: true,
    },
  },
}

/**
 * Destinos do lote. Cada um existe por um eixo que nenhum outro cobre — a
 * lista é curta de propósito: o valor está na diversidade, não no volume.
 */
export interface DestinoJornada {
  tenantSlug: string
  eixo: string
  /** Semeia um torcedor 100% global (sem torcida) para o clube deste destino. */
  comTorcedorGlobal: boolean
}

export const DESTINOS_JORNADA: DestinoJornada[] = [
  {
    tenantSlug: 'pde-gavioes-fiel',
    eixo: 'Sede raiz (Corinthians) com 14 unidades — canal da unidade × canal da Sede',
    comTorcedorGlobal: true,
  },
  {
    tenantSlug: 'subsede-rio-claro',
    eixo: 'unidade Caso B promovida — vínculo nasce na unidade e espelha na Sede',
    comTorcedorGlobal: false,
  },
  {
    tenantSlug: 'camisa-12-corinthians',
    eixo: 'torcida coirmã do mesmo clube — mesma CN, malhas administrativas separadas',
    comTorcedorGlobal: false,
  },
  {
    tenantSlug: 'mancha-alviverde',
    eixo: 'outro clube (Palmeiras) — rivalidade e segregação cross-clube',
    comTorcedorGlobal: true,
  },
  {
    tenantSlug: 'torcida-jovem-flamengo',
    eixo: 'outro clube (Flamengo) — CN distinta, sem interseção com a do Timão',
    comTorcedorGlobal: true,
  },
]

/** Quantas pessoas por fluxo, por destino. Mexer aqui muda o tamanho do lote. */
export const POR_DESTINO = {
  torcedor_torcida: 2,
  socio_vinculo_aprovado: 2,
  socio_vinculo_pendente: 1,
  socio_vinculo_reprovado: 1,
  socio_associacao_aprovado: 2,
  socio_associacao_pendente: 1,
} as const

/** CPF sintético válido (dígitos verificadores corretos) a partir de um índice. */
export function cpfSinteticoValido(indice: number): string {
  const base = String(100000000 + (indice % 800000000)).padStart(9, '0')
  const calc = (digitos: string, fator: number): number => {
    let soma = 0
    for (let i = 0; i < digitos.length; i++) soma += Number(digitos[i]) * (fator - i)
    const mod = (soma * 10) % 11
    return mod === 10 ? 0 : mod
  }
  const d1 = calc(base, 10)
  const d2 = calc(`${base}${d1}`, 11)
  return `${base}${d1}${d2}`
}
