/** Regiões geográficas do Brasil e UFs — filtro do mapa no onboarding Clube. */

export type RegiaoBrasilId = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul'

export type RegiaoBrasilMeta = {
  id: RegiaoBrasilId
  nome: string
  /** Cor da face superior (mapa isométrico). */
  face: string
  /** Face lateral esquerda (mais escura). */
  lateralEsq: string
  /** Face lateral direita. */
  lateralDir: string
  ufs: readonly string[]
}

export const UFS_POR_REGIAO: Record<RegiaoBrasilId, readonly string[]> = {
  norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'centro-oeste': ['DF', 'GO', 'MT', 'MS'],
  sudeste: ['ES', 'MG', 'RJ', 'SP'],
  sul: ['PR', 'RS', 'SC'],
}

export const REGIOES_BRASIL: readonly RegiaoBrasilMeta[] = [
  {
    id: 'norte',
    nome: 'Norte',
    face: '#2d8a5e',
    lateralEsq: '#1a5c3d',
    lateralDir: '#24704c',
    ufs: UFS_POR_REGIAO.norte,
  },
  {
    id: 'nordeste',
    nome: 'Nordeste',
    face: '#e8a317',
    lateralEsq: '#a8720f',
    lateralDir: '#c98c12',
    ufs: UFS_POR_REGIAO.nordeste,
  },
  {
    id: 'centro-oeste',
    nome: 'Centro-Oeste',
    face: '#d94a3d',
    lateralEsq: '#9a2e25',
    lateralDir: '#b83c31',
    ufs: UFS_POR_REGIAO['centro-oeste'],
  },
  {
    id: 'sudeste',
    nome: 'Sudeste',
    face: '#3b6fd4',
    lateralEsq: '#244a91',
    lateralDir: '#2f5bb3',
    ufs: UFS_POR_REGIAO.sudeste,
  },
  {
    id: 'sul',
    nome: 'Sul',
    face: '#5b8fd9',
    lateralEsq: '#3a5f94',
    lateralDir: '#4a76b5',
    ufs: UFS_POR_REGIAO.sul,
  },
] as const

export const NOME_UF: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

/** Capital de cada UF — desempata a busca nacional de municípios. */
export const CAPITAL_DA_UF: Record<string, string> = {
  AC: 'Rio Branco',
  AL: 'Maceió',
  AP: 'Macapá',
  AM: 'Manaus',
  BA: 'Salvador',
  CE: 'Fortaleza',
  DF: 'Brasília',
  ES: 'Vitória',
  GO: 'Goiânia',
  MA: 'São Luís',
  MT: 'Cuiabá',
  MS: 'Campo Grande',
  MG: 'Belo Horizonte',
  PA: 'Belém',
  PB: 'João Pessoa',
  PR: 'Curitiba',
  PE: 'Recife',
  PI: 'Teresina',
  RJ: 'Rio de Janeiro',
  RN: 'Natal',
  RS: 'Porto Alegre',
  RO: 'Porto Velho',
  RR: 'Boa Vista',
  SC: 'Florianópolis',
  SP: 'São Paulo',
  SE: 'Aracaju',
  TO: 'Palmas',
}

export function regiaoDaUf(uf: string): RegiaoBrasilId | null {
  const up = uf.toUpperCase()
  for (const r of REGIOES_BRASIL) {
    if (r.ufs.includes(up)) return r.id
  }
  return null
}

export function metaRegiao(id: RegiaoBrasilId): RegiaoBrasilMeta {
  const found = REGIOES_BRASIL.find((r) => r.id === id)
  if (!found) throw new Error(`Região desconhecida: ${id}`)
  return found
}
