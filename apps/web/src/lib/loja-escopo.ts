/**
 * Escopo da loja no portal — puro, sem DB / cookies.
 *
 * Fonte única = tenant ativo (mesmo princípio da Comunidade §5.19). Super-admin
 * troca de canal, mas o catálogo que aparece é o da torcida que está operando,
 * nunca a união de todos os vínculos (presidente dos Gaviões em portal da
 * Mancha não pode ver nem a loja nem o destaque da rival).
 */

export interface EscopoLojaInput {
  /** Vínculos APROVADO (sócio ou torcedor canônico do convite). */
  vinculoIds: readonly string[]
  /** Portal ativo. `null` = Comunidade Nacional / sem contexto de torcida. */
  ativoId: string | null
  /** self + ancestrais + descendentes do ativo. */
  worktreeIds: readonly string[]
  /**
   * `getVisibleTenantIds(ativo, 'loja')` — worktree + aliados, já com R5.
   * Ignorado quando `ativoId` é null.
   */
  visiveisDoAtivo: readonly string[]
  /** `getAlliedTenantIds(ativo)`. */
  aliadosDoAtivo: readonly string[]
  raizId: string | null
  /** SOCIO APROVADO em algum tenant da worktree ativa. */
  socioNaWorktree: boolean
  isSuperAdmin: boolean
  /** Ponte da Sede para as unidades. Sem efeito quando o ativo já é a raiz. */
  lojaVisivelNasUnidades: boolean
}

export interface EscopoLoja {
  /** Catálogo que a listagem / vitrine / switcher podem mostrar. */
  visiveis: Set<string>
  /** Tenants dos quais o usuário pode comprar. */
  comprar: Set<string>
}

/** Bloco da grade: principal → unidades da worktree → lojas aliadas. */
export type BlocoLoja = 'principal' | 'unidade' | 'aliado'

export interface LojaListagemSortable {
  tenantId: string
  nome: string
  tipo: string
  bloco: BlocoLoja
}

const BLOCO_ORDEM: Record<BlocoLoja, number> = {
  principal: 0,
  unidade: 1,
  aliado: 2,
}

const TIPO_UNIDADE_ORDEM: Record<string, number> = {
  SUBSEDE: 0,
  PONTO_ENCONTRO: 1,
  SEDE: 2,
}

export function blocoLoja(input: {
  tenantId: string
  raizId: string | null
  worktreeIds: ReadonlySet<string>
  aliadosIds: ReadonlySet<string>
}): BlocoLoja {
  if (input.raizId && input.tenantId === input.raizId) return 'principal'
  if (input.worktreeIds.has(input.tenantId)) return 'unidade'
  if (input.aliadosIds.has(input.tenantId)) return 'aliado'
  // Sem portal (CN) ou tenant fora da worktree: não sobe à frente da principal.
  return input.raizId ? 'aliado' : 'unidade'
}

/** Principal → subsede → PDE → demais unidades → aliados; nome em cada bloco. */
export function compararLojasListagem(a: LojaListagemSortable, b: LojaListagemSortable): number {
  const bloco = BLOCO_ORDEM[a.bloco] - BLOCO_ORDEM[b.bloco]
  if (bloco !== 0) return bloco
  if (a.bloco === 'unidade') {
    const tipo = (TIPO_UNIDADE_ORDEM[a.tipo] ?? 9) - (TIPO_UNIDADE_ORDEM[b.tipo] ?? 9)
    if (tipo !== 0) return tipo
  }
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

function setOf(ids: readonly string[]): Set<string> {
  return new Set(ids)
}

/**
 * Recorta vínculos e visibilidade hierárquica pelo portal ativo.
 *
 * Invariante: nenhum tenant fora de `visiveisDoAtivo` (já filtrado de rival /
 * unrelated / R5) entra no resultado quando há portal ativo.
 */
export function escoparLojaAoPortalAtivo(input: EscopoLojaInput): EscopoLoja {
  const vinculos = setOf(input.vinculoIds)
  const worktree = setOf(input.worktreeIds)
  const aliados = setOf(input.aliadosDoAtivo)

  if (!input.ativoId) {
    return { visiveis: setOf(input.vinculoIds), comprar: setOf(input.vinculoIds) }
  }

  const visiveis = setOf(input.visiveisDoAtivo)
  if (!input.socioNaWorktree) {
    for (const id of aliados) visiveis.delete(id)
  }
  if (input.raizId && !input.lojaVisivelNasUnidades && input.ativoId !== input.raizId) {
    visiveis.delete(input.raizId)
  }

  const comprar = new Set<string>()
  for (const id of vinculos) {
    if (visiveis.has(id)) comprar.add(id)
  }
  if (input.raizId && visiveis.has(input.raizId)) {
    for (const id of vinculos) {
      if (worktree.has(id)) {
        comprar.add(input.raizId)
        break
      }
    }
  }

  if (input.isSuperAdmin) {
    return { visiveis, comprar }
  }

  const temVinculoNaFamilia = [...vinculos].some((id) => worktree.has(id) || visiveis.has(id))
  if (!temVinculoNaFamilia) {
    return { visiveis: new Set(), comprar: new Set() }
  }

  return { visiveis, comprar: new Set(visiveis) }
}
