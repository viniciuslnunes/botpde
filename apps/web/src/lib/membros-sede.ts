import { type Prisma } from '@torcida/db'
import { ExpectedError } from '@/lib/expected-error'
import { getAncestorTenantIds, getTorcidaLineageTenantIds } from '@/lib/hierarquia'

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

async function resolverTenantRaizId(tenantOrigemId: string): Promise<string> {
  const ancestrais: string[] = await getAncestorTenantIds(tenantOrigemId)
  return ancestrais.length > 0 ? ancestrais[ancestrais.length - 1]! : tenantOrigemId
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
 * Garante unicidade de numeroAssociado entre sócios APROVADOS ativos em toda
 * a torcida (lineage). Não identifica o dono do conflito.
 */
export async function validarNumeroAssociadoUnicoNaTorcida(
  tx: Prisma.TransactionClient,
  tenantOrigemId: string,
  userId: string,
  numeroAssociado: string,
  excludeMembroId?: string,
): Promise<void> {
  const lineage: string[] = await getTorcidaLineageTenantIds(tenantOrigemId)
  const conflito: { id: string } | null = await tx.saasMembro.findFirst({
    where: {
      tenantId: { in: lineage },
      numeroAssociado,
      status: 'APROVADO',
      desligadoEm: null,
      userId: { not: userId },
      ...(excludeMembroId ? { id: { not: excludeMembroId } } : {}),
    },
    select: { id: true },
  })
  if (conflito) {
    throw new ExpectedError('Número de associado já está em uso nesta torcida.')
  }
}

type EspelhoExistente = {
  id: string
  espelhado: boolean
  membroOrigemId: string | null
  desligadoEm: Date | null
}

/**
 * Cria/atualiza o espelho do sócio na Sede raiz (Caso B). No-op se a origem
 * já é a raiz. Não copia planoAssociacaoId, departamentoId nem sedeId.
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

  const agora = new Date()
  const dadosEspelho = {
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
    status: 'APROVADO' as const,
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
    espelhado: true,
    aprovadoNaUnidadeTenantId: tenantOrigemId,
    membroOrigemId: membro.id,
    desligadoEm: null,
    desligadoMotivo: null,
    desligadoPorId: null,
    aprovadoPorId: aprovadoPorUserId,
    aprovadoPorNome,
    aprovadoEm: agora,
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
