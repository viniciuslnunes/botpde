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

export { SEDE_TIPO_BADGE_CLASS as TIPO_CLASS } from '@/lib/sede-tipo-badge'
