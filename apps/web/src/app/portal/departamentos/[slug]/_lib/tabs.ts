/**
 * Tabs internas do cockpit (`?tab=`): Painel / Equipe / Fila / Pedidos.
 * Áreas e Projetos saíram para sub-rota; os ids continuam aqui para
 * redirecionar bookmarks `?tab=areas` / `?tab=projetos`.
 */

export const DEPARTAMENTO_TABS = [
  'painel',
  'areas',
  'projetos',
  'equipe',
  'fila',
  'pedidos',
] as const

export type DepartamentoTab = (typeof DEPARTAMENTO_TABS)[number]

/** Âncoras antigas (`#areas`) → aba. Bookmarks e links já gravados continuam. */
export const HASH_PARA_TAB: Readonly<Record<string, DepartamentoTab>> = {
  painel: 'painel',
  dominio: 'painel',
  gestao: 'equipe',
  canal: 'painel',
  caixa: 'painel',
  inventario: 'painel',
  acervo: 'painel',
  instrumentos: 'painel',
  agenda: 'painel',
  escala: 'painel',
  barracao: 'painel',
  embarque: 'painel',
  avisos: 'painel',
  areas: 'areas',
  projetos: 'projetos',
  equipe: 'equipe',
  fila: 'fila',
  'pedidos-area': 'pedidos',
  pedidos: 'pedidos',
}

export type DepartamentoTabOpcoes = {
  temFila: boolean
  temPedidos: boolean
}

export function isDepartamentoTab(valor: string): valor is DepartamentoTab {
  return (DEPARTAMENTO_TABS as readonly string[]).includes(valor)
}

export function resolverTabDeHash(hash: string): DepartamentoTab | null {
  const chave = hash.replace(/^#/, '').trim()
  if (!chave) return null
  return HASH_PARA_TAB[chave] ?? (isDepartamentoTab(chave) ? chave : null)
}

export function parseDepartamentoTab(
  valor: string | undefined,
  opts: DepartamentoTabOpcoes,
): DepartamentoTab {
  const bruto = valor?.trim() ?? ''
  const tab = HASH_PARA_TAB[bruto] ?? (isDepartamentoTab(bruto) ? bruto : 'painel')
  if (tab === 'fila' && !opts.temFila) return 'painel'
  if (tab === 'pedidos' && !opts.temPedidos) return 'painel'
  return tab
}

/** Primeiro valor de um searchParam (Next entrega `string | string[]`). */
export function primeiroSearchParam(
  valor: string | string[] | undefined,
): string | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor
  const t = bruto?.trim()
  return t || undefined
}

/** Página da grade do acervo (`?page=`). Valores inválidos caem em 1. */
export function parseAcervoPage(valor: string | undefined): number {
  const n = Number.parseInt(valor ?? '', 10)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * Aba inferida do deep-link (`?area=` / `?projeto=` / `?pessoa=`) quando a
 * query não trouxe `tab`. A URL canônica do `hrefHomeDepartamento` já inclui
 * a aba; isto cobre bookmark incompleto.
 */
export function tabSugeridaPeloFoco(foco: {
  area?: string
  projeto?: string
  pessoa?: string
}): DepartamentoTab | null {
  if (foco.area) return 'areas'
  if (foco.projeto) return 'projetos'
  if (foco.pessoa) return 'equipe'
  return null
}

export function rotuloTabPainel(panel: string): string {
  switch (panel) {
    case 'financeiro':
      return 'Caixa'
    case 'patrimonio':
      return 'Inventário'
    case 'bandeiras':
      return 'Acervo'
    case 'bateria':
      return 'Ensaios'
    case 'caravanas':
      return 'Embarque'
    case 'carnaval':
      return 'Barracão'
    case 'diretoria':
      return 'Governança'
    default:
      return 'Painel'
  }
}
