import 'server-only'

import { cache } from 'react'
import { db, type Prisma } from '@torcida/db'
import { PERMISSIONS, SYSTEM_ROLES, formatNomeTorcida } from '@torcida/types'
import {
  avaliarVinculoUnidade,
  avaliarTravaVinculoUnidade,
  decidirFlagsVinculoUnidade,
  jaVinculadoNestaUnidade,
  mensagemTravaVinculoUnidade,
  temVinculoUnidadeLocal,
  isUnidadeLocalVinculo,
  ACOES_AUDIT_VINCULO_UNIDADE,
  MOTIVO_DESVINCULO_UNIDADE,
  MENSAGEM_VINCULO_UNIDADE,
} from '@torcida/types/associe-se'
import { ExpectedError } from '@/lib/expected-error'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import {
  estaBloqueadoNoTenant,
  REPROVACAO_LIMPA,
  resolverTenantRaizId,
} from '@/lib/membros-sede'
import { getTenantsRestritos } from '@/lib/isolamento'
import { notificarAdminsPorPermissao } from '@/lib/notificacoes-routing'

export type UnidadeCanalFlag = {
  conversaId: string
  sedeId: string
  sedeTenantId: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
}

type VinculoSocioLite = {
  tenantId: string
  sedeId: string | null
  espelhado: boolean
}

export type FlagsVinculoUnidade = {
  podeVincularUnidade: boolean
  podeTrocarUnidade: boolean
  podeDesvincularUnidade: boolean
  vinculoUnidadeLiberaEm: string | null
}

const FLAG_VAZIA: FlagsVinculoUnidade = {
  podeVincularUnidade: false,
  podeTrocarUnidade: false,
  podeDesvincularUnidade: false,
  vinculoUnidadeLiberaEm: null,
}

const socioOrigemSelect = {
  id: true,
  userId: true,
  tipo: true,
  nome: true,
  status: true,
  desligadoEm: true,
  espelhado: true,
  tenantId: true,
  sedeId: true,
  idade: true,
  telefone: true,
  cidade: true,
  numeroAssociado: true,
  anosSocio: true,
  dataExpedicaoCarteirinha: true,
  periodicidadePretendida: true,
  cep: true,
  numero: true,
  bloco: true,
  complemento: true,
  imagemProva: true,
  rg: true,
  cpf: true,
  filiacao: true,
  escolaridade: true,
  profissao: true,
  dataNascimento: true,
  sexo: true,
  estadoCivil: true,
  nacionalidade: true,
  logradouro: true,
  bairro: true,
  uf: true,
  fotoDocumentoUrl: true,
  comprovanteResidenciaUrl: true,
  responsavelNome: true,
  responsavelDocumento: true,
  autorizacaoMenorAceitaEm: true,
  termoResponsabilidadeAceitoEm: true,
  departamentoId: true,
  aprovadoPorId: true,
  aprovadoPorNome: true,
} as const

type SocioOrigem = Prisma.SaasMembroGetPayload<{ select: typeof socioOrigemSelect }>

function mensagemDoMotivo(motivo: string): string {
  const mapa = MENSAGEM_VINCULO_UNIDADE as Record<string, string>
  return mapa[motivo] ?? 'Não foi possível vincular-se a esta unidade.'
}

async function ultimoSelfServiceVinculoUnidade(
  userId: string,
  lineage: string[],
): Promise<Date | null> {
  const ultimo: { criadoEm: Date } | null = await db.auditLog.findFirst({
    where: {
      atorId: userId,
      tenantId: { in: lineage },
      acao: { in: [...ACOES_AUDIT_VINCULO_UNIDADE] },
      detalhes: { path: ['origem'], equals: 'canal' },
    },
    orderBy: { criadoEm: 'desc' },
    select: { criadoEm: true },
  })
  return ultimo?.criadoEm ?? null
}

function assertTravaVinculo(ultimoEm: Date | null): void {
  const trava = avaliarTravaVinculoUnidade(ultimoEm)
  if (!trava.ok) {
    throw new ExpectedError(mensagemTravaVinculoUnidade(trava.liberaEm))
  }
}

/**
 * Flags da listagem/detalhe de canais: vincular, trocar ou desvincular.
 */
export const flagPodeVincularUnidade = cache(async function flagPodeVincularUnidade(opts: {
  userId: string
  viewerTenantId: string
  unidades: UnidadeCanalFlag[]
}): Promise<Map<string, FlagsVinculoUnidade>> {
  const flags = new Map<string, FlagsVinculoUnidade>()
  for (const u of opts.unidades) flags.set(u.conversaId, { ...FLAG_VAZIA })
  if (opts.unidades.length === 0) return flags

  const [lineage, raizTenantId, restritos] = await Promise.all([
    getTorcidaLineageTenantIds(opts.viewerTenantId),
    resolverTenantRaizId(opts.viewerTenantId),
    getTenantsRestritos(),
  ])

  const [vinculos, ultimoEm, hqSedeId]: [VinculoSocioLite[], Date | null, string | null] =
    await Promise.all([
      db.saasMembro.findMany({
        where: {
          userId: opts.userId,
          tipo: 'SOCIO',
          status: 'APROVADO',
          desligadoEm: null,
          tenantId: { in: lineage },
        },
        select: { tenantId: true, sedeId: true, espelhado: true },
      }),
      ultimoSelfServiceVinculoUnidade(opts.userId, lineage),
      sedeRaizId(raizTenantId),
    ])
  const isSocioAprovadoWorktree = vinculos.length > 0
  if (!isSocioAprovadoWorktree) return flags

  const trava = avaliarTravaVinculoUnidade(ultimoEm)
  const liberaEm = !trava.ok ? trava.liberaEm.toISOString() : null
  const temUnidadeLocalAtual = temVinculoUnidadeLocal({
    vinculos,
    raizTenantId,
    hqSedeId,
  })

  for (const u of opts.unidades) {
    const neste = jaVinculadoNestaUnidade({
      sedeId: u.sedeId,
      sedeTenantId: u.sedeTenantId,
      raizTenantId,
      vinculos,
    })
    const base = avaliarVinculoUnidade({
      isSocioAprovadoWorktree,
      mesmaWorktree: lineage.includes(u.sedeTenantId),
      canalRestrito: restritos.has(u.sedeTenantId),
      bloqueado: false,
      tipoUnidade: u.tipo,
      jaVinculadoNestaUnidade: false,
    })
    flags.set(
      u.conversaId,
      decidirFlagsVinculoUnidade({
        tipoUnidade: u.tipo,
        jaNestaUnidade: neste,
        podeVincularBase: base.ok,
        travaOk: trava.ok,
        temUnidadeLocalAtual,
        liberaEm,
      }),
    )
  }
  return flags
})

export type ResultadoVinculoUnidade = {
  sedeId: string
  tenantUnidadeId: string
  nomeUnidade: string
}

async function sairCanalOficialDaSede(sedeId: string, userId: string): Promise<void> {
  const sede: { canalConversaId: string | null } | null = await db.sede.findFirst({
    where: { id: sedeId },
    select: { canalConversaId: true },
  })
  if (!sede?.canalConversaId) return
  await db.membroConversa.updateMany({
    where: { conversaId: sede.canalConversaId, userId, saiuEm: null },
    data: { saiuEm: new Date() },
  })
}

async function revogarCargoMembro(tenantId: string, userId: string): Promise<void> {
  const memberRole: { id: string } | null = await db.role.findFirst({
    where: { tenantId, nome: SYSTEM_ROLES.MEMBER, isSystem: true },
    select: { id: true },
  })
  if (!memberRole) return
  await db.userRole.deleteMany({
    where: { userId, tenantId, roleId: memberRole.id },
  })
}

async function sedeRaizId(raizTenantId: string): Promise<string | null> {
  const hq: { id: string } | null = await db.sede.findFirst({
    where: { tenantId: raizTenantId, tipo: 'SEDE', ativa: true },
    select: { id: true },
  })
  return hq?.id ?? null
}

async function encerrarVinculoCasoB(opts: {
  membroId: string
  userId: string
  tenantId: string
  sedeId: string | null
}): Promise<void> {
  await db.saasMembro.update({
    where: { id: opts.membroId },
    data: {
      desligadoEm: new Date(),
      desligadoMotivo: MOTIVO_DESVINCULO_UNIDADE,
      desligadoPorId: opts.userId,
    },
  })
  await revogarCargoMembro(opts.tenantId, opts.userId)
  if (opts.sedeId) await sairCanalOficialDaSede(opts.sedeId, opts.userId)
}

/**
 * Uma unidade local por vez: encerra as outras (Caso A `sedeId` e origens Caso B)
 * antes de vincular/trocar. Não mexe no vínculo direto da Sede.
 */
async function encerrarOutrasUnidadesLocais(opts: {
  userId: string
  raizTenantId: string
  keepSedeId: string
  keepTenantId: string
}): Promise<boolean> {
  let encerrou = false
  const hqId = await sedeRaizId(opts.raizTenantId)
  const worktree: string[] = await getTorcidaLineageTenantIds(opts.raizTenantId)

  const membroRaiz: { id: string; sedeId: string | null } | null = await db.saasMembro.findFirst({
    where: {
      userId: opts.userId,
      tenantId: opts.raizTenantId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      espelhado: false,
    },
    select: { id: true, sedeId: true },
  })
  if (membroRaiz?.sedeId && membroRaiz.sedeId !== opts.keepSedeId && membroRaiz.sedeId !== hqId) {
    const sedeAtual: { tipo: string } | null = await db.sede.findFirst({
      where: { id: membroRaiz.sedeId },
      select: { tipo: true },
    })
    if (sedeAtual && sedeAtual.tipo !== 'SEDE') {
      await sairCanalOficialDaSede(membroRaiz.sedeId, opts.userId)
      await db.saasMembro.update({
        where: { id: membroRaiz.id },
        data: { sedeId: hqId },
      })
      encerrou = true
    }
  }

  const outros: Array<{ id: string; tenantId: string; sedeId: string | null }> =
    await db.saasMembro.findMany({
      where: {
        userId: opts.userId,
        tipo: 'SOCIO',
        status: 'APROVADO',
        desligadoEm: null,
        espelhado: false,
        tenantId: { in: worktree.filter((id) => id !== opts.raizTenantId && id !== opts.keepTenantId) },
      },
      select: { id: true, tenantId: true, sedeId: true },
    })
  for (const outro of outros) {
    await encerrarVinculoCasoB({
      membroId: outro.id,
      userId: opts.userId,
      tenantId: outro.tenantId,
      sedeId: outro.sedeId,
    })
    encerrou = true
  }
  return encerrou
}

/**
 * Sócio aprovado da worktree reconhece a unidade do canal oficial (SUBSEDE/PDE).
 * Caso A: atualiza `sedeId` no vínculo da Sede. Caso B: cria origem APROVADA
 * no tenant da unidade — sem converter o vínculo da Sede em espelho.
 * Se já havia outra unidade local, troca (encerra a anterior).
 */
export async function vincularSocioAUnidadeDoCanal(opts: {
  conversaId: string
  userId: string
  viewerTenantId: string
}): Promise<ResultadoVinculoUnidade> {
  const sede: {
    id: string
    nome: string
    tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
    tenantId: string | null
    ativa: boolean
  } | null = await db.sede.findFirst({
    where: { canalConversaId: opts.conversaId, tenantId: { not: null } },
    select: { id: true, nome: true, tipo: true, tenantId: true, ativa: true },
  })
  if (!sede?.tenantId || !sede.ativa) {
    throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.nao_unidade)
  }

  const [lineage, raizTenantId, restrito, bloqueado] = await Promise.all([
    getTorcidaLineageTenantIds(opts.viewerTenantId),
    resolverTenantRaizId(opts.viewerTenantId),
    getTenantsRestritos().then((set) => set.has(sede.tenantId!)),
    estaBloqueadoNoTenant(opts.userId, sede.tenantId),
  ])

  const vinculos: VinculoSocioLite[] = await db.saasMembro.findMany({
    where: {
      userId: opts.userId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      tenantId: { in: lineage },
    },
    select: { tenantId: true, sedeId: true, espelhado: true },
  })

  const jaNesta = jaVinculadoNestaUnidade({
    sedeId: sede.id,
    sedeTenantId: sede.tenantId,
    raizTenantId,
    vinculos,
  })
  const avaliacao = avaliarVinculoUnidade({
    isSocioAprovadoWorktree: vinculos.length > 0,
    mesmaWorktree: lineage.includes(sede.tenantId),
    canalRestrito: restrito,
    bloqueado,
    tipoUnidade: sede.tipo,
    jaVinculadoNestaUnidade: false,
  })
  if (!avaliacao.ok) {
    throw new ExpectedError(mensagemDoMotivo(avaliacao.motivo))
  }
  if (jaNesta) {
    throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.ja_vinculado)
  }

  const ultimoEm = await ultimoSelfServiceVinculoUnidade(opts.userId, lineage)
  assertTravaVinculo(ultimoEm)

  const origem: SocioOrigem | null = await db.saasMembro.findFirst({
    where: {
      userId: opts.userId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      espelhado: false,
      tenantId: { in: lineage },
    },
    orderBy: { criadoEm: 'asc' },
    select: socioOrigemSelect,
  })
  if (!origem) {
    throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.nao_socio)
  }

  const casoA = sede.tenantId === raizTenantId
  const eraTroca = await encerrarOutrasUnidadesLocais({
    userId: opts.userId,
    raizTenantId,
    keepSedeId: sede.id,
    keepTenantId: sede.tenantId,
  })

  if (casoA) {
    await aplicarVinculoCasoA({
      userId: opts.userId,
      raizTenantId,
      sedeId: sede.id,
      sedeNome: sede.nome,
      acao: eraTroca ? 'MEMBRO_UNIDADE_ALTERADA' : 'MEMBRO_UNIDADE_VINCULADA',
    })
  } else {
    await aplicarVinculoCasoB({
      userId: opts.userId,
      origem,
      sedeId: sede.id,
      sedeTenantId: sede.tenantId,
      sedeNome: sede.nome,
      raizTenantId,
      acao: eraTroca ? 'MEMBRO_UNIDADE_ALTERADA' : 'MEMBRO_UNIDADE_VINCULADA',
    })
  }

  const tenantUnidade: { nome: string } | null = await db.tenant.findFirst({
    where: { id: sede.tenantId },
    select: { nome: true },
  })
  const nomeUnidade = formatNomeTorcida(sede.nome || tenantUnidade?.nome || 'Unidade')

  try {
    await notificarAdminsPorPermissao(
      [PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW],
      {
        tenantId: sede.tenantId,
        tipo: 'MEMBRO_APROVADO',
        titulo: 'Sócio vinculado à unidade',
        corpo: `${origem.nome} reconheceu ${nomeUnidade} como a unidade em que convive.`,
        link: '/admin/socios',
        atorId: opts.userId,
        excetoUserId: opts.userId,
      },
    )
  } catch (err) {
    console.warn('[vincularSocioAUnidadeDoCanal] notificação:', err)
  }

  return { sedeId: sede.id, tenantUnidadeId: sede.tenantId, nomeUnidade }
}

async function aplicarVinculoCasoA(opts: {
  userId: string
  raizTenantId: string
  sedeId: string
  sedeNome: string
  acao: 'MEMBRO_UNIDADE_VINCULADA' | 'MEMBRO_UNIDADE_ALTERADA'
}): Promise<void> {
  const membro: { id: string; sedeId: string | null; sede: { nome: string } | null } | null =
    await db.saasMembro.findFirst({
      where: {
        userId: opts.userId,
        tenantId: opts.raizTenantId,
        tipo: 'SOCIO',
        status: 'APROVADO',
        desligadoEm: null,
        espelhado: false,
      },
      select: { id: true, sedeId: true, sede: { select: { nome: true } } },
    })
  if (!membro) {
    throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.nao_socio)
  }
  if (membro.sedeId === opts.sedeId) return

  await db.saasMembro.update({
    where: { id: membro.id },
    data: { sedeId: opts.sedeId },
  })

  await db.auditLog.create({
    data: {
      tenantId: opts.raizTenantId,
      atorId: opts.userId,
      acao: opts.acao,
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: {
        caso: 'A',
        sedeIdAntes: membro.sedeId,
        sedeIdDepois: opts.sedeId,
        origem: 'canal',
        alteracoes: [
          {
            campo: 'Unidade',
            de: membro.sede?.nome ?? null,
            para: opts.sedeNome,
          },
        ],
      },
    },
  })
}

async function aplicarVinculoCasoB(opts: {
  userId: string
  origem: SocioOrigem
  sedeId: string
  sedeTenantId: string
  sedeNome: string
  raizTenantId: string
  acao: 'MEMBRO_UNIDADE_VINCULADA' | 'MEMBRO_UNIDADE_ALTERADA'
}): Promise<void> {
  const existente: {
    id: string
    status: string
    desligadoEm: Date | null
    desligadoMotivo: string | null
    espelhado: boolean
  } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: opts.sedeTenantId, userId: opts.userId } },
    select: {
      id: true,
      status: true,
      desligadoEm: true,
      desligadoMotivo: true,
      espelhado: true,
    },
  })

  if (existente) {
    const desligouSozinho = existente.desligadoMotivo === MOTIVO_DESVINCULO_UNIDADE
    if (existente.desligadoEm && !desligouSozinho) {
      throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.desligado)
    }
    if (!existente.desligadoEm && existente.status === 'PENDENTE') {
      throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.pendente)
    }
    if (!existente.desligadoEm && existente.status === 'REPROVADO') {
      throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.reprovado)
    }
    if (existente.status === 'APROVADO' && !existente.espelhado && !existente.desligadoEm) return
  }

  if (opts.origem.cpf) {
    const cpfConflito: { id: string } | null = await db.saasMembro.findFirst({
      where: {
        tenantId: opts.sedeTenantId,
        cpf: opts.origem.cpf,
        userId: { not: opts.userId },
      },
      select: { id: true },
    })
    if (cpfConflito) {
      throw new ExpectedError(
        'Este CPF já está cadastrado nesta unidade por outro associado.',
      )
    }
  }

  const agora = new Date()
  const dados = {
    tipo: 'SOCIO' as const,
    nome: opts.origem.nome,
    idade: opts.origem.idade,
    telefone: opts.origem.telefone,
    cidade: opts.origem.cidade,
    numeroAssociado: opts.origem.numeroAssociado,
    anosSocio: opts.origem.anosSocio,
    dataExpedicaoCarteirinha: opts.origem.dataExpedicaoCarteirinha,
    periodicidadePretendida: opts.origem.periodicidadePretendida,
    cep: opts.origem.cep,
    numero: opts.origem.numero,
    bloco: opts.origem.bloco,
    complemento: opts.origem.complemento,
    imagemProva: opts.origem.imagemProva,
    rg: opts.origem.rg,
    cpf: opts.origem.cpf,
    filiacao: opts.origem.filiacao,
    escolaridade: opts.origem.escolaridade,
    profissao: opts.origem.profissao,
    dataNascimento: opts.origem.dataNascimento,
    sexo: opts.origem.sexo,
    estadoCivil: opts.origem.estadoCivil,
    nacionalidade: opts.origem.nacionalidade,
    logradouro: opts.origem.logradouro,
    bairro: opts.origem.bairro,
    uf: opts.origem.uf,
    fotoDocumentoUrl: opts.origem.fotoDocumentoUrl,
    comprovanteResidenciaUrl: opts.origem.comprovanteResidenciaUrl,
    responsavelNome: opts.origem.responsavelNome,
    responsavelDocumento: opts.origem.responsavelDocumento,
    autorizacaoMenorAceitaEm: opts.origem.autorizacaoMenorAceitaEm,
    termoResponsabilidadeAceitoEm: opts.origem.termoResponsabilidadeAceitoEm,
    sedeId: opts.sedeId,
    departamentoId: null as string | null,
    departamentoSedeId:
      opts.origem.tenantId === opts.raizTenantId ? opts.origem.departamentoId : null,
    status: 'APROVADO' as const,
    espelhado: false,
    desligadoEm: null,
    desligadoMotivo: null,
    desligadoPorId: null,
    aprovadoPorId: opts.origem.aprovadoPorId ?? opts.userId,
    aprovadoPorNome: opts.origem.aprovadoPorNome ?? opts.origem.nome,
    aprovadoEm: agora,
    ...REPROVACAO_LIMPA,
  }

  const criado: { id: string } = await db.saasMembro.upsert({
    where: { tenantId_userId: { tenantId: opts.sedeTenantId, userId: opts.userId } },
    create: {
      tenantId: opts.sedeTenantId,
      userId: opts.userId,
      ...dados,
    },
    update: dados,
    select: { id: true },
  })

  const memberRole: { id: string } | null = await db.role.findFirst({
    where: { tenantId: opts.sedeTenantId, nome: SYSTEM_ROLES.MEMBER, isSystem: true },
    select: { id: true },
  })
  if (memberRole) {
    await db.userRole.upsert({
      where: {
        userId_tenantId_roleId: {
          userId: opts.userId,
          tenantId: opts.sedeTenantId,
          roleId: memberRole.id,
        },
      },
      create: {
        userId: opts.userId,
        tenantId: opts.sedeTenantId,
        roleId: memberRole.id,
      },
      update: {},
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: opts.sedeTenantId,
      atorId: opts.userId,
      acao: opts.acao,
      entidade: 'SaasMembro',
      entidadeId: criado.id,
      detalhes: {
        caso: 'B',
        origemTenantId: opts.origem.tenantId,
        origemMembroId: opts.origem.id,
        sedeId: opts.sedeId,
        origem: 'canal',
      },
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: opts.raizTenantId,
      atorId: opts.userId,
      acao: opts.acao,
      entidade: 'SaasMembro',
      entidadeId: opts.origem.id,
      detalhes: {
        caso: 'B',
        destinoTenantId: opts.sedeTenantId,
        destinoMembroId: criado.id,
        sedeNome: opts.sedeNome,
        origem: 'canal',
      },
    },
  })
}

/**
 * Desfaz o vínculo local (erro de escolha). Continua sócio da torcida.
 * Caso A: `sedeId` volta à Sede. Caso B: desliga só a origem da unidade.
 */
export async function desvincularSocioDaUnidadeDoCanal(opts: {
  conversaId: string
  userId: string
  viewerTenantId: string
}): Promise<{ nomeUnidade: string }> {
  const sede: {
    id: string
    nome: string
    tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
    tenantId: string | null
    ativa: boolean
  } | null = await db.sede.findFirst({
    where: { canalConversaId: opts.conversaId, tenantId: { not: null } },
    select: { id: true, nome: true, tipo: true, tenantId: true, ativa: true },
  })
  if (!sede?.tenantId || !isUnidadeLocalVinculo(sede.tipo)) {
    throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.nao_unidade)
  }

  const [lineage, raizTenantId] = await Promise.all([
    getTorcidaLineageTenantIds(opts.viewerTenantId),
    resolverTenantRaizId(opts.viewerTenantId),
  ])

  const vinculos: VinculoSocioLite[] = await db.saasMembro.findMany({
    where: {
      userId: opts.userId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      tenantId: { in: lineage },
    },
    select: { tenantId: true, sedeId: true, espelhado: true },
  })
  if (vinculos.length === 0) {
    throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.nao_socio)
  }
  if (
    !jaVinculadoNestaUnidade({
      sedeId: sede.id,
      sedeTenantId: sede.tenantId,
      raizTenantId,
      vinculos,
    })
  ) {
    throw new ExpectedError('Você não está vinculado a esta unidade.')
  }

  const ultimoEm = await ultimoSelfServiceVinculoUnidade(opts.userId, lineage)
  assertTravaVinculo(ultimoEm)

  const casoA = sede.tenantId === raizTenantId
  if (casoA) {
    const hqId = await sedeRaizId(raizTenantId)
    const membro: { id: string } | null = await db.saasMembro.findFirst({
      where: {
        userId: opts.userId,
        tenantId: raizTenantId,
        tipo: 'SOCIO',
        status: 'APROVADO',
        desligadoEm: null,
        espelhado: false,
      },
      select: { id: true },
    })
    if (!membro) throw new ExpectedError(MENSAGEM_VINCULO_UNIDADE.nao_socio)
    await sairCanalOficialDaSede(sede.id, opts.userId)
    await db.saasMembro.update({
      where: { id: membro.id },
      data: { sedeId: hqId },
    })
    await db.auditLog.create({
      data: {
        tenantId: raizTenantId,
        atorId: opts.userId,
        acao: 'MEMBRO_UNIDADE_DESVINCULADA',
        entidade: 'SaasMembro',
        entidadeId: membro.id,
        detalhes: {
          caso: 'A',
          sedeIdAntes: sede.id,
          sedeIdDepois: hqId,
          origem: 'canal',
        },
      },
    })
  } else {
    const membroUnidade: { id: string; sedeId: string | null } | null =
      await db.saasMembro.findFirst({
        where: {
          userId: opts.userId,
          tenantId: sede.tenantId,
          tipo: 'SOCIO',
          status: 'APROVADO',
          desligadoEm: null,
          espelhado: false,
        },
        select: { id: true, sedeId: true },
      })
    if (!membroUnidade) throw new ExpectedError('Você não está vinculado a esta unidade.')
    await encerrarVinculoCasoB({
      membroId: membroUnidade.id,
      userId: opts.userId,
      tenantId: sede.tenantId,
      sedeId: membroUnidade.sedeId ?? sede.id,
    })
    await db.auditLog.create({
      data: {
        tenantId: sede.tenantId,
        atorId: opts.userId,
        acao: 'MEMBRO_UNIDADE_DESVINCULADA',
        entidade: 'SaasMembro',
        entidadeId: membroUnidade.id,
        detalhes: { caso: 'B', sedeId: sede.id, origem: 'canal' },
      },
    })
    await db.auditLog.create({
      data: {
        tenantId: raizTenantId,
        atorId: opts.userId,
        acao: 'MEMBRO_UNIDADE_DESVINCULADA',
        entidade: 'SaasMembro',
        entidadeId: membroUnidade.id,
        detalhes: {
          caso: 'B',
          destinoTenantId: sede.tenantId,
          origem: 'canal',
        },
      },
    })
  }

  const nomeUnidade = formatNomeTorcida(sede.nome)
  try {
    await notificarAdminsPorPermissao(
      [PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW],
      {
        tenantId: sede.tenantId,
        tipo: 'MEMBRO_APROVADO',
        titulo: 'Sócio desvinculou-se da unidade',
        corpo: `Um sócio deixou de reconhecer ${nomeUnidade} como unidade local. Permanece sócio da torcida.`,
        link: '/admin/socios',
        atorId: opts.userId,
        excetoUserId: opts.userId,
      },
    )
  } catch (err) {
    console.warn('[desvincularSocioDaUnidadeDoCanal] notificação:', err)
  }

  return { nomeUnidade }
}
