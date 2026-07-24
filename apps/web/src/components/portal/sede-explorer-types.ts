export type SedeTipo = 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'

export type SedeExplorerEvento = {
  id: string
  titulo: string
  data: string
}

export type SedeExplorerRef = {
  id: string
  nome: string
  tipo: SedeTipo
  cidade?: string | null
}

export type SedeExplorerItem = {
  id: string
  nome: string
  tipo: SedeTipo
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  lat: number | null
  lng: number | null
  telefone: string | null
  horarios: string | null
  capacidade: number | null
  responsavel: string | null
  descricao: string | null
  /** Identidade (header/canais) — não usar como capa de localização. */
  fotoUrl: string | null
  streetViewHeading: number | null
  streetViewPitch: number | null
  streetViewFov: number | null
  sedePai: SedeExplorerRef | null
  filhos: SedeExplorerRef[]
  eventos: SedeExplorerEvento[]
}

export const TIPO_LABEL: Record<SedeTipo, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

export const TIPO_CLASS: Record<SedeTipo, string> = {
  SEDE: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  SUBSEDE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  PONTO_ENCONTRO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
}
