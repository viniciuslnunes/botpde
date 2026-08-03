import 'server-only'
import { cache } from 'react'
import { db } from '@torcida/db'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import {
  elegivelPendenciaCadastro,
  inadimplentePorPendenciaCadastro,
  pendenciasCadastroVisiveis,
  resolverPendenciasCadastro,
  resolverServicoPendenciasCanal,
  type MembroParaPendenciaCadastro,
  type PendenciaCadastro,
} from '@/lib/pendencias-cadastro'

/**
 * Serviço ativo **neste canal** (tenant do contexto)?
 *
 * - Unidade: usa o flag local, salvo quando a Sede ligou “propagar às unidades”
 *   — aí vale o flag da Sede (a Sede dita o ritmo).
 * - Sede: só o próprio flag.
 */
export async function servicoPendenciasCadastroAtivo(tenantId: string): Promise<boolean> {
  const raizId = await resolverTenantRaizId(tenantId)
  const isRaiz = raizId === tenantId

  if (isRaiz) {
    const sede: { solicitarPendenciasCadastro: boolean } | null = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { solicitarPendenciasCadastro: true },
    })
    return resolverServicoPendenciasCanal({
      solicitarLocal: sede?.solicitarPendenciasCadastro === true,
      isRaiz: true,
      sedeSolicitar: sede?.solicitarPendenciasCadastro === true,
      sedePropagar: false,
    })
  }

  const [unidade, sede]: [
    { solicitarPendenciasCadastro: boolean } | null,
    {
      solicitarPendenciasCadastro: boolean
      propagarPendenciasCadastroUnidades: boolean
    } | null,
  ] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { solicitarPendenciasCadastro: true },
    }),
    db.tenant.findUnique({
      where: { id: raizId },
      select: {
        solicitarPendenciasCadastro: true,
        propagarPendenciasCadastroUnidades: true,
      },
    }),
  ])

  return resolverServicoPendenciasCanal({
    solicitarLocal: unidade?.solicitarPendenciasCadastro === true,
    isRaiz: false,
    sedeSolicitar: sede?.solicitarPendenciasCadastro === true,
    sedePropagar: sede?.propagarPendenciasCadastroUnidades === true,
  })
}

/** Sede está forçando o valor nas unidades da worktree? */
export async function sedePropagaPendenciasCadastro(tenantId: string): Promise<boolean> {
  const raizId = await resolverTenantRaizId(tenantId)
  const sede: { propagarPendenciasCadastroUnidades: boolean } | null = await db.tenant.findUnique({
    where: { id: raizId },
    select: { propagarPendenciasCadastroUnidades: true },
  })
  return sede?.propagarPendenciasCadastroUnidades === true
}

export type PendenciasCadastroSnapshot = {
  membroId: string
  tenantId: string
  ativas: PendenciaCadastro[]
  visiveis: PendenciaCadastro[]
  inadimplentePorCadastro: boolean
}

const MEMBRO_PENDENCIA_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  tipo: true,
  status: true,
  idade: true,
  numeroAssociado: true,
  cpf: true,
  rg: true,
  dataNascimento: true,
  logradouro: true,
  bairro: true,
  cep: true,
  uf: true,
  termoResponsabilidadeAceitoEm: true,
  imagemProva: true,
  responsavelNome: true,
  responsavelDocumento: true,
  autorizacaoMenorAceitaEm: true,
  fotoDocumentoUrl: true,
  comprovanteResidenciaUrl: true,
  dataExpedicaoCarteirinha: true,
  periodicidadePretendida: true,
  pendenciasCadastroDispensadas: true,
} as const

type MembroPendenciaRow = {
  id: string
  tenantId: string
  userId: string
  tipo: string
  status: string
  idade: number | null
  numeroAssociado: string | null
  cpf: string | null
  rg: string | null
  dataNascimento: Date | null
  logradouro: string | null
  bairro: string | null
  cep: string | null
  uf: string | null
  termoResponsabilidadeAceitoEm: Date | null
  imagemProva: string | null
  responsavelNome: string | null
  responsavelDocumento: string | null
  autorizacaoMenorAceitaEm: Date | null
  fotoDocumentoUrl: string | null
  comprovanteResidenciaUrl: string | null
  dataExpedicaoCarteirinha: Date | null
  periodicidadePretendida: string | null
  pendenciasCadastroDispensadas: string[]
}

function paraInput(
  m: MembroPendenciaRow,
  temCarteirinha: boolean,
  exigirDocumentosCadastro: boolean,
  solicitarPendenciasCadastro: boolean,
): MembroParaPendenciaCadastro {
  return {
    isSocio: m.tipo === 'SOCIO',
    tipo: m.tipo,
    status: m.status,
    idade: m.idade,
    numeroAssociado: m.numeroAssociado,
    cpf: m.cpf,
    rg: m.rg,
    dataNascimento: m.dataNascimento,
    logradouro: m.logradouro,
    bairro: m.bairro,
    cep: m.cep,
    uf: m.uf,
    termoResponsabilidadeAceitoEm: m.termoResponsabilidadeAceitoEm,
    imagemProva: m.imagemProva,
    responsavelNome: m.responsavelNome,
    responsavelDocumento: m.responsavelDocumento,
    autorizacaoMenorAceitaEm: m.autorizacaoMenorAceitaEm,
    fotoDocumentoUrl: m.fotoDocumentoUrl,
    comprovanteResidenciaUrl: m.comprovanteResidenciaUrl,
    dataExpedicaoCarteirinha: m.dataExpedicaoCarteirinha,
    periodicidadePretendida: m.periodicidadePretendida,
    temCarteirinha,
    exigirDocumentosCadastro,
    solicitarPendenciasCadastro,
    pendenciasCadastroDispensadas: m.pendenciasCadastroDispensadas,
  }
}

export const carregarPendenciasCadastro = cache(async function carregarPendenciasCadastro(
  tenantId: string,
  userId: string,
): Promise<PendenciasCadastroSnapshot | null> {
  const [membro, tenant, servicoAtivo]: [
    MembroPendenciaRow | null,
    { exigirDocumentosCadastro: boolean } | null,
    boolean,
  ] = await Promise.all([
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: MEMBRO_PENDENCIA_SELECT,
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { exigirDocumentosCadastro: true },
    }),
    servicoPendenciasCadastroAtivo(tenantId),
  ])
  if (!membro || !elegivelPendenciaCadastro(membro)) return null

  if (!servicoAtivo) {
    return {
      membroId: membro.id,
      tenantId: membro.tenantId,
      ativas: [],
      visiveis: [],
      inadimplentePorCadastro: false,
    }
  }

  const carteirinha: { id: string } | null = await db.saasSocio.findFirst({
    where: { tenantId, userId },
    select: { id: true },
  })
  const input = paraInput(
    membro,
    Boolean(carteirinha),
    tenant?.exigirDocumentosCadastro ?? true,
    true,
  )
  return {
    membroId: membro.id,
    tenantId: membro.tenantId,
    ativas: resolverPendenciasCadastro(input),
    visiveis: pendenciasCadastroVisiveis(input),
    inadimplentePorCadastro: inadimplentePorPendenciaCadastro(input),
  }
})

export async function membroInadimplentePorCadastroDispensado(
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const snap = await carregarPendenciasCadastro(tenantId, userId)
  return snap?.inadimplentePorCadastro ?? false
}
