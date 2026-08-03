'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import {
  PeriodicidadePlanoSchema,
  resolverPeriodicidadesOnboarding,
  parseDataCompetencia,
  normalizarCpf,
  validarCpfDigitos,
  validarRg,
} from '@torcida/types'
import { getTenantFromHost } from '@/lib/tenant'
import { recalcularAdimplencia } from '@/lib/cobrancas'
import { tentarAutoEmitirCarteirinhaAposAprovacao } from '@/lib/carteirinha-emissao'
import {
  elegivelPendenciaCadastro,
  PENDENCIA_SOCIO_EXPEDICAO,
  PENDENCIA_SOCIO_FICHA,
  PENDENCIAS_CADASTRO_CODIGOS,
  type PendenciaCadastroCodigo,
} from '@/lib/pendencias-cadastro'
import { carregarPendenciasCadastro } from '@/lib/pendencias-cadastro-server'
import { resumirCompletudeCadastroSocio } from '@/lib/completude-cadastro-socio'
import { notificarUsuario } from '@/lib/notificacoes-routing'
import { UFS_BRASIL } from '@/lib/ufs-brasil'

function strOpt(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

export type CompletarAssociacaoState = {
  ok?: boolean
  message?: string
  errors?: Record<string, string[]>
  emitida?: boolean
}

/**
 * Completa a ficha do sócio (mesmos campos da completude do admin) e, se
 * nº + expedição + periodicidade estiverem ok, auto-emite a carteirinha.
 */
export async function completarDadosAssociacao(
  _prev: CompletarAssociacaoState,
  formData: FormData,
): Promise<CompletarAssociacaoState> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) return { message: 'Faça login para continuar.' }
  if (!tenant) return { message: 'Torcida não encontrada.' }

  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: {
      id: true,
      nome: true,
      tipo: true,
      status: true,
      idade: true,
      telefone: true,
      cidade: true,
      numero: true,
      complemento: true,
      anosSocio: true,
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
    },
  })
  if (!membro || !elegivelPendenciaCadastro(membro)) {
    return { message: 'Só sócios aprovados podem completar estes dados.' }
  }
  if (tenant.solicitarPendenciasCadastro === false) {
    return { message: 'A solicitação de dados pendentes está desligada nesta unidade.' }
  }

  const errors: Record<string, string[]> = {}

  const numeroAssociado = strOpt(formData.get('numeroAssociado')) ?? membro.numeroAssociado ?? undefined
  if (numeroAssociado && !/^\d+$/.test(numeroAssociado)) {
    errors.numeroAssociado = ['Informe só dígitos do número de associado.']
  }

  let cpf = strOpt(formData.get('cpf'))
  if (cpf) {
    const normalizado = normalizarCpf(cpf)
    if (!normalizado || !validarCpfDigitos(normalizado)) {
      errors.cpf = ['CPF inválido.']
    } else {
      cpf = normalizado
    }
  } else {
    cpf = membro.cpf ?? undefined
  }

  let rg = strOpt(formData.get('rg'))
  if (rg) {
    if (!validarRg(rg)) errors.rg = ['RG inválido.']
  } else {
    rg = membro.rg ?? undefined
  }

  const nascRaw = strOpt(formData.get('dataNascimento'))
  let dataNascimento = membro.dataNascimento
  if (nascRaw) {
    const parsed = parseDataCompetencia(nascRaw)
    if (!parsed) errors.dataNascimento = ['Data de nascimento inválida.']
    else dataNascimento = parsed
  }

  const logradouro = strOpt(formData.get('logradouro')) ?? membro.logradouro ?? undefined
  const bairro = strOpt(formData.get('bairro')) ?? membro.bairro ?? undefined
  const cep = strOpt(formData.get('cep')) ?? membro.cep ?? undefined
  const telefone = strOpt(formData.get('telefone')) ?? membro.telefone ?? undefined
  const cidade = strOpt(formData.get('cidade')) ?? membro.cidade ?? undefined
  const numeroEndereco = strOpt(formData.get('numero')) ?? membro.numero ?? undefined
  const complemento = strOpt(formData.get('complemento')) ?? membro.complemento ?? undefined
  const anosRaw = strOpt(formData.get('anosSocio'))
  let anosSocio = membro.anosSocio
  if (anosRaw) {
    const n = parseInt(anosRaw, 10)
    if (!Number.isFinite(n) || n < 0 || n > 120) errors.anosSocio = ['Anos como sócio inválidos.']
    else anosSocio = n
  }
  let uf = strOpt(formData.get('uf')) ?? membro.uf ?? undefined
  if (uf && !UFS_BRASIL.includes(uf.toUpperCase())) {
    errors.uf = ['UF inválida.']
  } else if (uf) {
    uf = uf.toUpperCase()
  }

  const aceitouTermo = formData.get('termoResponsabilidade') === 'on' || formData.get('termoResponsabilidade') === 'true'
  const termoResponsabilidadeAceitoEm =
    aceitouTermo && !membro.termoResponsabilidadeAceitoEm
      ? new Date()
      : membro.termoResponsabilidadeAceitoEm

  const imagemProva = strOpt(formData.get('imagemProva')) ?? membro.imagemProva ?? undefined
  const fotoDocumentoUrl =
    strOpt(formData.get('fotoDocumentoUrl')) ?? membro.fotoDocumentoUrl ?? undefined
  const comprovanteResidenciaUrl =
    strOpt(formData.get('comprovanteResidenciaUrl')) ?? membro.comprovanteResidenciaUrl ?? undefined

  const responsavelNome =
    strOpt(formData.get('responsavelNome')) ?? membro.responsavelNome ?? undefined
  const responsavelDocumento =
    strOpt(formData.get('responsavelDocumento')) ?? membro.responsavelDocumento ?? undefined

  const expRaw = strOpt(formData.get('dataExpedicaoCarteirinha'))
  let dataExpedicaoCarteirinha = membro.dataExpedicaoCarteirinha
  if (expRaw) {
    const exp = parseDataCompetencia(expRaw)
    if (!exp) errors.dataExpedicaoCarteirinha = ['Data de expedição inválida.']
    else if (exp.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      errors.dataExpedicaoCarteirinha = ['A data de expedição não pode ser no futuro.']
    } else dataExpedicaoCarteirinha = exp
  }

  let periodicidadePretendida =
    strOpt(formData.get('periodicidadePretendida')) ?? membro.periodicidadePretendida ?? undefined
  if (periodicidadePretendida) {
    const parsedP = PeriodicidadePlanoSchema.safeParse(periodicidadePretendida)
    if (!parsedP.success) {
      errors.periodicidadePretendida = ['Periodicidade inválida.']
      periodicidadePretendida = undefined
    } else {
      const permitidas = resolverPeriodicidadesOnboarding(tenant.periodicidadesOnboarding)
      if (!permitidas.includes(parsedP.data)) {
        errors.periodicidadePretendida = ['Periodicidade não oferecida por esta torcida.']
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors }

  const idade =
    dataNascimento != null
      ? Math.floor((Date.now() - dataNascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : membro.idade

  const temCarteirinha = Boolean(
    await db.saasSocio.findFirst({
      where: { tenantId: tenant.id, userId: session.user.id },
      select: { id: true },
    }),
  )

  const preview = resumirCompletudeCadastroSocio(
    {
      isSocio: true,
      idade,
      numeroAssociado: numeroAssociado ?? null,
      cpf: cpf ?? null,
      rg: rg ?? null,
      dataNascimento,
      logradouro: logradouro ?? null,
      bairro: bairro ?? null,
      cep: cep ?? null,
      uf: uf ?? null,
      termoResponsabilidadeAceitoEm,
      imagemProva: imagemProva ?? null,
      responsavelNome: responsavelNome ?? null,
      responsavelDocumento: responsavelDocumento ?? null,
      autorizacaoMenorAceitaEm: membro.autorizacaoMenorAceitaEm,
      fotoDocumentoUrl: fotoDocumentoUrl ?? null,
      comprovanteResidenciaUrl: comprovanteResidenciaUrl ?? null,
      dataExpedicaoCarteirinha,
      periodicidadePretendida: periodicidadePretendida ?? null,
    },
    {
      exigirDocumentos: tenant.exigirDocumentosCadastro,
      temCarteirinha,
    },
  )

  // Só persiste quando a ficha estiver completa — o botão do portal só libera nesse ponto.
  if (!preview.completo) {
    return {
      message: `Complete todos os campos obrigatórios antes de salvar (${preview.faltando.length} faltando).`,
      errors: Object.fromEntries(
        preview.faltando.map((f) => [f.id, [`${f.label} ainda é obrigatório.`]]),
      ),
    }
  }

  const dispensadas = membro.pendenciasCadastroDispensadas.filter(
    (c: string) => c !== PENDENCIA_SOCIO_FICHA && c !== PENDENCIA_SOCIO_EXPEDICAO,
  )

  await db.saasMembro.update({
    where: { id: membro.id },
    data: {
      numeroAssociado: numeroAssociado ?? null,
      cpf: cpf ?? null,
      rg: rg ?? null,
      dataNascimento,
      idade: idade ?? null,
      telefone: telefone ?? null,
      cidade: cidade ?? null,
      numero: numeroEndereco ?? null,
      complemento: complemento ?? null,
      anosSocio: anosSocio ?? null,
      logradouro: logradouro ?? null,
      bairro: bairro ?? null,
      cep: cep ?? null,
      uf: uf ?? null,
      termoResponsabilidadeAceitoEm,
      imagemProva: imagemProva ?? null,
      fotoDocumentoUrl: fotoDocumentoUrl ?? null,
      comprovanteResidenciaUrl: comprovanteResidenciaUrl ?? null,
      responsavelNome: responsavelNome ?? null,
      responsavelDocumento: responsavelDocumento ?? null,
      dataExpedicaoCarteirinha,
      periodicidadePretendida: periodicidadePretendida
        ? (periodicidadePretendida as 'MENSAL' | 'TRIMESTRAL' | 'QUADRIMENSAL' | 'SEMESTRAL' | 'ANUAL' | 'UNICA')
        : null,
      pendenciasCadastroDispensadas: dispensadas,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_ASSOCIACAO_ATUALIZADA',
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: {
        origem: 'portal_pendencia',
        completo: preview.completo,
        faltando: preview.faltando.map((f) => f.id),
      },
    },
  })

  let emitida = false
  if (
    preview.completo ||
    (numeroAssociado && dataExpedicaoCarteirinha && periodicidadePretendida)
  ) {
    const emit = await tentarAutoEmitirCarteirinhaAposAprovacao({
      tenantId: tenant.id,
      userId: session.user.id,
      nome: membro.nome,
      tipo: 'SOCIO',
      numeroAssociado: numeroAssociado ?? null,
      dataExpedicaoCarteirinha,
      periodicidadePretendida: periodicidadePretendida ?? null,
      atorId: session.user.id,
    })
    emitida = emit.emitida || emit.motivo === 'ja_existia'
    if (emit.emitida) {
      await notificarUsuario({
        tenantId: tenant.id,
        userId: session.user.id,
        tipo: 'SOCIO_CARTEIRINHA_EMITIDA',
        titulo: 'Carteirinha emitida',
        corpo: 'Sua carteirinha digital foi emitida com base nos dados informados.',
        link: '/portal/carteirinha',
        atorId: session.user.id,
      })
    }
  }

  await recalcularAdimplencia(tenant.id, session.user.id)

  revalidatePath('/portal')
  revalidatePath('/portal/cadastro/associacao')
  revalidatePath('/portal/carteirinha')
  revalidatePath('/admin/socios')

  return {
    ok: true,
    emitida,
    message: emitida
      ? 'Cadastro completo e carteirinha emitida.'
      : 'Cadastro completo.',
  }
}

export async function dispensarPendenciaCadastro(
  codigo: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) return { ok: false, message: 'Faça login para continuar.' }
  if (!tenant) return { ok: false, message: 'Torcida não encontrada.' }

  if (!(PENDENCIAS_CADASTRO_CODIGOS as readonly string[]).includes(codigo)) {
    return { ok: false, message: 'Pendência inválida.' }
  }
  const codigoOk = codigo as PendenciaCadastroCodigo

  const snap = await carregarPendenciasCadastro(tenant.id, session.user.id)
  if (!snap || snap.ativas.length === 0) {
    return { ok: false, message: 'Não há pendência ativa para dispensar.' }
  }

  const membro: { id: string; pendenciasCadastroDispensadas: string[] } | null =
    await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
      select: { id: true, pendenciasCadastroDispensadas: true },
    })
  if (!membro) return { ok: false, message: 'Membro não encontrado.' }

  // Dispensar a ficha atual também cobre o código legado de expedição.
  const aGravar =
    codigoOk === PENDENCIA_SOCIO_FICHA || codigoOk === PENDENCIA_SOCIO_EXPEDICAO
      ? [PENDENCIA_SOCIO_FICHA, PENDENCIA_SOCIO_EXPEDICAO]
      : [codigoOk]

  const next = [...new Set([...membro.pendenciasCadastroDispensadas, ...aGravar])]
  await db.saasMembro.update({
    where: { id: membro.id },
    data: { pendenciasCadastroDispensadas: next, adimplente: false },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_PENDENCIA_CADASTRO_DISPENSADA',
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: { codigo: codigoOk, adimplente: false },
    },
  })

  await recalcularAdimplencia(tenant.id, session.user.id)

  revalidatePath('/portal')
  revalidatePath('/portal/carteirinha')
  return { ok: true }
}
