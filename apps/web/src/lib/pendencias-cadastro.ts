/**
 * Pendências de cadastro do sócio — serviço puro (testável, sem banco).
 *
 * Fonte de verdade dos campos: `completude-cadastro-socio.ts` (mesmo checklist
 * do card admin «Completude do cadastro»). Dispensar («não mostrar de novo»)
 * esconde o modal mas mantém a pendência → inadimplência até completar.
 */

import {
  resumirCompletudeCadastroSocio,
  type CompletudeItemId,
  type MembroParaCompletude,
} from '@/lib/completude-cadastro-socio'

/** @deprecated Preferir PENDENCIA_SOCIO_FICHA — mantido para dispensas já gravadas. */
export const PENDENCIA_SOCIO_EXPEDICAO = 'SOCIO_EXPEDICAO_CARTEIRINHA' as const
export const PENDENCIA_SOCIO_FICHA = 'SOCIO_FICHA_INCOMPLETA' as const

export const PENDENCIAS_CADASTRO_CODIGOS = [
  PENDENCIA_SOCIO_FICHA,
  PENDENCIA_SOCIO_EXPEDICAO,
] as const

export type PendenciaCadastroCodigo = (typeof PENDENCIAS_CADASTRO_CODIGOS)[number]

export type CampoPendenciaCadastro = CompletudeItemId

export type PendenciaCadastro = {
  codigo: PendenciaCadastroCodigo
  titulo: string
  descricao: string
  href: string
  camposFaltantes: CampoPendenciaCadastro[]
  /** Espelho do resumo admin (ok/total). */
  progresso?: { ok: number; total: number }
}

export type MembroParaPendenciaCadastro = MembroParaCompletude & {
  tipo: string
  status: string
  temCarteirinha: boolean
  exigirDocumentosCadastro: boolean
  pendenciasCadastroDispensadas?: readonly string[] | null
}

const HREF_ATUALIZAR = '/portal/cadastro/associacao'

const LABELS: Record<CompletudeItemId, string> = {
  numeroAssociado: 'Nº de associado',
  cpf: 'CPF',
  rg: 'RG',
  nascimento: 'Data de nascimento',
  logradouro: 'Logradouro',
  bairro: 'Bairro',
  cep: 'CEP',
  uf: 'UF',
  termo: 'Termo de responsabilidade',
  prova: 'Comprovante de vínculo',
  'resp-nome': 'Nome do responsável',
  'resp-doc': 'Documento do responsável',
  documento: 'Foto do documento',
  residencia: 'Comprovante de residência',
  dataExpedicaoCarteirinha: 'Data de expedição da carteirinha',
  periodicidadePretendida: 'Periodicidade / plano',
}

export const CAMPO_PENDENCIA_LABEL = LABELS

function pendenciaFicha(m: MembroParaPendenciaCadastro): PendenciaCadastro | null {
  if (m.tipo !== 'SOCIO' || m.status !== 'APROVADO') return null
  if (!m.isSocio) return null

  const resumo = resumirCompletudeCadastroSocio(m, {
    exigirDocumentos: m.exigirDocumentosCadastro,
    temCarteirinha: m.temCarteirinha,
  })
  if (resumo.completo) return null

  const precisaCarteirinha = resumo.faltando.some(
    (i) => i.id === 'dataExpedicaoCarteirinha' || i.id === 'periodicidadePretendida',
  )
  const descricao = precisaCarteirinha
    ? 'Sem estes dados não dá para calcular a validade da carteirinha nem garantir sua vigência como sócio. Complete a ficha para emitir/regularizar e permanecer adimplente.'
    : 'A ficha incompleta impede a torcida de confirmar sua vigência corretamente. Ao atualizar, você regulariza o cadastro; se optar por não ver este aviso, o vínculo fica inadimplente até completar.'

  return {
    codigo: PENDENCIA_SOCIO_FICHA,
    titulo: 'Complete o cadastro de sócio',
    descricao,
    href: HREF_ATUALIZAR,
    camposFaltantes: resumo.faltando.map((i) => i.id),
    progresso: { ok: resumo.okCount, total: resumo.total },
  }
}

const RESOLVERS: Array<(m: MembroParaPendenciaCadastro) => PendenciaCadastro | null> = [
  pendenciaFicha,
]

/** Códigos que escondem o modal da ficha (legado + atual). */
function dispensaCobreFicha(dispensadas: Set<string>): boolean {
  return (
    dispensadas.has(PENDENCIA_SOCIO_FICHA) || dispensadas.has(PENDENCIA_SOCIO_EXPEDICAO)
  )
}

export function resolverPendenciasCadastro(
  m: MembroParaPendenciaCadastro,
): PendenciaCadastro[] {
  const out: PendenciaCadastro[] = []
  for (const resolve of RESOLVERS) {
    const p = resolve(m)
    if (p) out.push(p)
  }
  return out
}

export function pendenciasCadastroVisiveis(
  m: MembroParaPendenciaCadastro,
): PendenciaCadastro[] {
  const dispensadas = new Set(m.pendenciasCadastroDispensadas ?? [])
  return resolverPendenciasCadastro(m).filter((p) => {
    if (p.codigo === PENDENCIA_SOCIO_FICHA) return !dispensaCobreFicha(dispensadas)
    return !dispensadas.has(p.codigo)
  })
}

export function inadimplentePorPendenciaCadastro(
  m: MembroParaPendenciaCadastro,
): boolean {
  const ativas = resolverPendenciasCadastro(m)
  if (ativas.length === 0) return false
  const dispensadas = new Set(m.pendenciasCadastroDispensadas ?? [])
  return ativas.some((p) => {
    if (p.codigo === PENDENCIA_SOCIO_FICHA) return dispensaCobreFicha(dispensadas)
    return dispensadas.has(p.codigo)
  })
}

/** @deprecated — use parece sócio via completude; mantido se algum caller antigo. */
export function pareceSocioExistente(m: {
  numeroAssociado: string | null
  anosSocio: number | null
  imagemProva: string | null
}): boolean {
  if (/^\d+$/.test((m.numeroAssociado ?? '').trim())) return true
  if (m.anosSocio != null && m.anosSocio > 0) return true
  if (m.imagemProva?.trim()) return true
  return false
}
