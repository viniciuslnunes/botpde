import { db, Prisma } from '@torcida/db'
import { ExpectedError } from '@/lib/expected-error'
import {
  getAncestorTenantIds,
  getDescendantTenantIds,
  getTorcidaLineageTenantIds,
} from '@/lib/hierarquia'

/** Campos necessários para criar/atualizar o espelho na Sede raiz. */
export type MembroParaEspelho = {
  id: string
  userId: string
  tipo: 'SOCIO' | 'TORCEDOR'
  nome: string
  idade: number | null
  telefone: string | null
  cidade: string | null
  numeroAssociado: string | null
  anosSocio: number | null
  cep: string | null
  numero: string | null
  bloco: string | null
  complemento: string | null
  imagemProva: string | null
  rg: string | null
  cpf: string | null
  filiacao: string | null
  escolaridade: string | null
  profissao: string | null
  dataNascimento: Date | null
  sexo: string | null
  estadoCivil: string | null
  nacionalidade: string | null
  logradouro: string | null
  bairro: string | null
  uf: string | null
  fotoDocumentoUrl: string | null
  comprovanteResidenciaUrl: string | null
  responsavelNome: string | null
  responsavelDocumento: string | null
  autorizacaoMenorAceitaEm: Date | null
  termoResponsabilidadeAceitoEm: Date | null
  /**
   * Área pretendida na SEDE, declarada no onboarding por quem entrou por uma
   * unidade. Vira o `departamentoId` do espelho (preferência, não membership).
   */
  departamentoSedeId?: string | null
}

export type DadosLgeEspelho = {
  rg: string | null
  cpf: string | null
  filiacao: string | null
  escolaridade: string | null
  profissao: string | null
  dataNascimento: Date | null
  sexo?: string | null
  estadoCivil?: string | null
  nacionalidade?: string | null
  logradouro?: string | null
  bairro?: string | null
  uf?: string | null
  fotoDocumentoUrl?: string | null
  comprovanteResidenciaUrl?: string | null
  responsavelNome?: string | null
  responsavelDocumento?: string | null
  autorizacaoMenorAceitaEm?: Date | null
  termoResponsabilidadeAceitoEm?: Date | null
}

export async function resolverTenantRaizId(tenantOrigemId: string): Promise<string> {
  const ancestrais: string[] = await getAncestorTenantIds(tenantOrigemId)
  return ancestrais.length > 0 ? ancestrais[ancestrais.length - 1]! : tenantOrigemId
}

/** Serializa decisões de admissão (aprovar/reprovar) na torcida — first-wins. */
export async function lockDecisaoAdmissaoTorcida(
  tx: Prisma.TransactionClient,
  tenantOrigemId: string,
): Promise<void> {
  const raizId = await resolverTenantRaizId(tenantOrigemId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admissao-socio-torcida:${raizId}`}))`
}

function dadosCadastraisEspelho(membro: MembroParaEspelho) {
  return {
    tipo: membro.tipo,
    nome: membro.nome,
    idade: membro.idade,
    telefone: membro.telefone,
    cidade: membro.cidade,
    numeroAssociado: membro.numeroAssociado,
    anosSocio: membro.anosSocio,
    cep: membro.cep,
    numero: membro.numero,
    bloco: membro.bloco,
    complemento: membro.complemento,
    imagemProva: membro.imagemProva,
    rg: membro.rg,
    cpf: membro.cpf,
    filiacao: membro.filiacao,
    escolaridade: membro.escolaridade,
    profissao: membro.profissao,
    dataNascimento: membro.dataNascimento,
    sexo: membro.sexo,
    estadoCivil: membro.estadoCivil,
    nacionalidade: membro.nacionalidade,
    logradouro: membro.logradouro,
    bairro: membro.bairro,
    uf: membro.uf,
    fotoDocumentoUrl: membro.fotoDocumentoUrl,
    comprovanteResidenciaUrl: membro.comprovanteResidenciaUrl,
    responsavelNome: membro.responsavelNome,
    responsavelDocumento: membro.responsavelDocumento,
    autorizacaoMenorAceitaEm: membro.autorizacaoMenorAceitaEm,
    termoResponsabilidadeAceitoEm: membro.termoResponsabilidadeAceitoEm,
  }
}

/**
 * `SaasMembro` tem `@@unique([tenantId, cpf])`. Espelho na Sede copia o CPF da
 * origem — se outro userId já usa o mesmo CPF na raiz, o upsert vira P2002 (500).
 */
async function assertCpfLivreNoTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  cpf: string | null | undefined,
): Promise<void> {
  const cpfNorm = cpf?.trim() || null
  if (!cpfNorm) return

  const conflito: { id: string } | null = await tx.saasMembro.findFirst({
    where: {
      tenantId,
      cpf: cpfNorm,
      userId: { not: userId },
    },
    select: { id: true },
  })
  if (conflito) {
    throw new ExpectedError(
      'Este CPF já está cadastrado na Sede por outro associado. Ajuste o cadastro antes de aprovar.',
    )
  }
}

export type PendenciaEspelhoResultado = {
  /** Tenant da sede raiz; null se origem já é raiz ou não houve fan-out. */
  raizTenantId: string | null
  espelhoId: string | null
  /** true = membro direto na sede (não espelho) — pendência não criada. */
  ignoradoJaMembroDireto: boolean
}

/**
 * Caso B: cria/atualiza gêmeo PENDENTE na Sede raiz quando o sócio solicita
 * ingresso numa afiliada. No-op se a origem já é a raiz.
 * Não copia planoAssociacaoId nem sedeId. O `departamentoId` do espelho vem de
 * `membro.departamentoSedeId` (área pretendida NA SEDE), nunca do departamento
 * da origem — que é id de outro tenant. Ver `departamentoSedeParaEspelho`.
 */
export async function criarOuAtualizarPendenciaEspelhoNaSede(
  tx: Prisma.TransactionClient,
  opts: {
    tenantOrigemId: string
    membro: MembroParaEspelho
    atorId: string
  },
): Promise<PendenciaEspelhoResultado> {
  const { tenantOrigemId, membro, atorId } = opts
  const raizId = await resolverTenantRaizId(tenantOrigemId)
  if (raizId === tenantOrigemId) {
    return { raizTenantId: null, espelhoId: null, ignoradoJaMembroDireto: false }
  }

  const existente: EspelhoExistente | null = await tx.saasMembro.findUnique({
    where: {
      tenantId_userId: { tenantId: raizId, userId: membro.userId },
    },
    select: {
      id: true,
      espelhado: true,
      membroOrigemId: true,
      desligadoEm: true,
      status: true,
      departamentoId: true,
    },
  })

  if (existente && !existente.espelhado) {
    await tx.auditLog.create({
      data: {
        tenantId: raizId,
        atorId,
        acao: 'MEMBRO_SINCRONIZACAO_IGNORADA_JA_MEMBRO_DIRETO',
        entidade: 'SaasMembro',
        entidadeId: existente.id,
        detalhes: {
          origemTenantId: tenantOrigemId,
          membroOrigemId: membro.id,
          automatico: true,
          motivo: 'pendencia_espelho',
        },
      },
    })
    return { raizTenantId: raizId, espelhoId: null, ignoradoJaMembroDireto: true }
  }

  if (
    existente &&
    existente.espelhado &&
    existente.membroOrigemId != null &&
    existente.membroOrigemId !== membro.id &&
    existente.desligadoEm == null &&
    existente.status === 'APROVADO'
  ) {
    throw new ExpectedError(
      'Já existe um espelho ativo deste associado na Sede a partir de outra unidade.',
    )
  }

  await assertCpfLivreNoTenant(tx, raizId, membro.userId, membro.cpf)

  const dadosEspelho = {
    ...dadosCadastraisEspelho(membro),
    ...departamentoSedeParaEspelho(membro, existente),
    status: 'PENDENTE' as const,
    espelhado: true,
    aprovadoNaUnidadeTenantId: tenantOrigemId,
    membroOrigemId: membro.id,
    desligadoEm: null,
    desligadoMotivo: null,
    desligadoPorId: null,
    aprovadoPorId: null,
    aprovadoPorNome: null,
    aprovadoEm: null,
    ...REPROVACAO_LIMPA,
  }

  const espelho: { id: string } = await tx.saasMembro.upsert({
    where: {
      tenantId_userId: { tenantId: raizId, userId: membro.userId },
    },
    create: {
      tenantId: raizId,
      userId: membro.userId,
      ...dadosEspelho,
    },
    update: dadosEspelho,
    select: { id: true },
  })

  await tx.auditLog.create({
    data: {
      tenantId: raizId,
      atorId,
      acao: 'MEMBRO_PENDENCIA_ESPELHO_SEDE',
      entidade: 'SaasMembro',
      entidadeId: espelho.id,
      detalhes: {
        origemTenantId: tenantOrigemId,
        membroOrigemId: membro.id,
        automatico: true,
      },
    },
  })

  return { raizTenantId: raizId, espelhoId: espelho.id, ignoradoJaMembroDireto: false }
}

/**
 * Propaga status/decisão da origem para o espelho na Sede (reprovar/reverter).
 * Diferente de desligarEspelhoDaOrigem: mantém o gêmeo na fila compartilhada.
 */
export async function sincronizarStatusEspelhoDaOrigem(
  tx: Prisma.TransactionClient,
  opts: {
    membroOrigemId: string
    status: 'PENDENTE' | 'REPROVADO' | 'APROVADO'
    aprovadoPorId: string | null
    aprovadoPorNome: string | null
    aprovadoEm: Date | null
    desligadoMotivo?: string | null
    /** Só em REPROVADO: espelha a justificativa e as etapas apontadas. */
    reprovacao?: DadosReprovacaoEspelho | null
  },
): Promise<string | null> {
  const espelho: { id: string } | null = await tx.saasMembro.findUnique({
    where: { membroOrigemId: opts.membroOrigemId },
    select: { id: true },
  })
  if (!espelho) return null

  await tx.saasMembro.update({
    where: { id: espelho.id },
    data: {
      status: opts.status,
      aprovadoPorId: opts.aprovadoPorId,
      aprovadoPorNome: opts.aprovadoPorNome,
      aprovadoEm: opts.aprovadoEm,
      ...(opts.status === 'REPROVADO' && opts.reprovacao
        ? opts.reprovacao
        : REPROVACAO_LIMPA),
      ...(opts.status === 'PENDENTE'
        ? {
            desligadoEm: null,
            desligadoMotivo: null,
            desligadoPorId: null,
          }
        : opts.desligadoMotivo != null
          ? { desligadoMotivo: opts.desligadoMotivo }
          : {}),
    },
  })
  return espelho.id
}

export type DadosReprovacaoEspelho = {
  reprovadoEm: Date
  reprovadoPorId: string
  reprovadoPorNome: string
  reprovadoCategoria: string
  reprovadoMotivo: string
  reprovadoPontos: string[]
  reprovadoPermiteReenvio: boolean
}

/**
 * Zera o rastro de reprovação. Sair de REPROVADO (aprovação, reversão ou
 * reenvio do solicitante) precisa apagar o motivo — senão o card continua
 * pintando de vermelho etapas já corrigidas.
 */
export const REPROVACAO_LIMPA: {
  reprovadoEm: null
  reprovadoPorId: null
  reprovadoPorNome: null
  reprovadoCategoria: null
  reprovadoMotivo: null
  reprovadoPontos: string[]
  reprovadoPermiteReenvio: boolean
} = {
  reprovadoEm: null,
  reprovadoPorId: null,
  reprovadoPorNome: null,
  reprovadoCategoria: null,
  reprovadoMotivo: null,
  reprovadoPontos: [],
  reprovadoPermiteReenvio: true,
}

/** Confirma que o tenant da origem é afiliado (descendente) da sede atual. */
export async function assertOrigemDescendenteDaSede(
  sedeTenantId: string,
  origemTenantId: string,
): Promise<void> {
  if (sedeTenantId === origemTenantId) {
    throw new ExpectedError('Registro espelho inválido.')
  }
  const descendentes: string[] = await getDescendantTenantIds(sedeTenantId)
  if (!descendentes.includes(origemTenantId)) {
    throw new ExpectedError('Esta solicitação não pertence a uma afiliada desta Sede.')
  }
}

/**
 * Serializa aprovações que disputam o mesmo nº de associado na torcida.
 */
export async function lockNumeroAssociadoDaTorcida(
  tx: Prisma.TransactionClient,
  tenantOrigemId: string,
): Promise<void> {
  const raizId = await resolverTenantRaizId(tenantOrigemId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`numero-associado-torcida:${raizId}`}))`
}

/**
 * Unicidade de `numeroAssociado` na torcida (lineage: Sede + afiliadas).
 * Vínculo PENDENTE ou APROVADO (não desligado) de outro user ocupa o número —
 * onboarding e aprovação usam a mesma regra para o número nunca ser registrado
 * em duplicata. REPROVADO devolve o número ao pool: o valor continua gravado na
 * linha para laudo/histórico, mas não bloqueia mais outro torcedor.
 *
 * Espelhos (`espelhado`) são ignorados: o canônico é a origem (mesmo userId).
 * Não identifica o dono do conflito (LGPD / UX).
 */
type DbOrTxNumero = {
  saasMembro: {
    findFirst: Prisma.TransactionClient['saasMembro']['findFirst']
  }
}

export async function encontrarConflitoNumeroAssociado(
  client: DbOrTxNumero,
  opts: {
    tenantOrigemId: string
    userId: string
    numeroAssociado: string
    excludeMembroId?: string
  },
): Promise<{ id: string } | null> {
  const numero = opts.numeroAssociado.trim()
  if (!numero) return null

  const lineage: string[] = await getTorcidaLineageTenantIds(opts.tenantOrigemId)
  const conflito: { id: string } | null = await client.saasMembro.findFirst({
    where: {
      tenantId: { in: lineage },
      numeroAssociado: numero,
      espelhado: false,
      desligadoEm: null,
      status: { not: 'REPROVADO' },
      userId: { not: opts.userId },
      ...(opts.excludeMembroId ? { id: { not: opts.excludeMembroId } } : {}),
    },
    select: { id: true },
  })
  return conflito
}

type DbOrTxIdentidade = {
  saasMembro: {
    findFirst: Prisma.TransactionClient['saasMembro']['findFirst']
  }
  $queryRaw: Prisma.TransactionClient['$queryRaw']
}

type ConflitoIdentidadeOpts = {
  tenantOrigemId: string
  userId: string
  excludeMembroId?: string
}

/** CPF único na lineage (espelhos ignorados; mesmo userId ok). */
export async function encontrarConflitoCpf(
  client: DbOrTxIdentidade,
  opts: ConflitoIdentidadeOpts & { cpf: string },
): Promise<{ id: string } | null> {
  const cpf = opts.cpf.trim()
  if (!cpf) return null

  const lineage: string[] = await getTorcidaLineageTenantIds(opts.tenantOrigemId)
  const conflito: { id: string } | null = await client.saasMembro.findFirst({
    where: {
      tenantId: { in: lineage },
      cpf,
      espelhado: false,
      desligadoEm: null,
      userId: { not: opts.userId },
      ...(opts.excludeMembroId ? { id: { not: opts.excludeMembroId } } : {}),
    },
    select: { id: true },
  })
  return conflito
}

/** RG único na lineage (valor já normalizado). */
export async function encontrarConflitoRg(
  client: DbOrTxIdentidade,
  opts: ConflitoIdentidadeOpts & { rg: string },
): Promise<{ id: string } | null> {
  const rg = opts.rg.trim().toUpperCase()
  if (!rg) return null

  const lineage: string[] = await getTorcidaLineageTenantIds(opts.tenantOrigemId)
  const conflito: { id: string } | null = await client.saasMembro.findFirst({
    where: {
      tenantId: { in: lineage },
      rg: { equals: rg, mode: 'insensitive' },
      espelhado: false,
      desligadoEm: null,
      userId: { not: opts.userId },
      ...(opts.excludeMembroId ? { id: { not: opts.excludeMembroId } } : {}),
    },
    select: { id: true },
  })
  return conflito
}

/**
 * Telefone único na lineage — compara só dígitos (máscaras diferentes batem).
 * `telefoneDigits` já normalizado (10–11 dígitos).
 */
export async function encontrarConflitoTelefone(
  client: DbOrTxIdentidade,
  opts: ConflitoIdentidadeOpts & { telefoneDigits: string },
): Promise<{ id: string } | null> {
  const digits = opts.telefoneDigits.trim()
  if (!digits) return null

  const lineage: string[] = await getTorcidaLineageTenantIds(opts.tenantOrigemId)
  if (lineage.length === 0) return null

  const rows: Array<{ id: string }> = await client.$queryRaw`
    SELECT m.id
    FROM saas_membros m
    WHERE m.tenant_id IN (${Prisma.join(lineage)})
      AND m.espelhado = false
      AND m.desligado_em IS NULL
      AND m.user_id <> ${opts.userId}
      ${opts.excludeMembroId ? Prisma.sql`AND m.id <> ${opts.excludeMembroId}` : Prisma.empty}
      AND regexp_replace(coalesce(m.telefone, ''), '[^0-9]', '', 'g') = ${digits}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function validarNumeroAssociadoUnicoNaTorcida(
  tx: Prisma.TransactionClient,
  tenantOrigemId: string,
  userId: string,
  numeroAssociado: string,
  excludeMembroId?: string,
): Promise<void> {
  const conflito = await encontrarConflitoNumeroAssociado(tx, {
    tenantOrigemId,
    userId,
    numeroAssociado,
    excludeMembroId,
  })
  if (conflito) {
    throw new ExpectedError(
      `Número de associado ${numeroAssociado.trim()} já está em uso nesta torcida.`,
    )
  }
}

type EspelhoExistente = {
  id: string
  espelhado: boolean
  membroOrigemId: string | null
  desligadoEm: Date | null
  status: string
  departamentoId: string | null
}

/**
 * Área pretendida na Sede para o espelho. Só semeia quando o espelho ainda não
 * tem área — uma re-sincronização nunca sobrescreve decisão já tomada na Sede.
 * Preferência, não membership: `UserDepartamento` só sai de `aprovarMembro`.
 */
export function departamentoSedeParaEspelho(
  membro: Pick<MembroParaEspelho, 'departamentoSedeId'>,
  existente: Pick<EspelhoExistente, 'departamentoId'> | null,
): { departamentoId: string } | Record<string, never> {
  const preferida = membro.departamentoSedeId ?? null
  if (!preferida || existente?.departamentoId) return {}
  return { departamentoId: preferida }
}

/**
 * Cria/atualiza o espelho do sócio na Sede raiz (Caso B) como APROVADO.
 * No-op se a origem já é a raiz. Não copia planoAssociacaoId nem sedeId. Se já
 * existir pendência-espelho, promove para APROVADO.
 *
 * `departamentoId` do espelho NÃO vem do departamento da origem (é id de outro
 * tenant) — vem de `membro.departamentoSedeId`, a área na Sede declarada no
 * onboarding. É preferência, não membership: nenhum `UserDepartamento` é
 * criado aqui, a diretoria da Sede é que efetiva. Só semeia quando o espelho
 * ainda não tem área, para nunca sobrescrever decisão já tomada na Sede.
 */
export async function sincronizarSocioNaSedeRaiz(
  tx: Prisma.TransactionClient,
  opts: {
    tenantOrigemId: string
    membro: MembroParaEspelho
    aprovadoPorUserId: string
    aprovadoPorNome: string
  },
): Promise<void> {
  const { tenantOrigemId, membro, aprovadoPorUserId, aprovadoPorNome } = opts
  const raizId = await resolverTenantRaizId(tenantOrigemId)
  if (raizId === tenantOrigemId) return

  const existente: EspelhoExistente | null = await tx.saasMembro.findUnique({
    where: {
      tenantId_userId: { tenantId: raizId, userId: membro.userId },
    },
    select: {
      id: true,
      espelhado: true,
      membroOrigemId: true,
      desligadoEm: true,
      status: true,
      departamentoId: true,
    },
  })

  if (existente && !existente.espelhado) {
    await tx.auditLog.create({
      data: {
        tenantId: raizId,
        atorId: aprovadoPorUserId,
        acao: 'MEMBRO_SINCRONIZACAO_IGNORADA_JA_MEMBRO_DIRETO',
        entidade: 'SaasMembro',
        entidadeId: existente.id,
        detalhes: {
          origemTenantId: tenantOrigemId,
          membroOrigemId: membro.id,
          automatico: true,
        },
      },
    })
    return
  }

  if (
    existente &&
    existente.espelhado &&
    existente.membroOrigemId != null &&
    existente.membroOrigemId !== membro.id &&
    existente.desligadoEm == null
  ) {
    throw new ExpectedError(
      'Já existe um espelho ativo deste associado na Sede a partir de outra unidade.',
    )
  }

  await assertCpfLivreNoTenant(tx, raizId, membro.userId, membro.cpf)

  const agora = new Date()
  const dadosEspelho = {
    ...dadosCadastraisEspelho(membro),
    ...departamentoSedeParaEspelho(membro, existente),
    status: 'APROVADO' as const,
    espelhado: true,
    aprovadoNaUnidadeTenantId: tenantOrigemId,
    membroOrigemId: membro.id,
    desligadoEm: null,
    desligadoMotivo: null,
    desligadoPorId: null,
    aprovadoPorId: aprovadoPorUserId,
    aprovadoPorNome,
    aprovadoEm: agora,
    ...REPROVACAO_LIMPA,
  }

  const espelho: { id: string } = await tx.saasMembro.upsert({
    where: {
      tenantId_userId: { tenantId: raizId, userId: membro.userId },
    },
    create: {
      tenantId: raizId,
      userId: membro.userId,
      ...dadosEspelho,
    },
    update: dadosEspelho,
    select: { id: true },
  })

  await tx.auditLog.create({
    data: {
      tenantId: raizId,
      atorId: aprovadoPorUserId,
      acao: 'MEMBRO_SOCIO_SINCRONIZADO_SEDE',
      entidade: 'SaasMembro',
      entidadeId: espelho.id,
      detalhes: {
        origemTenantId: tenantOrigemId,
        numeroAssociado: membro.numeroAssociado,
        automatico: true,
      },
    },
  })
}

/**
 * Marca o espelho (se existir) como desligado quando a origem é
 * reprovada/revertida/desligada.
 */
export async function desligarEspelhoDaOrigem(
  tx: Prisma.TransactionClient,
  membroOrigemId: string,
  motivo: string,
): Promise<void> {
  const espelho: { id: string } | null = await tx.saasMembro.findUnique({
    where: { membroOrigemId },
    select: { id: true },
  })
  if (!espelho) return

  await tx.saasMembro.update({
    where: { id: espelho.id },
    data: {
      desligadoEm: new Date(),
      desligadoMotivo: motivo,
    },
  })
}

/**
 * Propaga campos LGE da origem para o espelho na Sede (se existir).
 */
type DbOrTx = Prisma.TransactionClient | {
  saasMembro: Prisma.TransactionClient['saasMembro']
}

export async function propagarLgeParaEspelho(
  txOrDb: DbOrTx,
  membroOrigemId: string,
  dadosLge: DadosLgeEspelho,
): Promise<void> {
  const espelho: { id: string } | null = await txOrDb.saasMembro.findUnique({
    where: { membroOrigemId },
    select: { id: true },
  })
  if (!espelho) return

  await txOrDb.saasMembro.update({
    where: { id: espelho.id },
    data: {
      rg: dadosLge.rg,
      cpf: dadosLge.cpf,
      filiacao: dadosLge.filiacao,
      escolaridade: dadosLge.escolaridade,
      profissao: dadosLge.profissao,
      dataNascimento: dadosLge.dataNascimento,
      ...(dadosLge.sexo !== undefined ? { sexo: dadosLge.sexo } : {}),
      ...(dadosLge.estadoCivil !== undefined ? { estadoCivil: dadosLge.estadoCivil } : {}),
      ...(dadosLge.nacionalidade !== undefined ? { nacionalidade: dadosLge.nacionalidade } : {}),
      ...(dadosLge.logradouro !== undefined ? { logradouro: dadosLge.logradouro } : {}),
      ...(dadosLge.bairro !== undefined ? { bairro: dadosLge.bairro } : {}),
      ...(dadosLge.uf !== undefined ? { uf: dadosLge.uf } : {}),
      ...(dadosLge.fotoDocumentoUrl !== undefined
        ? { fotoDocumentoUrl: dadosLge.fotoDocumentoUrl }
        : {}),
      ...(dadosLge.comprovanteResidenciaUrl !== undefined
        ? { comprovanteResidenciaUrl: dadosLge.comprovanteResidenciaUrl }
        : {}),
      ...(dadosLge.responsavelNome !== undefined
        ? { responsavelNome: dadosLge.responsavelNome }
        : {}),
      ...(dadosLge.responsavelDocumento !== undefined
        ? { responsavelDocumento: dadosLge.responsavelDocumento }
        : {}),
      ...(dadosLge.autorizacaoMenorAceitaEm !== undefined
        ? { autorizacaoMenorAceitaEm: dadosLge.autorizacaoMenorAceitaEm }
        : {}),
      ...(dadosLge.termoResponsabilidadeAceitoEm !== undefined
        ? { termoResponsabilidadeAceitoEm: dadosLge.termoResponsabilidadeAceitoEm }
        : {}),
    },
  })
}

/**
 * Bloqueio de novas solicitações: o usuário está barrado NESTE tenant?
 *
 * O escopo é HERDADO para baixo, sem cópia por unidade: um bloqueio gravado na
 * Sede vale para todas as subsedes/PDEs descendentes; um bloqueio gravado numa
 * unidade vale só naquele ramo e NÃO sobe para a Sede. Por isso a consulta olha
 * o próprio tenant + seus ANCESTRAIS (nunca os descendentes).
 *
 * Bloqueio é sobre o USUÁRIO, não sobre a linha de `SaasMembro`: vale mesmo que
 * a pessoa nunca tenha se cadastrado, e sobrevive ao registro ser apagado.
 */
export async function estaBloqueadoNoTenant(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const ancestrais: string[] = await getAncestorTenantIds(tenantId)
  const escopo = [tenantId, ...ancestrais]

  const bloqueio: { id: string } | null = await db.membroBloqueio.findFirst({
    where: { userId, tenantId: { in: escopo } },
    select: { id: true },
  })
  return bloqueio !== null
}
