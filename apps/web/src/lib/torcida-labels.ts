/** Tipos e rótulos de torcida — seguros para Client Components (sem next/headers). */

import { formatNomeAfiliacao, formatNomeTorcida, nomeExibicaoAfiliacao } from '@torcida/types'

export type TorcidaOpcao = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
  /** FK do clube (`Afiliacao`) — filtro do switcher em cascata. */
  afiliacaoId: string | null
  /** Clube (afiliação), para distinguir homônimas — ex. várias "Camisa 12". */
  clubeNome: string | null
  /** UF do clube (ex. SP), quando disponível. */
  clubeUf: string | null
}

/** Clube (`Afiliacao`) para o select de super-admin. */
export type ClubeOpcao = {
  id: string
  nome: string
  apelido: string | null
  estado: string | null
}

/** Unidade da worktree (Sede Caso A ou tenant Caso B) para o 3º select. */
export type UnidadeOpcao = {
  id: string
  sedeId: string | null
  tenantId: string
  tenantSlug: string
  nome: string
  tipo: string
  cidade: string | null
  depth: number
  origem: 'sede' | 'tenant'
}

const TIPO_UNIDADE_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

export function labelClubeOpcao(c: Pick<ClubeOpcao, 'nome' | 'apelido' | 'estado'>): string {
  const nome = nomeExibicaoAfiliacao(c)
  return c.estado ? `${nome} (${c.estado})` : nome
}

export function labelTipoUnidade(tipo: string): string {
  return TIPO_UNIDADE_LABEL[tipo] ?? tipo
}

export function labelUnidadeSub(u: Pick<UnidadeOpcao, 'tipo' | 'cidade'>): string {
  const tipo = labelTipoUnidade(u.tipo)
  return u.cidade ? `${tipo} · ${u.cidade}` : tipo
}

export type TorcidaTransferencia = TorcidaOpcao & {
  temOwner: boolean
  ownerEmail: string | null
}

/** "CORINTHIANS (SP)" — subtítulo / busca. */
export function labelClubeComUf(
  t: Pick<TorcidaOpcao, 'clubeNome' | 'clubeUf'>,
): string | null {
  if (!t.clubeNome) return null
  const clube = formatNomeAfiliacao(t.clubeNome)
  return t.clubeUf ? `${clube} (${t.clubeUf})` : clube
}

/** Rótulo "TORCIDA — CLUBE (UF)" para listagens e combobox. */
export function labelTorcidaComClube(
  t: Pick<TorcidaOpcao, 'nome' | 'clubeNome' | 'clubeUf'>,
): string {
  const nome = formatNomeTorcida(t.nome)
  const clube = labelClubeComUf(t)
  return clube ? `${nome} — ${clube}` : nome
}
