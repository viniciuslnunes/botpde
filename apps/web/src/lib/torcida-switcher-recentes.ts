import { lerRecentes, registrarRecente } from '@/lib/context-switcher-recentes'

export const MAX_TORCIDAS_RECENTES = 5

const NS = 'torcida'

/** Slugs das torcidas recentemente selecionadas pelo operador (browser local). */
export function lerTorcidasRecentes(): string[] {
  return lerRecentes(NS)
}

export function registrarTorcidaRecente(slug: string): void {
  registrarRecente(NS, slug)
}
