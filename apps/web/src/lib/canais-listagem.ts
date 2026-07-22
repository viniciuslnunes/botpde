import {
  distanciaKm,
  normalizarTexto,
  RAIO_RECOMENDACAO_KM,
  type LocalizacaoOnboarding,
} from '@/lib/onboarding-unidade'
import type { CanalItem } from '@/lib/canais-shared'

export type SecaoCanalListagem = 'sua' | 'perto' | 'demais'

export const SECAO_CANAL_LABEL: Record<SecaoCanalListagem, string> = {
  sua: 'Sua unidade',
  perto: 'Perto de você',
  demais: 'Demais canais',
}

/** Classifica um canal para as seções da listagem. */
export function classificarSecaoCanal(
  canal: CanalItem,
  tenantAtualId: string,
  localizacao: LocalizacaoOnboarding | null,
  raioKm: number = RAIO_RECOMENDACAO_KM,
): SecaoCanalListagem {
  if (canal.tenantId === tenantAtualId) return 'sua'
  if (localizacao) {
    const d = distanciaKm(localizacao, canal)
    if (d != null && d <= raioKm) return 'perto'
  }
  return 'demais'
}

/** UFs distintas presentes nos canais (maiúsculas), ordenadas. */
export function listarUfsCanais(canais: CanalItem[]): string[] {
  const set = new Set<string>()
  for (const c of canais) {
    const uf = c.estado?.trim().toUpperCase()
    if (uf) set.add(uf)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Cidades distintas (opcionalmente filtradas por UF), ordenadas. */
export function listarCidadesCanais(canais: CanalItem[], uf: string | null): string[] {
  const ufNorm = uf?.trim().toUpperCase() ?? null
  const set = new Set<string>()
  for (const c of canais) {
    if (!c.cidade?.trim()) continue
    if (ufNorm && c.estado?.trim().toUpperCase() !== ufNorm) continue
    set.add(c.cidade.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function canalCombinaUfCidade(
  canal: CanalItem,
  uf: string | null,
  cidade: string | null,
): boolean {
  if (uf) {
    if (!canal.estado || canal.estado.trim().toUpperCase() !== uf.trim().toUpperCase()) {
      return false
    }
  }
  if (cidade) {
    if (!canal.cidade) return false
    const a = normalizarTexto(cidade)
    const b = normalizarTexto(canal.cidade)
    if (!(b.includes(a) || a.includes(b))) return false
  }
  return true
}

/**
 * Agrupa canais já filtrados/ordenados em seções, preservando a ordem
 * relativa dentro de cada bucket.
 */
export function agruparCanaisPorSecao(
  canais: CanalItem[],
  tenantAtualId: string,
  localizacao: LocalizacaoOnboarding | null,
): Array<{ secao: SecaoCanalListagem; canais: CanalItem[] }> {
  const buckets: Record<SecaoCanalListagem, CanalItem[]> = {
    sua: [],
    perto: [],
    demais: [],
  }
  for (const canal of canais) {
    buckets[classificarSecaoCanal(canal, tenantAtualId, localizacao)].push(canal)
  }
  const ordem: SecaoCanalListagem[] = localizacao
    ? ['sua', 'perto', 'demais']
    : ['sua', 'demais']
  return ordem
    .filter((secao) => buckets[secao].length > 0)
    .map((secao) => ({ secao, canais: buckets[secao] }))
}
