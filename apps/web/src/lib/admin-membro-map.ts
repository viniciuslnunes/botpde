import { statusBadgeLabel } from '@/components/admin/ui'
import type { AdminMembroItem } from '@/app/admin/membros/admin-membro-item'
import { formatRg } from '@torcida/types'

const TIPO_BADGE: Record<string, string> = {
  SOCIO: 'Sócio',
  TORCEDOR: 'Torcedor',
}

export function formatCpfAdmin(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatRgAdmin(rg: string | null | undefined): string | null {
  return formatRg(rg) ?? (rg ? String(rg) : null)
}

export function formatDataLabelAdmin(d: Date | null | undefined): string | null {
  return d ? new Date(d).toLocaleDateString('pt-BR') : null
}

/** Campos necessários para o modal de detalhes (LGE / onboarding). */
export const membroDetalheSelect = {
  id: true,
  userId: true,
  nome: true,
  tipo: true,
  status: true,
  cidade: true,
  telefone: true,
  idade: true,
  discordTag: true,
  discordId: true,
  numeroAssociado: true,
  anosSocio: true,
  imagemProva: true,
  cep: true,
  numero: true,
  bloco: true,
  complemento: true,
  dataNascimento: true,
  sexo: true,
  estadoCivil: true,
  nacionalidade: true,
  rg: true,
  cpf: true,
  filiacao: true,
  escolaridade: true,
  profissao: true,
  logradouro: true,
  bairro: true,
  uf: true,
  fotoDocumentoUrl: true,
  comprovanteResidenciaUrl: true,
  responsavelNome: true,
  responsavelDocumento: true,
  autorizacaoMenorAceitaEm: true,
  termoResponsabilidadeAceitoEm: true,
  adimplente: true,
  aprovadoPorNome: true,
  aprovadoEm: true,
  desligadoEm: true,
  desligadoMotivo: true,
  criadoEm: true,
  atualizadoEm: true,
  espelhado: true,
  aprovadoNaUnidadeTenantId: true,
  user: { select: { email: true, avatarUrl: true } },
  departamento: { select: { nome: true } },
  sede: { select: { nome: true } },
} as const

export type MembroDetalheRow = {
  id: string
  userId: string
  nome: string
  tipo: string
  status: string
  cidade: string | null
  telefone: string | null
  idade: number | null
  discordTag: string | null
  discordId: string | null
  numeroAssociado: string | null
  anosSocio: number | null
  imagemProva: string | null
  cep: string | null
  numero: string | null
  bloco: string | null
  complemento: string | null
  dataNascimento: Date | null
  sexo: string | null
  estadoCivil: string | null
  nacionalidade: string | null
  rg: string | null
  cpf: string | null
  filiacao: string | null
  escolaridade: string | null
  profissao: string | null
  logradouro: string | null
  bairro: string | null
  uf: string | null
  fotoDocumentoUrl: string | null
  comprovanteResidenciaUrl: string | null
  responsavelNome: string | null
  responsavelDocumento: string | null
  autorizacaoMenorAceitaEm: Date | null
  termoResponsabilidadeAceitoEm: Date | null
  adimplente: boolean
  aprovadoPorNome: string | null
  aprovadoEm: Date | null
  desligadoEm: Date | null
  desligadoMotivo: string | null
  criadoEm: Date
  atualizadoEm: Date | null
  espelhado: boolean
  aprovadoNaUnidadeTenantId: string | null
  user: { email: string | null; avatarUrl: string | null }
  departamento: { nome: string } | null
  sede: { nome: string } | null
}

export function mapToAdminMembroItem(
  membro: MembroDetalheRow,
  opts?: {
    aprovadoNaUnidadeNome?: string | null
    alertaRivalSocio?: boolean
    reprovacoesOutraTorcida?: number
    tentativas?: number
    ultimoMotivoReprovacao?: string
  },
): AdminMembroItem {
  const isSocio = membro.tipo === 'SOCIO'
  return {
    id: membro.id,
    nome: membro.nome,
    discordTag: membro.discordTag,
    discordId: membro.discordId,
    email: membro.user.email,
    tipo: TIPO_BADGE[membro.tipo] ?? membro.tipo,
    isSocio,
    cidade: membro.cidade,
    status: membro.status as 'PENDENTE' | 'APROVADO' | 'REPROVADO',
    statusLabel: statusBadgeLabel('membro', membro.status),
    criadoEmLabel: new Date(membro.criadoEm).toLocaleDateString('pt-BR'),
    atualizadoEmLabel: formatDataLabelAdmin(membro.atualizadoEm),
    avatarUrl: membro.user.avatarUrl,
    inicial: membro.nome.charAt(0).toUpperCase(),
    telefone: membro.telefone,
    idade: membro.idade,
    departamentoNome: membro.departamento?.nome ?? null,
    sedeNome: membro.sede?.nome ?? null,
    imagemProva: isSocio ? membro.imagemProva : null,
    numeroAssociado: isSocio ? membro.numeroAssociado : null,
    anosSocio: isSocio ? membro.anosSocio : null,
    cep: isSocio ? membro.cep : null,
    numero: isSocio ? membro.numero : null,
    bloco: isSocio ? membro.bloco : null,
    complemento: isSocio ? membro.complemento : null,
    dataNascimentoLabel: isSocio ? formatDataLabelAdmin(membro.dataNascimento) : null,
    sexo: isSocio ? membro.sexo : null,
    estadoCivil: isSocio ? membro.estadoCivil : null,
    nacionalidade: isSocio ? membro.nacionalidade : null,
    rg: isSocio ? formatRgAdmin(membro.rg) : null,
    cpf: isSocio ? formatCpfAdmin(membro.cpf) : null,
    filiacao: isSocio ? membro.filiacao : null,
    escolaridade: isSocio ? membro.escolaridade : null,
    profissao: isSocio ? membro.profissao : null,
    logradouro: isSocio ? membro.logradouro : null,
    bairro: isSocio ? membro.bairro : null,
    uf: isSocio ? membro.uf : null,
    fotoDocumentoUrl: isSocio ? membro.fotoDocumentoUrl : null,
    comprovanteResidenciaUrl: isSocio ? membro.comprovanteResidenciaUrl : null,
    responsavelNome: isSocio ? membro.responsavelNome : null,
    responsavelDocumento: isSocio ? membro.responsavelDocumento : null,
    autorizacaoMenorAceitaLabel: isSocio
      ? formatDataLabelAdmin(membro.autorizacaoMenorAceitaEm)
      : null,
    termoResponsabilidadeAceitoLabel: isSocio
      ? formatDataLabelAdmin(membro.termoResponsabilidadeAceitoEm)
      : null,
    adimplente: membro.adimplente,
    aprovadoPorNome: membro.aprovadoPorNome,
    aprovadoEmLabel: formatDataLabelAdmin(membro.aprovadoEm),
    desligadoEmLabel: formatDataLabelAdmin(membro.desligadoEm),
    desligadoMotivo: membro.desligadoMotivo,
    alertaRivalSocio: opts?.alertaRivalSocio,
    reprovacoesOutraTorcida: opts?.reprovacoesOutraTorcida,
    tentativas: opts?.tentativas,
    ultimoMotivoReprovacao: opts?.ultimoMotivoReprovacao,
    espelhado: membro.espelhado,
    aprovadoNaUnidadeNome: opts?.aprovadoNaUnidadeNome ?? null,
  }
}
