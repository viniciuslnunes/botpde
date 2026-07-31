import type { SedeOnboarding } from '@/lib/onboarding'

/** Raio máximo (km) para promover uma unidade territorial às recomendações. */
export const RAIO_RECOMENDACAO_KM = 120

export type SedeOnboardingComDistancia = SedeOnboarding & {
  /** Distância em km até a região do usuário; null se faltar coordenada. */
  distanciaKm: number | null
}

export type SedesAgrupadasOnboarding = {
  /** Sede principal (1ª) + unidade mais próxima (2ª), quando houver. */
  recomendadas: SedeOnboardingComDistancia[]
  /** Demais unidades territoriais, ordenadas por proximidade. */
  outras: SedeOnboardingComDistancia[]
}

export type LocalizacaoOnboarding = {
  lat: number
  lng: number
}

/**
 * A unidade escolhida no onboarding tem portal próprio (Caso B: Subsede/PDE
 * promovida a tenant)? Só nesse caso o sócio ganha DUAS linhas de vínculo — a
 * origem na unidade e o espelho na Sede — e faz sentido declarar uma área em
 * cada nível: `Departamento` é por tenant, então unidade do mesmo tenant (ou a
 * própria Sede) compartilha um único conjunto de departamentos.
 */
export function exigeDepartamentoDaSede(
  unidadeTenantId: string | null | undefined,
  torcidaTenantId: string,
): boolean {
  const unidade = unidadeTenantId?.trim()
  if (!unidade) return false
  return unidade !== torcidaTenantId.trim()
}

export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

function pesoTipoSede(tipo: SedeOnboarding['tipo']): number {
  if (tipo === 'PONTO_ENCONTRO') return 0
  if (tipo === 'SUBSEDE') return 1
  return 2
}

export function sedeCombinaRegiao(
  sede: SedeOnboarding,
  uf?: string,
  cidade?: string,
): boolean {
  const ufNorm = uf?.trim().toUpperCase()
  const cidadeNorm = cidade?.trim()
  if (!ufNorm && !cidadeNorm) return false

  if (ufNorm && sede.estado && sede.estado.toUpperCase() !== ufNorm) return false

  if (cidadeNorm && sede.cidade) {
    const a = normalizarTexto(cidadeNorm)
    const b = normalizarTexto(sede.cidade)
    return b.includes(a) || a.includes(b)
  }

  return Boolean(ufNorm && sede.estado?.toUpperCase() === ufNorm)
}

export function compararSedesOnboarding(a: SedeOnboarding, b: SedeOnboarding): number {
  const diffTipo = pesoTipoSede(a.tipo) - pesoTipoSede(b.tipo)
  if (diffTipo !== 0) return diffTipo
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

export function distanciaKm(
  origem: LocalizacaoOnboarding,
  destino: { lat: number | null; lng: number | null },
): number | null {
  if (destino.lat == null || destino.lng == null) return null
  const raioTerraKm = 6371
  const dLat = ((destino.lat - origem.lat) * Math.PI) / 180
  const dLng = ((destino.lng - origem.lng) * Math.PI) / 180
  const lat1 = (origem.lat * Math.PI) / 180
  const lat2 = (destino.lat * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * raioTerraKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Formata distância para UI (ex.: "8,4 km", "47 km"). */
export function formatarDistanciaKm(km: number): string {
  if (km < 10) {
    return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} km`
  }
  return `${Math.round(km).toLocaleString('pt-BR')} km`
}

function comDistancia(
  sede: SedeOnboarding,
  localizacao?: LocalizacaoOnboarding,
): SedeOnboardingComDistancia {
  return {
    ...sede,
    distanciaKm: localizacao ? distanciaKm(localizacao, sede) : null,
  }
}

function compararPorProximidade(
  localizacao: LocalizacaoOnboarding | undefined,
): (a: SedeOnboarding, b: SedeOnboarding) => number {
  return (a, b) => {
    if (localizacao) {
      const da = distanciaKm(localizacao, a)
      const db = distanciaKm(localizacao, b)
      if (da != null && db != null && da !== db) return da - db
      if (da != null && db == null) return -1
      if (da == null && db != null) return 1
    }
    return compararSedesOnboarding(a, b)
  }
}

/**
 * Agrupa unidades para o passo territorial:
 * 1. Recomendadas: sede principal (sempre 1ª) + unidade mais próxima (2ª)
 * 2. Outras: demais unidades, ordenadas por proximidade
 *
 * Sem coordenadas: promove unidades que combinam com UF/cidade da região.
 */
export function agruparSedesPorRegiao(
  sedes: SedeOnboarding[],
  uf?: string,
  cidade?: string,
  localizacao?: LocalizacaoOnboarding,
): SedesAgrupadasOnboarding {
  const sedeNacional = sedes.find((s) => s.tipo === 'SEDE') ?? null
  const territoriais = sedes.filter((s) => s.tipo !== 'SEDE')
  const ordenadas = [...territoriais].sort(compararPorProximidade(localizacao))

  let segunda: SedeOnboarding | null = null

  if (localizacao) {
    const candidatas = ordenadas.filter((s) => {
      const d = distanciaKm(localizacao, s)
      return d != null && d <= RAIO_RECOMENDACAO_KM
    })
    segunda = candidatas[0] ?? null
  }

  if (!segunda) {
    const regionais = ordenadas.filter((s) => sedeCombinaRegiao(s, uf, cidade))
    segunda = regionais[0] ?? null
  }

  const recomendadasIds = new Set<string>()
  const recomendadas: SedeOnboardingComDistancia[] = []

  if (sedeNacional) {
    recomendadas.push(comDistancia(sedeNacional, localizacao))
    recomendadasIds.add(sedeNacional.id)
  }
  if (segunda && !recomendadasIds.has(segunda.id)) {
    recomendadas.push(comDistancia(segunda, localizacao))
    recomendadasIds.add(segunda.id)
  }

  const outras: SedeOnboardingComDistancia[] = ordenadas
    .filter((s) => !recomendadasIds.has(s.id))
    .map((s) => comDistancia(s, localizacao))

  return { recomendadas, outras }
}
