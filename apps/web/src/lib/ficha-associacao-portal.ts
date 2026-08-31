/**
 * Ficha de sócio no portal — mesma carga da antiga rota
 * `/portal/cadastro/associacao`, agora embutida na carteirinha.
 * Sem banco no caller: sócio aprovado sempre pode ver/editar; o serviço de
 * pendências só controla o modal insistente, não o acesso à ficha.
 */
import 'server-only'
import { cache } from 'react'
import { db } from '@torcida/db'
import { formatNomeTorcida, resolverPeriodicidadesOnboarding } from '@torcida/types'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { elegivelPendenciaCadastro } from '@/lib/pendencias-cadastro'
import {
  preenchidoCompletude,
  resumirCompletudeCadastroSocio,
  type CompletudeResumo,
} from '@/lib/completude-cadastro-socio'
import type {
  OperacaoView,
  ValoresAssociacaoForm,
} from '@/app/portal/cadastro/associacao/associacao-atualizar-form'

const MEMBRO_CAMPOS = {
  tipo: true,
  status: true,
  telefone: true,
  cidade: true,
  numero: true,
  complemento: true,
  anosSocio: true,
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
  fotoDocumentoUrl: true,
  comprovanteResidenciaUrl: true,
  responsavelNome: true,
  responsavelDocumento: true,
  dataExpedicaoCarteirinha: true,
  periodicidadePretendida: true,
  adimplente: true,
  aprovadoEm: true,
  sede: { select: { nome: true } },
  departamento: { select: { nome: true } },
} as const

type MembroCampos = {
  tipo: string
  status: string
  telefone: string | null
  cidade: string | null
  numero: string | null
  complemento: string | null
  anosSocio: number | null
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
  fotoDocumentoUrl: string | null
  comprovanteResidenciaUrl: string | null
  responsavelNome: string | null
  responsavelDocumento: string | null
  dataExpedicaoCarteirinha: Date | null
  periodicidadePretendida: string | null
  adimplente: boolean
  aprovadoEm: Date | null
  sede: { nome: string } | null
  departamento: { nome: string } | null
}

type SocioCarteirinha = {
  id: string
  nome: string
  numeroSocio: number
  validade: Date
  criadoEm: Date
}

export type FichaAssociacaoPortal = {
  tenantId: string
  valores: ValoresAssociacaoForm
  exigirDocumentos: boolean
  temCarteirinha: boolean
  periodicidades: string[]
  prefillOrigemNome: string | null
  operacao: OperacaoView
  resumo: CompletudeResumo
}

function scoreCompletude(m: MembroCampos): number {
  const campos = [
    m.numeroAssociado,
    m.cpf,
    m.rg,
    m.dataNascimento,
    m.logradouro,
    m.bairro,
    m.cep,
    m.uf,
    m.termoResponsabilidadeAceitoEm,
    m.imagemProva,
    m.fotoDocumentoUrl,
    m.comprovanteResidenciaUrl,
    m.dataExpedicaoCarteirinha,
    m.periodicidadePretendida,
  ]
  return campos.filter((c) => preenchidoCompletude(c)).length
}

function coalesceStr(
  preferido: string | null | undefined,
  fallback: string | null | undefined,
): string {
  if (preferido?.trim()) return preferido.trim()
  return fallback?.trim() ?? ''
}

function paraValores(host: MembroCampos, doacao: MembroCampos | null): ValoresAssociacaoForm {
  const d = doacao
  return {
    numeroAssociado: coalesceStr(host.numeroAssociado, d?.numeroAssociado),
    cpf: coalesceStr(host.cpf, d?.cpf),
    rg: coalesceStr(host.rg, d?.rg),
    dataNascimento: host.dataNascimento
      ? host.dataNascimento.toISOString().slice(0, 10)
      : d?.dataNascimento
        ? d.dataNascimento.toISOString().slice(0, 10)
        : '',
    telefone: coalesceStr(host.telefone, d?.telefone),
    cidade: coalesceStr(host.cidade, d?.cidade),
    logradouro: coalesceStr(host.logradouro, d?.logradouro),
    numero: coalesceStr(host.numero, d?.numero),
    complemento: coalesceStr(host.complemento, d?.complemento),
    bairro: coalesceStr(host.bairro, d?.bairro),
    cep: coalesceStr(host.cep, d?.cep),
    uf: coalesceStr(host.uf, d?.uf),
    imagemProva: coalesceStr(host.imagemProva, d?.imagemProva),
    fotoDocumentoUrl: coalesceStr(host.fotoDocumentoUrl, d?.fotoDocumentoUrl),
    comprovanteResidenciaUrl: coalesceStr(
      host.comprovanteResidenciaUrl,
      d?.comprovanteResidenciaUrl,
    ),
    responsavelNome: coalesceStr(host.responsavelNome, d?.responsavelNome),
    responsavelDocumento: coalesceStr(host.responsavelDocumento, d?.responsavelDocumento),
    dataExpedicaoIso: host.dataExpedicaoCarteirinha
      ? host.dataExpedicaoCarteirinha.toISOString().slice(0, 10)
      : d?.dataExpedicaoCarteirinha
        ? d.dataExpedicaoCarteirinha.toISOString().slice(0, 10)
        : '',
    periodicidadeAtual: coalesceStr(
      host.periodicidadePretendida,
      d?.periodicidadePretendida,
    ),
    termoAceito: Boolean(
      host.termoResponsabilidadeAceitoEm ?? d?.termoResponsabilidadeAceitoEm,
    ),
    anosSocio:
      host.anosSocio != null
        ? String(host.anosSocio)
        : d?.anosSocio != null
          ? String(d.anosSocio)
          : '',
  }
}

function paraOperacao(membro: MembroCampos, socio: SocioCarteirinha | null): OperacaoView {
  return {
    unidadeNome: membro.sede?.nome ? formatNomeTorcida(membro.sede.nome) : null,
    departamentoNome: membro.departamento?.nome ?? null,
    aprovadoEmLabel: membro.aprovadoEm
      ? membro.aprovadoEm.toLocaleDateString('pt-BR')
      : null,
    adimplente: membro.adimplente,
    carteirinhaValidadeLabel: socio ? socio.validade.toLocaleDateString('pt-BR') : null,
    carteirinhaNumeroLabel: socio
      ? String(socio.numeroSocio).padStart(5, '0')
      : null,
    carteirinhaEmitidaEmLabel: socio ? socio.criadoEm.toLocaleDateString('pt-BR') : null,
    carteirinhaNome: socio?.nome ?? null,
    statusLabel: 'Aprovado',
  }
}

export const carregarFichaAssociacaoPortal = cache(async function carregarFichaAssociacaoPortal(
  tenantId: string,
  userId: string,
  opts: {
    exigirDocumentosCadastro: boolean
    periodicidadesOnboarding: readonly string[] | null | undefined
  },
): Promise<FichaAssociacaoPortal | null> {
  const membro: MembroCampos | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: MEMBRO_CAMPOS,
  })
  if (!membro || !elegivelPendenciaCadastro(membro)) return null

  const lineage = await getTorcidaLineageTenantIds(tenantId)
  const irmaos: (MembroCampos & { tenant: { id: string; nome: string } })[] =
    lineage.length > 1
      ? await db.saasMembro.findMany({
          where: {
            userId,
            tipo: 'SOCIO',
            status: 'APROVADO',
            tenantId: { in: lineage.filter((id) => id !== tenantId) },
          },
          select: {
            ...MEMBRO_CAMPOS,
            tenant: { select: { id: true, nome: true } },
          },
        })
      : []

  let doacao: MembroCampos | null = null
  let prefillOrigemNome: string | null = null
  if (irmaos.length > 0) {
    const ranked = [...irmaos].sort((a, b) => scoreCompletude(b) - scoreCompletude(a))
    const best = ranked[0]!
    if (scoreCompletude(best) > scoreCompletude(membro)) {
      doacao = best
      prefillOrigemNome = formatNomeTorcida(best.tenant.nome)
    }
  }

  const socio: SocioCarteirinha | null = await db.saasSocio.findFirst({
    where: { tenantId, userId },
    select: { id: true, nome: true, numeroSocio: true, validade: true, criadoEm: true },
  })

  const valores = paraValores(membro, doacao)
  const resumo = resumirCompletudeCadastroSocio(
    {
      isSocio: true,
      idade: membro.idade,
      numeroAssociado: valores.numeroAssociado || null,
      cpf: valores.cpf || null,
      rg: valores.rg || null,
      dataNascimento: valores.dataNascimento || null,
      logradouro: valores.logradouro || null,
      bairro: valores.bairro || null,
      cep: valores.cep || null,
      uf: valores.uf || null,
      termoResponsabilidadeAceitoEm: valores.termoAceito ? new Date() : null,
      imagemProva: valores.imagemProva || null,
      responsavelNome: valores.responsavelNome || null,
      responsavelDocumento: valores.responsavelDocumento || null,
      fotoDocumentoUrl: valores.fotoDocumentoUrl || null,
      comprovanteResidenciaUrl: valores.comprovanteResidenciaUrl || null,
      dataExpedicaoCarteirinha: valores.dataExpedicaoIso || null,
      periodicidadePretendida: valores.periodicidadeAtual || null,
    },
    { exigirDocumentos: opts.exigirDocumentosCadastro, temCarteirinha: Boolean(socio) },
  )

  return {
    tenantId,
    valores,
    exigirDocumentos: opts.exigirDocumentosCadastro,
    temCarteirinha: Boolean(socio),
    periodicidades: resolverPeriodicidadesOnboarding(opts.periodicidadesOnboarding),
    prefillOrigemNome,
    operacao: paraOperacao(membro, socio),
    resumo,
  }
})
