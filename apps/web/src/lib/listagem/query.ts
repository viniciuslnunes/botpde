import 'server-only'

import {
  BUSCA_TERMOS_MAX,
  ESCOPO_TENANT,
  filtroPorId,
  filtrosDoSpec,
  type ListagemFaceta,
  type ListagemFacetas,
  type ListagemFiltroSpec,
  type ListagemPaginacao,
  type ListagemParams,
  type ListagemSpec,
} from './spec'

/**
 * `where`/`orderBy` da listagem em forma neutra. O call site anota o tipo Prisma
 * do modelo (`const where: Prisma.SaasMembroWhereInput = montarWhereListagem(...)`),
 * como manda a convenção de tipo de retorno explícito deste schema.
 */
export type ListagemWhere = Record<string, unknown>

/**
 * Escopo obrigatório da consulta. Existe para que esquecer o `tenantId` seja
 * erro de tipo, e não um vazamento silencioso entre torcidas: quem precisa
 * consultar referência global (`Afiliacao`, `Partida`, `Noticia`) declara a
 * exceção com motivo.
 */
export type ListagemEscopo =
  /** Modelo com coluna `tenantId` própria — o filtro entra na raiz do `where`. */
  | { tenantId: string }
  /**
   * Modelo global sem `tenantId` (ex.: `User`). O recorte por torcida vem de uma
   * cláusula de relação em `extra`; o `tenantId` segue conhecido aqui para
   * resolver `ESCOPO_TENANT` nas cláusulas do spec.
   */
  | { tenantId: string; viaRelacao: true }
  /** Referência global de verdade (`Afiliacao`, `Partida`, `Noticia`). */
  | { global: true; motivo: string }

export interface MontarWhereOpcoes {
  escopo: ListagemEscopo
  /**
   * Cláusulas de negócio da própria página (ex.: só membros aprovados sem
   * carteirinha). Entram no `AND`, então nunca colidem com filtros nem busca.
   */
  extra?: readonly ListagemWhere[]
  /**
   * Filtro a desconsiderar. Usado pelas facetas: a contagem de uma opção deve
   * refletir os outros filtros, não o próprio — senão a opção não selecionada
   * sempre contaria zero.
   */
  ignorarFiltro?: string
}

/** Grava `a.b.c = valor` criando os níveis intermediários e preservando irmãos. */
function atribuirCaminho(alvo: ListagemWhere, caminho: string, valor: unknown): void {
  const partes = caminho.split('.')
  let atual = alvo
  for (let i = 0; i < partes.length - 1; i++) {
    const parte = partes[i]!
    const existente = atual[parte]
    if (existente && typeof existente === 'object' && !Array.isArray(existente)) {
      atual = existente as ListagemWhere
    } else {
      const novo: ListagemWhere = {}
      atual[parte] = novo
      atual = novo
    }
  }
  atual[partes[partes.length - 1]!] = valor
}

function clausula(caminho: string, valor: unknown): ListagemWhere {
  const alvo: ListagemWhere = {}
  atribuirCaminho(alvo, caminho, valor)
  return alvo
}

/** Troca as sentinelas `ESCOPO_TENANT` das cláusulas do spec pelo tenant atual. */
function resolverSentinela(valor: unknown, tenantId: string | null): unknown {
  if (valor === ESCOPO_TENANT) {
    if (tenantId === null) {
      throw new Error(
        'Cláusula de listagem usa ESCOPO_TENANT em consulta declarada como global.',
      )
    }
    return tenantId
  }
  if (Array.isArray(valor)) return valor.map((item) => resolverSentinela(item, tenantId))
  if (valor && typeof valor === 'object') {
    const saida: ListagemWhere = {}
    for (const [chave, item] of Object.entries(valor as ListagemWhere)) {
      saida[chave] = resolverSentinela(item, tenantId)
    }
    return saida
  }
  return valor
}

function clausulaEnum(filtro: ListagemFiltroSpec, valores: string[]): ListagemWhere | null {
  const nulo = filtro.valorNulo
  const querNulo = nulo !== undefined && valores.includes(nulo)

  // Valores com cláusula própria declarada no spec (relação vazia, negação…).
  const especiais = valores
    .filter((v) => filtro.clausulas?.[v])
    .map((v) => filtro.clausulas![v]!)

  const concretos = valores.filter(
    (v) => v !== nulo && !filtro.clausulas?.[v],
  )

  const alternativas: ListagemWhere[] = [...especiais]
  if (querNulo) alternativas.push(clausula(filtro.campo, null))
  if (concretos.length > 0) {
    alternativas.push(
      clausula(filtro.campo, concretos.length === 1 ? concretos[0] : { in: concretos }),
    )
  }

  if (alternativas.length === 0) return null
  if (alternativas.length === 1) return alternativas[0]!
  return { OR: alternativas }
}

function clausulaData(filtro: ListagemFiltroSpec, valores: string[]): ListagemWhere | null {
  const [de, ate] = valores
  const range: Record<string, Date> = {}
  const inicio = de ? new Date(de) : null
  const fim = ate ? new Date(ate) : null
  if (inicio && !Number.isNaN(inicio.getTime())) range.gte = inicio
  if (fim && !Number.isNaN(fim.getTime())) {
    // `ate` é dia inclusivo: o usuário digita a data final, não o instante.
    fim.setHours(23, 59, 59, 999)
    range.lte = fim
  }
  if (Object.keys(range).length === 0) return null
  return clausula(filtro.campo, range)
}

function clausulaDeFiltro(
  filtro: ListagemFiltroSpec,
  valores: string[],
): ListagemWhere | null {
  if (valores.length === 0) return null

  switch (filtro.tipo) {
    case 'enum':
      return clausulaEnum(filtro, valores)
    case 'texto':
      return clausula(filtro.campo, { contains: valores[0]!, mode: 'insensitive' })
    case 'booleano': {
      const valor = valores[0]
      if (valor !== 'true' && valor !== 'false') return null
      return clausula(filtro.campo, valor === 'true')
    }
    case 'data':
      return clausulaData(filtro, valores)
    default:
      return null
  }
}

function clausulaCampoBusca(
  campo: { campo: string; modo?: 'texto' | 'digitos' },
  termo: string,
): ListagemWhere {
  return clausula(
    campo.campo,
    campo.modo === 'digitos'
      ? { contains: termo }
      : { contains: termo, mode: 'insensitive' },
  )
}

/**
 * Particiona `q` em tokens não vazios. Espaços e pontuação leve separam;
 * o teto evita `AND` patológico vindo da URL.
 */
export function tokensDaBusca(termo: string, max = BUSCA_TERMOS_MAX): string[] {
  return termo
    .trim()
    .split(/[\s,;|/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, max)
}

function clausulaDeBusca(spec: ListagemSpec, termo: string): ListagemWhere | null {
  const q = termo.trim()
  if (!q || !spec.buscaEm || spec.buscaEm.length === 0) return null

  if (spec.buscaModo === 'termos') {
    const tokens = tokensDaBusca(q)
    if (tokens.length === 0) return null
    if (tokens.length === 1) {
      return { OR: spec.buscaEm.map((campo) => clausulaCampoBusca(campo, tokens[0]!)) }
    }
    return {
      AND: tokens.map((token) => ({
        OR: spec.buscaEm!.map((campo) => clausulaCampoBusca(campo, token)),
      })),
    }
  }

  return {
    OR: spec.buscaEm.map((campo) => clausulaCampoBusca(campo, q)),
  }
}

/**
 * Monta o `where` completo: escopo de tenant + cláusulas da página + filtros do
 * spec + busca livre. Tudo que pode conflitar em chave vai para o `AND`.
 */
export function montarWhereListagem<W>(
  spec: ListagemSpec,
  params: ListagemParams,
  opcoes: MontarWhereOpcoes,
): W {
  const escopo = opcoes.escopo
  const tenantId = 'tenantId' in escopo ? escopo.tenantId : null
  const where: ListagemWhere = {}
  if (tenantId !== null && !('viaRelacao' in escopo)) where.tenantId = tenantId

  const and: ListagemWhere[] = [...(opcoes.extra ?? [])]

  for (const [filtroId, valores] of Object.entries(params.filtros)) {
    if (filtroId === opcoes.ignorarFiltro) continue
    const filtro = filtroPorId(spec, filtroId)
    if (!filtro) continue
    const clausulaFiltro = clausulaDeFiltro(filtro, valores)
    if (clausulaFiltro) {
      and.push(resolverSentinela(clausulaFiltro, tenantId) as ListagemWhere)
    }
  }

  const busca = clausulaDeBusca(spec, params.q)
  if (busca) and.push(busca)

  if (and.length > 0) where.AND = and
  return where as unknown as W
}

/** `orderBy` da coluna ativa; caminho com ponto vira objeto aninhado. */
export function montarOrderByListagem<O>(
  spec: ListagemSpec,
  params: ListagemParams,
): O {
  const coluna = spec.colunas.find((c) => c.id === params.sort)
  const campo = coluna?.ordenarPor ?? spec.sortPadrao
  return clausula(campo, params.dir) as unknown as O
}

export function montarPaginacao(params: ListagemParams): { skip: number; take: number } {
  return {
    skip: (params.pagina - 1) * params.porPagina,
    take: params.porPagina,
  }
}

/**
 * Resume a paginação para a UI. Corrige a página quando o total encolheu (filtro
 * novo, registro removido) para não exibir "Mostrando 501–525 de 30".
 */
export function resumirPaginacao(
  total: number,
  params: ListagemParams,
): ListagemPaginacao {
  const totalPaginas = Math.max(1, Math.ceil(total / params.porPagina))
  const pagina = Math.min(params.pagina, totalPaginas)
  const de = total === 0 ? 0 : (pagina - 1) * params.porPagina + 1
  const ate = Math.min(pagina * params.porPagina, total)
  return { total, pagina, porPagina: params.porPagina, totalPaginas, faixa: { de, ate } }
}

/** Linha de `groupBy` que a página devolve para o cálculo de faceta. */
export interface FacetaLinha {
  valor: string | null
  count: number
}

/**
 * Executa um `groupBy` por filtro facetado. A página fornece `agrupar` porque só
 * ela tem o delegate Prisma tipado do modelo:
 *
 * ```ts
 * carregarFacetas(SPEC, params, { escopo }, async (campo, where) => {
 *   const linhas = await db.saasMembro.groupBy({ by: [campo], where, _count: true })
 *   return linhas.map((l) => ({ valor: l[campo], count: l._count }))
 * })
 * ```
 */
export async function carregarFacetas(
  spec: ListagemSpec,
  params: ListagemParams,
  opcoes: MontarWhereOpcoes,
  agrupar: (campo: string, where: ListagemWhere) => Promise<FacetaLinha[]>,
  rotulos: Record<string, Record<string, string>> = {},
): Promise<ListagemFacetas> {
  const facetados = filtrosDoSpec(spec).filter((f) => f.faceta)
  if (facetados.length === 0) return {}

  const entradas = await Promise.all(
    facetados.map(async (filtro): Promise<[string, ListagemFaceta[]]> => {
      // `groupBy` agrupa por campo escalar do próprio modelo — caminho de
      // relação não tem tradução. Invariante travada em teste.
      if (filtro.campo.includes('.')) return [filtro.id, []]

      const where = montarWhereListagem<ListagemWhere>(spec, params, {
        ...opcoes,
        ignorarFiltro: filtro.id,
      })
      const linhas = await agrupar(filtro.campo, where)

      const rotulosDoFiltro = rotulos[filtro.id] ?? {}
      const facetas: ListagemFaceta[] = linhas.map((linha) => {
        const valor = linha.valor ?? (filtro.valorNulo ?? '')
        return {
          valor,
          label:
            rotulosDoFiltro[valor] ??
            filtro.opcoes?.find((o) => o.valor === valor)?.label ??
            valor,
          count: linha.count,
        }
      })

      // Opções declaradas sem nenhuma linha aparecem com 0 — o admin precisa
      // ver que o status existe e está vazio, não que a opção desapareceu.
      for (const opcao of filtro.opcoes ?? []) {
        if (facetas.some((f) => f.valor === opcao.valor)) continue
        facetas.push({ valor: opcao.valor, label: opcao.label, count: 0 })
      }

      if (filtro.opcoes) {
        const ordem = new Map(filtro.opcoes.map((o, i) => [o.valor, i]))
        facetas.sort((a, b) => (ordem.get(a.valor) ?? 99) - (ordem.get(b.valor) ?? 99))
      } else {
        facetas.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
      }

      return [filtro.id, facetas.filter((f) => f.valor !== '')]
    }),
  )

  return Object.fromEntries(entradas)
}
