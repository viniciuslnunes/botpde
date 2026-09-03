/**
 * Dono operacional do evento — quem escala, monta e responde por ele.
 *
 * Não confundir com `projetoId`: projeto é prestação de contas (orçamento,
 * meta, realizado) e nem toda operação tem um. Ensaio de quinta e escala de
 * bandeira do domingo têm dono e não têm projeto — antes disso, o hub thin só
 * enxergava evento por `projeto.departamentoId` e o resto ficava órfão.
 *
 * Como área depende de departamento, o formulário manda **um** valor
 * (`departamentoId` ou `departamentoId::areaId`) em vez de dois selects
 * encadeados com estado no cliente. Módulo puro de propósito: é lido pelo
 * form (client) e pela Server Action (server) — nunca marcar `'use client'`
 * aqui (ver CLAUDE.md § fronteira client/server).
 */

/** Área de atuação oferecida como dono no seletor. */
export type DonoAreaOption = {
  id: string
  nome: string
}

/** Departamento + suas frentes ativas, para montar o `optgroup`. */
export type DonoOperacionalOption = {
  id: string
  nome: string
  slug: string
  areas: DonoAreaOption[]
}

export type DonoOperacional = {
  departamentoId: string | null
  areaId: string | null
}

const SEPARADOR = '::'

export const DONO_VAZIO: DonoOperacional = { departamentoId: null, areaId: null }

/** Valor do `<option>`: departamento sozinho, ou departamento + frente. */
export function formatarDonoValor(
  departamentoId: string | null | undefined,
  areaId?: string | null,
): string {
  if (!departamentoId) return ''
  return areaId ? `${departamentoId}${SEPARADOR}${areaId}` : departamentoId
}

/**
 * Separa o valor do formulário. Tolera vazio, espaço e um separador solto —
 * o que vier daqui ainda é validado contra o tenant na Server Action.
 */
export function parseDonoValor(valor: string | null | undefined): DonoOperacional {
  const bruto = typeof valor === 'string' ? valor.trim() : ''
  if (!bruto) return DONO_VAZIO
  const [departamentoId = '', areaId = ''] = bruto.split(SEPARADOR)
  if (!departamentoId) return DONO_VAZIO
  return { departamentoId, areaId: areaId.length > 0 ? areaId : null }
}

/** Rótulo curto do dono para listas e cabeçalhos ("Bateria · Escala de jogo"). */
export function rotuloDono(
  departamentoNome: string | null | undefined,
  areaNome?: string | null,
): string | null {
  if (!departamentoNome) return null
  return areaNome ? `${departamentoNome} · ${areaNome}` : departamentoNome
}
