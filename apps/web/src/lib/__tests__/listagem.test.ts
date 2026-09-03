import { describe, expect, it } from 'vitest'
import {
  ESCOPO_TENANT,
  PAGINA_MAX,
  PARAMS_RESERVADOS,
  POR_PAGINA_MAX,
  VALORES_POR_FILTRO_MAX,
  colunasOrdenaveis,
  filtrosDoSpec,
  parseListagemParams,
  construirHrefFiltro,
  construirHrefLimparFiltros,
  construirHrefListagem,
  construirHrefOrdenacao,
  porPaginaDoSpec,
  proximaDir,
  serializarQueryFormListagem,
  snapshotContratoListagem,
  aplicarSnapshotListagem,
  urlTemParamContrato,
  temFiltroAtivo,
} from '@/lib/listagem'
import {
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
  tokensDaBusca,
  type ListagemWhere,
} from '@/lib/listagem/query'
import { montarChips, montarFiltroUI, paramsDoContrato, paramsDoContratoPersistivel } from '@/lib/listagem/ui'
import {
  LISTAGEM_ACESSOS_PESSOAS,
  LISTAGEM_MEMBROS,
  LISTAGEM_SOCIOS_EMITIDAS,
  LISTAGEM_SUPER_ADMIN_SETUP,
  LISTAGEM_TORCEDORES,
  LISTAGENS,
} from '@/lib/listagem/specs'

const TENANT = 'tenant-1'

function comoTexto(valor: unknown): string {
  return JSON.stringify(valor)
}

describe('invariantes do registro de listagens', () => {
  it('todo spec tem id e basePath únicos', () => {
    const ids = LISTAGENS.map((s) => s.id)
    const paths = LISTAGENS.map((s) => `${s.basePath}#${s.id}`)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('sortPadrao aponta para uma coluna ordenável', () => {
    for (const spec of LISTAGENS) {
      const ordenaveis = colunasOrdenaveis(spec).map((c) => c.id)
      expect(ordenaveis, spec.id).toContain(spec.sortPadrao)
    }
  })

  it('id de filtro não colide com param reservado nem com outro filtro', () => {
    for (const spec of LISTAGENS) {
      const ids = filtrosDoSpec(spec).map((f) => f.id)
      expect(new Set(ids).size, spec.id).toBe(ids.length)
      for (const id of ids) {
        expect(PARAMS_RESERVADOS, `${spec.id}/${id}`).not.toContain(id)
      }
    }
  })

  it('faceta só em campo escalar — groupBy não atravessa relação', () => {
    for (const spec of LISTAGENS) {
      for (const filtro of filtrosDoSpec(spec)) {
        if (!filtro.faceta) continue
        expect(filtro.campo, `${spec.id}/${filtro.id}`).not.toContain('.')
      }
    }
  })

  it('campo proibido não vira filtro, ordenação, busca nem faceta', () => {
    for (const spec of LISTAGENS) {
      const proibidos = spec.camposProibidos ?? []
      if (proibidos.length === 0) continue

      for (const proibido of proibidos) {
        for (const coluna of spec.colunas) {
          expect(coluna.ordenarPor ?? '', `${spec.id}/orderBy`).not.toContain(proibido)
        }
        for (const filtro of filtrosDoSpec(spec)) {
          expect(filtro.campo, `${spec.id}/${filtro.id}`).not.toContain(proibido)
          expect(comoTexto(filtro.clausulas ?? {}), `${spec.id}/${filtro.id}`).not.toContain(
            proibido,
          )
        }
        for (const campo of spec.buscaEm ?? []) {
          expect(campo.campo, `${spec.id}/busca`).not.toContain(proibido)
        }
      }
    }
  })

  it('porPagina padrão do spec respeita o teto duro', () => {
    for (const spec of LISTAGENS) {
      expect(porPaginaDoSpec(spec), spec.id).toBeLessThanOrEqual(POR_PAGINA_MAX)
    }
  })

  it('cláusula escopada por relação vazia usa a sentinela de tenant', () => {
    for (const spec of LISTAGENS) {
      for (const filtro of filtrosDoSpec(spec)) {
        for (const [valor, clausula] of Object.entries(filtro.clausulas ?? {})) {
          const texto = comoTexto(clausula)
          if (!texto.includes('"none"')) continue
          // "none" sem tenant significaria "em torcida nenhuma" e esconderia
          // quem tem vínculo em outra torcida.
          expect(texto, `${spec.id}/${filtro.id}/${valor}`).toContain(
            JSON.stringify(ESCOPO_TENANT).slice(1, -1),
          )
        }
      }
    }
  })

  it('filtro por SaasMembro via .some. declara escopoSome com tenant', () => {
    for (const spec of LISTAGENS) {
      for (const filtro of filtrosDoSpec(spec)) {
        if (!filtro.campo.includes('membros.some')) continue
        expect(filtro.escopoSome, `${spec.id}/${filtro.id}`).toBeTruthy()
        expect(comoTexto(filtro.escopoSome), `${spec.id}/${filtro.id}`).toContain(
          JSON.stringify(ESCOPO_TENANT).slice(1, -1),
        )
      }
    }
  })
})

describe('parse de params hostis', () => {
  const spec = LISTAGEM_MEMBROS

  it('sort fora da allowlist cai no padrão', () => {
    const params = parseListagemParams({ sort: 'cpf', dir: 'asc' }, spec)
    expect(params.sort).toBe(spec.sortPadrao)
  })

  it('dir inválido cai na direção padrão da coluna', () => {
    const params = parseListagemParams({ sort: 'nome', dir: 'DROP TABLE' }, spec)
    expect(params.dir).toBe('asc')
  })

  it('porPagina é limitado pelo teto duro', () => {
    expect(parseListagemParams({ porPagina: '100000' }, spec).porPagina).toBe(
      porPaginaDoSpec(spec),
    )
    expect(parseListagemParams({ porPagina: '50' }, spec).porPagina).toBe(50)
    expect(parseListagemParams({ porPagina: '-3' }, spec).porPagina).toBe(
      porPaginaDoSpec(spec),
    )
  })

  it('pagina não numérica ou fora de faixa cai em 1 ou no teto', () => {
    expect(parseListagemParams({ pagina: 'abc' }, spec).pagina).toBe(1)
    expect(parseListagemParams({ pagina: '0' }, spec).pagina).toBe(1)
    expect(parseListagemParams({ pagina: '999999' }, spec).pagina).toBe(1)
    expect(parseListagemParams({ pagina: String(PAGINA_MAX) }, spec).pagina).toBe(PAGINA_MAX)
  })

  it('valor de enum fora das opções declaradas é descartado', () => {
    const params = parseListagemParams({ status: 'PENDENTE,ESPIAO' }, spec)
    expect(params.filtros.status).toEqual(['PENDENTE'])
  })

  it('filtro desconhecido na URL não entra nos params', () => {
    const params = parseListagemParams({ senhaHash: 'x', status: 'PENDENTE' }, spec)
    expect(Object.keys(params.filtros)).toEqual(['status'])
  })

  it('filtro single-select ignora valores extras', () => {
    const params = parseListagemParams({ status: 'APROVADO,PENDENTE' }, spec)
    expect(params.filtros.status).toEqual(['APROVADO'])
  })

  it('cardinalidade de filtro múltiplo é limitada', () => {
    const muitos = Array.from({ length: 200 }, (_, i) => `id-${i}`).join(',')
    const params = parseListagemParams({ sede: muitos }, spec)
    expect(params.filtros.sede!.length).toBeLessThanOrEqual(VALORES_POR_FILTRO_MAX)
  })

  it('intervalo de data aceita só ISO e usa dois params', () => {
    const ok = parseListagemParams({ criadoEmDe: '2026-01-01', criadoEmAte: '2026-03-31' }, spec)
    expect(ok.filtros.criadoEm).toEqual(['2026-01-01', '2026-03-31'])
    const ruim = parseListagemParams({ criadoEmDe: 'ontem' }, spec)
    expect(ruim.filtros.criadoEm).toBeUndefined()
  })

  it('valores repetidos são deduplicados', () => {
    const params = parseListagemParams({ sede: 'a,a,b' }, spec)
    expect(params.filtros.sede).toEqual(['a', 'b'])
  })
})

describe('montagem do where', () => {
  const spec = LISTAGEM_MEMBROS

  it('escopo de tenant sempre entra na raiz', () => {
    const params = parseListagemParams({}, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
    })
    expect(where.tenantId).toBe(TENANT)
  })

  it('filtros e busca convivem sem colidir na chave OR', () => {
    const params = parseListagemParams({ status: 'PENDENTE', sede: 'nenhuma', q: 'ana' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
    })
    const and = where.AND as ListagemWhere[]
    expect(Array.isArray(and)).toBe(true)
    // Uma cláusula por filtro + uma da busca; nenhum `OR` solto na raiz.
    expect(and.length).toBe(3)
    expect(where.OR).toBeUndefined()
  })

  it('valorNulo vira comparação com null', () => {
    const params = parseListagemParams({ sede: 'nenhuma' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
    })
    expect(comoTexto(where)).toContain('"sedeId":null')
  })

  it('valorNulo combinado com ids concretos vira OR', () => {
    const params = parseListagemParams({ sede: 'nenhuma,sede-1' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
    })
    const and = where.AND as ListagemWhere[]
    expect(comoTexto(and[0])).toContain('"OR"')
  })

  it('cláusulas da própria página entram no AND', () => {
    const params = parseListagemParams({}, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
      extra: [{ espelhado: false }],
    })
    expect(comoTexto(where.AND)).toContain('"espelhado":false')
  })

  it('ignorarFiltro tira só aquele filtro — base das facetas', () => {
    const params = parseListagemParams({ status: 'PENDENTE', cidade: 'santos' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
      ignorarFiltro: 'status',
    })
    const texto = comoTexto(where)
    expect(texto).not.toContain('PENDENTE')
    expect(texto).toContain('santos')
  })

  // A tab Desligados de /admin/torcedores usa a chave `status` na URL, mas no banco
  // o critério é `desligadoEm`. Como o filtro entra no `AND` (e não na raiz),
  // limpar o `where` pronto não adianta: quem traduz precisa tirar o filtro dos
  // params. Sem isso, `status: 'DESLIGADO'` chegava ao Prisma e derrubava a página.
  it('filtro traduzido some do where quando sai dos params', () => {
    const params = parseListagemParams({ status: 'DESLIGADO', sede: 'sede-1' }, spec)
    const ingenuo = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
    })
    // O valor não fica na raiz — deletar `where.status` seria no-op.
    expect(ingenuo.status).toBeUndefined()
    expect(comoTexto(ingenuo)).toContain('DESLIGADO')

    const semStatus = { ...params, filtros: { ...params.filtros, status: [] } }
    const where = montarWhereListagem<ListagemWhere>(spec, semStatus, {
      escopo: { tenantId: TENANT },
      extra: [{ desligadoEm: { not: null } }],
    })
    const texto = comoTexto(where)
    expect(texto).not.toContain('DESLIGADO')
    expect(texto).toContain('"desligadoEm"')
    expect(texto).toContain('sede-1')
  })

  it('sentinela de tenant é resolvida nas cláusulas do spec', () => {
    const acessos = LISTAGEM_ACESSOS_PESSOAS
    const params = parseListagemParams({ cargo: 'sem' }, acessos)
    const where = montarWhereListagem<ListagemWhere>(acessos, params, {
      escopo: { tenantId: TENANT },
    })
    const texto = comoTexto(where)
    expect(texto).toContain(`"tenantId":"${TENANT}"`)
    expect(texto).not.toContain(ESCOPO_TENANT)
  })

  it('sentinela em consulta global é erro explícito, não vazamento', () => {
    const acessos = LISTAGEM_ACESSOS_PESSOAS
    const params = parseListagemParams({ cargo: 'sem' }, acessos)
    expect(() =>
      montarWhereListagem<ListagemWhere>(acessos, params, {
        escopo: { global: true, motivo: 'teste' },
      }),
    ).toThrow(/ESCOPO_TENANT/)
  })

  it('filtro de unidade em emitidas entra no some com tenantId', () => {
    const params = parseListagemParams({ sede: 'sede-abc' }, LISTAGEM_SOCIOS_EMITIDAS)
    const where = montarWhereListagem<ListagemWhere>(LISTAGEM_SOCIOS_EMITIDAS, params, {
      escopo: { tenantId: TENANT },
    })
    const texto = comoTexto(where)
    expect(texto).toContain(`"tenantId":"${TENANT}"`)
    expect(texto).toContain('"sedeId":"sede-abc"')
    expect(texto).toContain('"tipo":"SOCIO"')
    expect(texto).toMatch(/"membros":\{"some":\{/)
  })

  it('busca em campo de dígitos não usa modo insensitive', () => {
    const params = parseListagemParams({ q: '4321' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, {
      escopo: { tenantId: TENANT },
    })
    const busca = comoTexto(where.AND)
    expect(busca).toContain('"telefone":{"contains":"4321"}')
    expect(busca).toContain('"nome":{"contains":"4321","mode":"insensitive"}')
  })

  it('orderBy de relação vira objeto aninhado', () => {
    const params = parseListagemParams({ sort: 'sede', dir: 'asc' }, spec)
    expect(montarOrderByListagem<ListagemWhere>(spec, params)).toEqual({
      sede: { nome: 'asc' },
    })
  })
})

describe('setup super-admin — busca multi-termo e filtros', () => {
  const spec = LISTAGEM_SUPER_ADMIN_SETUP
  const escopo = {
    escopo: { global: true as const, motivo: 'teste setup' },
    extra: [{ sintetico: false }],
  }

  it('escopo global não injeta tenantId e preserva extra', () => {
    const params = parseListagemParams({}, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, escopo)
    expect(where.tenantId).toBeUndefined()
    expect(comoTexto(where.AND)).toContain('"sintetico":false')
  })

  it('busca multi-termo exige cada palavra em nome ou slug', () => {
    const params = parseListagemParams({ q: 'pde praia' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, escopo)
    const and = where.AND as ListagemWhere[]
    const busca = and.find((c) => Array.isArray(c.AND))
    expect(busca).toBeDefined()
    const termos = busca!.AND as ListagemWhere[]
    expect(termos).toHaveLength(2)
    expect(comoTexto(termos[0])).toContain('"contains":"pde"')
    expect(comoTexto(termos[1])).toContain('"contains":"praia"')
    expect(comoTexto(termos[0])).toContain('"nome"')
    expect(comoTexto(termos[0])).toContain('"slug"')
  })

  it('um único termo continua sendo OR simples entre campos', () => {
    const params = parseListagemParams({ q: 'gavioes' }, spec)
    const where = montarWhereListagem<ListagemWhere>(spec, params, escopo)
    const and = where.AND as ListagemWhere[]
    const busca = and.find((c) => Array.isArray(c.OR))
    expect(busca).toBeDefined()
    expect(comoTexto(busca)).toContain('"contains":"gavioes"')
    expect(busca!.AND).toBeUndefined()
  })

  it('situacao traduz string da URL em boolean Prisma via cláusulas', () => {
    const params = parseListagemParams({ situacao: 'false' }, spec)
    expect(params.filtros.situacao).toEqual(['false'])
    const where = montarWhereListagem<ListagemWhere>(spec, params, escopo)
    expect(comoTexto(where)).toContain('"ativo":false')
    expect(comoTexto(where)).not.toContain('"ativo":"false"')
  })

  it('plano hostil é descartado; plano válido entra no where', () => {
    const hostil = parseListagemParams({ plano: 'ENTERPRISE,FREE' }, spec)
    expect(hostil.filtros.plano).toEqual(['FREE'])
    const where = montarWhereListagem<ListagemWhere>(spec, hostil, escopo)
    expect(comoTexto(where)).toContain('FREE')
    expect(comoTexto(where)).not.toContain('ENTERPRISE')
  })

  it('tokensDaBusca limita cardinalidade e ignora vazios', () => {
    expect(tokensDaBusca('  pde   praia  ')).toEqual(['pde', 'praia'])
    const muitos = Array.from({ length: 20 }, (_, i) => `t${i}`).join(' ')
    expect(tokensDaBusca(muitos)).toHaveLength(8)
  })

  it('paginação padrão do setup respeita o teto e começa em 25', () => {
    const params = parseListagemParams({}, spec)
    expect(params.porPagina).toBe(25)
    expect(montarPaginacao(params)).toEqual({ skip: 0, take: 25 })
    expect(montarPaginacao(parseListagemParams({ pagina: '3' }, spec))).toEqual({
      skip: 50,
      take: 25,
    })
  })
})

describe('paginação', () => {
  const spec = LISTAGEM_MEMBROS

  it('skip/take derivam da página', () => {
    const params = parseListagemParams({ pagina: '3', porPagina: '25' }, spec)
    expect(montarPaginacao(params)).toEqual({ skip: 50, take: 25 })
  })

  it('faixa exibida cobre o intervalo real', () => {
    const params = parseListagemParams({ pagina: '2', porPagina: '25' }, spec)
    const resumo = resumirPaginacao(831, params)
    expect(resumo.faixa).toEqual({ de: 26, ate: 50 })
    expect(resumo.totalPaginas).toBe(34)
  })

  it('última página parcial não extrapola o total', () => {
    const params = parseListagemParams({ pagina: '34', porPagina: '25' }, spec)
    expect(resumirPaginacao(831, params).faixa).toEqual({ de: 826, ate: 831 })
  })

  it('total zerado não mostra faixa inventada', () => {
    const params = parseListagemParams({ pagina: '5' }, spec)
    const resumo = resumirPaginacao(0, params)
    expect(resumo.faixa).toEqual({ de: 0, ate: 0 })
    expect(resumo.pagina).toBe(1)
  })

  it('página além do total é corrigida quando o filtro encolhe o resultado', () => {
    const params = parseListagemParams({ pagina: '20', porPagina: '25' }, spec)
    expect(resumirPaginacao(30, params).pagina).toBe(2)
  })
})

describe('hrefs', () => {
  const spec = LISTAGEM_MEMBROS

  it('omite tudo que está no default', () => {
    const params = parseListagemParams({}, spec)
    expect(construirHrefListagem(spec, params)).toBe('/admin/torcedores')
  })

  it('ordenar por coluna nova volta para a página 1', () => {
    const params = parseListagemParams({ pagina: '4' }, spec)
    const href = construirHrefOrdenacao(spec, params, 'nome', 'asc')
    expect(href).toContain('sort=nome')
    expect(href).not.toContain('pagina=')
  })

  it('trocar filtro volta para a página 1 e preserva a busca', () => {
    const params = parseListagemParams({ pagina: '7', q: 'ana' }, spec)
    const href = construirHrefFiltro(spec, params, 'status', ['PENDENTE'])
    expect(href).toContain('q=ana')
    expect(href).toContain('status=PENDENTE')
    expect(href).not.toContain('pagina=')
  })

  it('limpar filtros zera busca e filtros, mantendo o tamanho de página', () => {
    const params = parseListagemParams({ q: 'ana', status: 'PENDENTE', porPagina: '50' }, spec)
    const href = construirHrefLimparFiltros(spec, params)
    expect(href).not.toContain('q=')
    expect(href).not.toContain('status=')
    expect(href).toContain('porPagina=50')
  })

  it('params fora do contrato são preservados via extras', () => {
    const params = parseListagemParams({}, spec)
    const href = construirHrefListagem(spec, params, {
      extras: { periodoGrafico: '6m' },
    })
    expect(href).toContain('periodoGrafico=6m')
  })

  it('clique repetido na coluna ativa inverte a direção', () => {
    const params = parseListagemParams({ sort: 'nome', dir: 'asc' }, spec)
    expect(proximaDir(spec, 'nome', params)).toBe('desc')
    expect(proximaDir(spec, 'cidade', params)).toBe('asc')
  })

  it('ida e volta pela URL preserva os params do contrato', () => {
    const original = parseListagemParams(
      { q: 'ana', status: 'PENDENTE', sede: 'nenhuma', sort: 'nome', dir: 'desc', porPagina: '50', pagina: '3' },
      spec,
    )
    const href = construirHrefListagem(spec, original)
    const query = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''))
    expect(parseListagemParams(query, spec)).toEqual(original)
  })
})

describe('props de UI derivadas do spec', () => {
  const spec = LISTAGEM_MEMBROS

  it('opção facetada carrega contagem e href de toggle', () => {
    const params = parseListagemParams({ sede: 'sede-1' }, spec)
    const filtro = spec.colunas.find((c) => c.id === 'sede')!.filtro!
    const ui = montarFiltroUI(spec, params, filtro, {
      sede: [
        { valor: 'sede-1', label: 'Unidade 1', count: 400 },
        { valor: 'sede-2', label: 'Unidade 2', count: 431 },
      ],
    })
    const sede1 = ui.opcoes!.find((o) => o.valor === 'sede-1')!
    expect(sede1.ativo).toBe(true)
    expect(sede1.count).toBe(400)
    // Já ativo: o href precisa desligar, não reafirmar.
    expect(sede1.href).not.toContain('sede=sede-1')
    expect(ui.opcoes!.find((o) => o.valor === 'sede-2')!.href).toContain(
      'sede=sede-1%2Csede-2',
    )
  })

  it('filtro de texto entrega form GET com os outros params preservados', () => {
    const params = parseListagemParams({ q: 'ana', status: 'PENDENTE', cidade: 'santos', pagina: '4' }, spec)
    const filtro = spec.colunas.find((c) => c.id === 'cidade')!.filtro!
    const ui = montarFiltroUI(spec, params, filtro)
    const nomes = ui.form!.ocultos.map((c) => c.nome)
    expect(nomes).toContain('q')
    expect(nomes).toContain('status')
    // O próprio filtro vem do input; página nunca é preservada num filtro novo.
    expect(nomes).not.toContain('cidade')
    expect(nomes).not.toContain('pagina')
    expect(ui.valorTexto).toBe('santos')
  })

  it('chips descrevem cada valor ativo e removem só ele', () => {
    const params = parseListagemParams({ sede: 'a,b' }, spec)
    const chips = montarChips(spec, params, {}, {
      sede: [
        { valor: 'a', label: 'Unidade A' },
        { valor: 'b', label: 'Unidade B' },
      ],
    })
    expect(chips).toHaveLength(2)
    expect(chips[0]!.valor).toBe('Unidade A')
    expect(chips[0]!.href).toContain('sede=b')
  })

  it('params do contrato cobrem reservados e filtros, inclusive intervalo', () => {
    const nomes = paramsDoContrato(spec)
    expect(nomes).toContain('q')
    expect(nomes).toContain('porPagina')
    expect(nomes).toContain('status')
    expect(nomes).toContain('criadoEmDe')
    expect(nomes).toContain('criadoEmAte')
    expect(nomes).not.toContain('criadoEm')
  })

  it('filtro ativo é distinguível de listagem vazia', () => {
    expect(temFiltroAtivo(parseListagemParams({}, spec))).toBe(false)
    expect(temFiltroAtivo(parseListagemParams({ q: 'ana' }, spec))).toBe(true)
    expect(temFiltroAtivo(parseListagemParams({ status: 'PENDENTE' }, spec))).toBe(true)
    expect(temFiltroAtivo(parseListagemParams({ pagina: '3' }, spec))).toBe(false)
  })
})

describe('serializarQueryFormListagem', () => {
  it('omite busca vazia e só espaços — limpar o campo não deixa q= na query', () => {
    const dados = new FormData()
    dados.set('q', 'Annthony Cordeiro')
    dados.set('status', 'PENDENTE')
    expect(serializarQueryFormListagem(dados, { q: '' })).toBe('status=PENDENTE')
    expect(serializarQueryFormListagem(dados, { q: '   ' })).toBe('status=PENDENTE')
  })

  it('usa o valor digitado no evento, não o FormData atrasado', () => {
    const dados = new FormData()
    dados.set('q', 'Ann')
    expect(serializarQueryFormListagem(dados, { q: 'Anna' })).toBe('q=Anna')
  })

  it('form vazio vira query vazia — a URL nua, não ?q=', () => {
    expect(serializarQueryFormListagem(new FormData(), { q: '' })).toBe('')
  })
})

describe('snapshot da listagem (persistência)', () => {
  const contrato = ['q', 'pagina', 'porPagina', 'sort', 'dir', 'status'] as const

  it('não persiste busca — termo pontual não é visão da lista', () => {
    const atuais = new URLSearchParams('q=Annthony+Cordeiro')
    expect(snapshotContratoListagem(atuais, contrato).toString()).toBe('')
  })

  it('não persiste offset de página', () => {
    const atuais = new URLSearchParams('pagina=4&status=PENDENTE')
    expect(snapshotContratoListagem(atuais, contrato).toString()).toBe('status=PENDENTE')
  })

  it('guarda filtro, ordenação e tamanho de página', () => {
    const snapshot = snapshotContratoListagem(
      new URLSearchParams('sort=nome&dir=asc&porPagina=50&status=PENDENTE'),
      contrato,
    )
    expect(snapshot.get('sort')).toBe('nome')
    expect(snapshot.get('dir')).toBe('asc')
    expect(snapshot.get('porPagina')).toBe('50')
    expect(snapshot.get('status')).toBe('PENDENTE')
    expect(snapshot.get('q')).toBeNull()
    expect(snapshot.get('pagina')).toBeNull()
  })

  it('snapshot velho com q não reaparece na URL nua', () => {
    const destino = aplicarSnapshotListagem(
      new URLSearchParams(),
      'q=Annthony+Cordeiro&status=PENDENTE',
      contrato,
    )
    expect(destino.get('q')).toBeNull()
    expect(destino.get('status')).toBe('PENDENTE')
  })

  it('snapshot só de busca não produz query a restaurar', () => {
    const destino = aplicarSnapshotListagem(
      new URLSearchParams(),
      'q=Annthony+Cordeiro',
      contrato,
    )
    expect(destino.toString()).toBe('')
  })

  it('URL com busca conta como contrato — não restaura por cima da procura', () => {
    expect(urlTemParamContrato(new URLSearchParams('q=Ana'), contrato)).toBe(true)
    expect(urlTemParamContrato(new URLSearchParams(), contrato)).toBe(false)
    expect(urlTemParamContrato(new URLSearchParams('q='), contrato)).toBe(false)
  })

  it('aba status de Torcedores não entra no snapshot — menu abre em Todos', () => {
    const persistivel = paramsDoContratoPersistivel(LISTAGEM_TORCEDORES)
    expect(persistivel).not.toContain('status')
    expect(paramsDoContrato(LISTAGEM_TORCEDORES)).toContain('status')

    const snapshot = snapshotContratoListagem(
      new URLSearchParams('status=PENDENTE&sort=nome&dir=asc'),
      persistivel,
    )
    expect(snapshot.get('status')).toBeNull()
    expect(snapshot.get('sort')).toBe('nome')

    const destino = aplicarSnapshotListagem(
      new URLSearchParams(),
      'status=PENDENTE&sort=nome',
      persistivel,
    )
    expect(destino.get('status')).toBeNull()
    expect(destino.get('sort')).toBe('nome')

    // Link/notificação com ?status= explícito não é sobrescrito pelo restore.
    const comAba = aplicarSnapshotListagem(
      new URLSearchParams('status=PENDENTE'),
      'sort=nome',
      persistivel,
    )
    expect(comAba.get('status')).toBe('PENDENTE')
    expect(comAba.get('sort')).toBe('nome')
  })
})
