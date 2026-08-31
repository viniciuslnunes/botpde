/**
 * Pendências de cadastro dos sócios — serviço puro (testável, sem banco).
 *
 * Cobre **todos os sócios aprovados** da unidade (inclui membros, gestores de
 * departamento, presidente/liderança/vice/admin desde que `tipo = SOCIO`).
 * Torcedores ficam de fora.
 *
 * Fonte de verdade dos campos: `completude-cadastro-socio.ts`. Dispensar
 * («não mostrar de novo») esconde o modal mas mantém a pendência →
 * inadimplência até completar. O tenant pode desligar o serviço em
 * Configurações (`solicitarPendenciasCadastro`). A ficha em si fica
 * permanente em `/portal/carteirinha` (ver/editar a qualquer momento).
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
  /** Quando false (config da unidade), o resolver não abre pendências. */
  solicitarPendenciasCadastro?: boolean
  pendenciasCadastroDispensadas?: readonly string[] | null
}

const HREF_ATUALIZAR = '/portal/carteirinha?secao=cadastro'

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
  dataExpedicaoCarteirinha: 'Data da última expedição da carteirinha',
  periodicidadePretendida: 'Periodicidade / plano',
}

export const CAMPO_PENDENCIA_LABEL = LABELS

/**
 * Serviço ativo neste canal?
 * - Sede: só o flag local.
 * - Unidade: flag local, ou o da Sede se `sedePropagar`.
 */
export function resolverServicoPendenciasCanal(input: {
  solicitarLocal: boolean
  isRaiz: boolean
  sedeSolicitar: boolean
  sedePropagar: boolean
}): boolean {
  if (input.isRaiz) return input.solicitarLocal
  if (input.sedePropagar) return input.sedeSolicitar
  return input.solicitarLocal
}

/** Sócio aprovado — torcedores nunca entram, mesmo com cargo de liderança. */
export function elegivelPendenciaCadastro(m: {
  tipo: string
  status: string
}): boolean {
  return m.tipo === 'SOCIO' && m.status === 'APROVADO'
}

function pendenciaFicha(m: MembroParaPendenciaCadastro): PendenciaCadastro | null {
  if (m.solicitarPendenciasCadastro === false) return null
  if (!elegivelPendenciaCadastro(m)) return null
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
