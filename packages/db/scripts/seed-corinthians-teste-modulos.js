/**
 * Seed de teste — Corinthians, FASE 2: módulos operacionais.
 *
 * Complementa seed-corinthians-teste.js (que cobriu pessoas, cargos,
 * Comunidade, Agenda genérica, Salas e pedidos de loja do Gaviões) com o que
 * ficou de fora:
 *
 *   A. Departamentos — preferência de área (SaasMembro.departamentoId) só
 *      para SOCIO, e equipe de fato (UserDepartamento + perfil de área) só
 *      para sócios elegíveis, mais gestores por área (DepartamentoGestor).
 *   B. Cenários de permissão — vice-presidentes (respeitando
 *      MAX_VICE_PRESIDENTES), overrides individuais (UserPermission
 *      granted/denied) e membros deliberadamente sem cargo.
 *   C. Patrimônio — inventário por torcida (instrumentos, bandeirões…).
 *   D. Financeiro — livro-caixa com receitas/despesas nos últimos 6 meses.
 *   E. Loja nas 5 torcidas sem catálogo (o Gaviões já tem o real) +
 *      cupom + pedidos, com receita no livro-caixa.
 *   F. Bar (PDV) — catálogo/estoque por unidade, turnos de caixa, vendas
 *      (PIX/dinheiro/cartão/fiado), estorno, movimentação de estoque e
 *      integração com o Financeiro (categoria BAR).
 *   G. Caravanas / Bateria — eventos `CARAVANA` (vaga paga, capacidade,
 *      lista de espera, check-in) e série de `ENSAIO` semanal.
 *   H. Moderação — denúncias na fila do admin (pendentes e resolvidas).
 *
 * Marcação (idem fase 1 — ver docs/ops/plano-teste-volume-dados.md):
 *   - `Evento` do seed: título com prefixo `[TESTE-CORINTHIANS] `.
 *   - Entidades sem autor sintético (Patrimônio, Financeiro, Bar) levam o
 *     marcador em `observacao` — é o único campo livre que o reset pode
 *     filtrar sem sujar a UI com prefixo no nome.
 *   - Catálogo (loja e bar) é marcado por `slug` com prefixo
 *     `teste-corinthians-`; cupom por código com prefixo `TESTE`.
 *
 * Idempotente por fase e por torcida: se já existe dado marcado, pula.
 *
 * Uso:
 *   pnpm --filter @torcida/db seed:corinthians-teste-modulos
 *   FASES=A,C pnpm --filter @torcida/db seed:corinthians-teste-modulos
 */
import crypto from 'node:crypto'
import { db } from '../src/index.js'
import { nomesPecasPatrimonio } from '../../types/src/patrimonio.js'
import { assertNotProductionSeed } from './lib/seed-env.js'

assertNotProductionSeed('seed:corinthians-teste-modulos')

const DOMINIO_TESTE = 'teste.corinthians.torcida.app'
const MARCA = '[TESTE-CORINTHIANS]'
const SLUG_TESTE = 'teste-corinthians-'
const CUPOM_PREFIXO = 'TESTE'
const MAX_VICE_PRESIDENTES = 2

const TENANT_SLUGS_REAIS = [
  'pde-gavioes-fiel',
  'camisa-12-corinthians',
  'pavilhao-nove',
  'estopim-da-fiel-sp',
  'torcida-fiel-macabra-sp',
  'torcida-organizada-coringao-chopp-sp',
]
/** Torcidas sem catálogo real de loja — recebem catálogo sintético. */
const TENANTS_SEM_LOJA = TENANT_SLUGS_REAIS.filter((s) => s !== 'pde-gavioes-fiel')

const FASES = (process.env.FASES ?? 'A,B,C,D,E,F,G,H')
  .split(',')
  .map((f) => f.trim().toUpperCase())
  .filter(Boolean)

const filtroUserTeste = { email: { endsWith: `@${DOMINIO_TESTE}` } }

// ── Utilitários ──────────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** opcoes: [[valor, peso], ...] */
function pickPonderado(opcoes) {
  const total = opcoes.reduce((s, [, p]) => s + p, 0)
  let r = Math.random() * total
  for (const [valor, peso] of opcoes) {
    if (r < peso) return valor
    r -= peso
  }
  return opcoes[opcoes.length - 1][0]
}

function embaralhar(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function diasAtras(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function diasAFrente(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
}

function dinheiro(n) {
  return Number(Number(n).toFixed(2))
}

async function createManyBatched(model, rows, label, batchSize = 500) {
  let criados = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const lote = rows.slice(i, i + batchSize)
    const res = await db[model].createMany({ data: lote, skipDuplicates: true })
    criados += res.count
  }
  if (rows.length) {
    const marca = criados === rows.length ? '✅' : '⚠️ '
    console.log(`  ${marca} ${label}: ${criados}/${rows.length} inseridos`)
  }
  return criados
}

// ── Contexto ─────────────────────────────────────────────────────────────
async function carregarContexto() {
  const tenants = await db.tenant.findMany({
    where: { slug: { in: TENANT_SLUGS_REAIS } },
    select: { id: true, slug: true, nome: true },
  })
  if (tenants.length !== TENANT_SLUGS_REAIS.length) {
    const achados = new Set(tenants.map((t) => t.slug))
    throw new Error(
      `Tenant(s) não encontrado(s): ${TENANT_SLUGS_REAIS.filter((s) => !achados.has(s)).join(', ')}`,
    )
  }

  const contexto = []
  for (const tenant of tenants) {
    const sedes = await db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      select: { id: true, tipo: true, nome: true, cidade: true, capacidade: true },
      orderBy: { criadoEm: 'asc' },
    })

    // Autor institucional real (mesmo fallback da fase 1): owner → admin →
    // 1º membro aprovado → qualquer usuário com cargo.
    const ownerUserId =
      (
        await db.userRole.findFirst({
          where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
          select: { userId: true },
        })
      )?.userId ??
      (
        await db.userRole.findFirst({
          where: { tenantId: tenant.id, role: { isSystem: true, nome: 'admin' } },
          select: { userId: true },
        })
      )?.userId ??
      (
        await db.saasMembro.findFirst({
          where: { tenantId: tenant.id, status: 'APROVADO' },
          select: { userId: true },
          orderBy: { criadoEm: 'asc' },
        })
      )?.userId ??
      (await db.userRole.findFirst({ where: { tenantId: tenant.id }, select: { userId: true } }))
        ?.userId
    if (!ownerUserId) throw new Error(`Tenant '${tenant.slug}' sem usuário para autoria institucional.`)

    const departamentos = await db.departamento.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, nome: true, slug: true },
      orderBy: { ordem: 'asc' },
    })
    const rolesArea = await db.role.findMany({
      where: { tenantId: tenant.id, departamentoId: { not: null } },
      select: { id: true, departamentoId: true, papelNoDepartamento: true },
    })
    const viceRole = await db.role.findFirst({
      where: { tenantId: tenant.id, isSystem: true, nome: 'vice' },
      select: { id: true },
    })

    // Membros de teste (o universo em que este seed atua).
    const membrosTeste = await db.saasMembro.findMany({
      where: { tenantId: tenant.id, user: filtroUserTeste },
      select: {
        id: true,
        userId: true,
        tipo: true,
        status: true,
        desligadoEm: true,
        espelhado: true,
        membroOrigemId: true,
        departamentoId: true,
        sedeId: true,
        nome: true,
      },
    })

    contexto.push({
      ...tenant,
      sedes,
      sedePrincipal: sedes.find((s) => s.tipo === 'SEDE') ?? sedes[0] ?? null,
      ownerUserId,
      departamentos,
      rolesArea,
      viceRoleId: viceRole?.id ?? null,
      membrosTeste,
      aprovados: membrosTeste.filter(
        (m) =>
          m.tipo === 'SOCIO'
          && m.status === 'APROVADO'
          && m.desligadoEm === null
          && !m.espelhado
          && !m.membroOrigemId,
      ),
    })
  }
  return contexto
}

// ── Fase A: departamentos (preferência → aprovação → equipe) ─────────────
async function fasesDepartamentos(contexto, resumo) {
  for (const tenant of contexto) {
    if (tenant.departamentos.length === 0) {
      console.log(`  ↔  ${tenant.slug}: sem departamentos canônicos — rode seed:departamentos primeiro`)
      continue
    }
    await db.saasMembro.updateMany({
      where: {
        tenantId: tenant.id,
        user: filtroUserTeste,
        tipo: 'TORCEDOR',
        departamentoId: { not: null },
      },
      data: { departamentoId: null },
    })
    const semPreferencia = tenant.membrosTeste.filter(
      (m) => m.tipo === 'SOCIO' && !m.departamentoId,
    )
    const jaTemEquipe = await db.userDepartamento.count({
      where: { tenantId: tenant.id, user: filtroUserTeste },
    })
    if (semPreferencia.length === 0 && jaTemEquipe > 0) {
      console.log(`  ↔  ${tenant.slug}: departamentos já semeados — pulando`)
      continue
    }

    // 1) Preferência de área no cadastro: ~75% escolhem uma área.
    //    Vale para PENDENTE/REPROVADO também — é só preferência, não equipe.
    /** @type {Map<string, string[]>} */
    const preferenciaPorDepto = new Map()
    for (const membro of semPreferencia) {
      if (Math.random() < 0.25) continue // "Sem área"
      const depto = pick(tenant.departamentos)
      const lista = preferenciaPorDepto.get(depto.id) ?? []
      lista.push(membro.id)
      preferenciaPorDepto.set(depto.id, lista)
      membro.departamentoId = depto.id
    }
    let preferencias = 0
    for (const [departamentoId, ids] of preferenciaPorDepto) {
      for (let i = 0; i < ids.length; i += 500) {
        const res = await db.saasMembro.updateMany({
          where: { id: { in: ids.slice(i, i + 500) } },
          data: { departamentoId },
        })
        preferencias += res.count
      }
    }
    resumo.preferenciaDepartamento += preferencias

    // 2) Equipe de fato — só APROVADO, ~55% dos que têm preferência.
    //    Grava o perfil de área (UserRole) + a projeção
    //    (UserDepartamento / DepartamentoGestor), como faz
    //    syncMembershipFromRoles ao aprovar o membro no app.
    const roleMembroPorDepto = new Map(
      tenant.rolesArea.filter((r) => r.papelNoDepartamento === 'MEMBRO').map((r) => [r.departamentoId, r.id]),
    )
    const roleGestorPorDepto = new Map(
      tenant.rolesArea.filter((r) => r.papelNoDepartamento === 'GESTOR').map((r) => [r.departamentoId, r.id]),
    )

    const userRoleRows = []
    const userDeptRows = []
    const gestorRows = []
    /** @type {Set<string>} */ const deptComGestor = new Set()

    for (const membro of embaralhar(tenant.aprovados)) {
      if (!membro.departamentoId) continue
      if (Math.random() > 0.55) continue
      const deptId = membro.departamentoId
      // 1º alocado de cada área vira gestor (delegação de gestão da área).
      const gestor = !deptComGestor.has(deptId)
      const roleId = gestor ? roleGestorPorDepto.get(deptId) : roleMembroPorDepto.get(deptId)
      if (!roleId) continue
      if (gestor) deptComGestor.add(deptId)

      userRoleRows.push({ id: crypto.randomUUID(), userId: membro.userId, tenantId: tenant.id, roleId })
      userDeptRows.push({
        id: crypto.randomUUID(),
        userId: membro.userId,
        tenantId: tenant.id,
        departamentoId: deptId,
      })
      if (gestor) {
        gestorRows.push({ id: crypto.randomUUID(), departamentoId: deptId, userId: membro.userId })
      }
    }

    await createManyBatched('userRole', userRoleRows, `${tenant.slug}: perfis de área (UserRole)`)
    await createManyBatched('userDepartamento', userDeptRows, `${tenant.slug}: equipe (UserDepartamento)`)
    await createManyBatched('departamentoGestor', gestorRows, `${tenant.slug}: gestores de área`)

    resumo.perfisArea += userRoleRows.length
    resumo.equipeDepartamento += userDeptRows.length
    resumo.gestoresDepartamento += gestorRows.length
    console.log(
      `  ✅ ${tenant.slug}: preferência=${preferencias} equipe=${userDeptRows.length} gestores=${gestorRows.length}`,
    )
  }
}

// ── Fase B: cenários de permissão ────────────────────────────────────────
const OVERRIDES_CONCEDIDOS = ['finance:view', 'reports:view', 'patrimony:view', 'store:view_orders']
const OVERRIDES_NEGADOS = ['community:post', 'messages:send', 'events:create']

async function fasePermissoes(contexto, resumo) {
  for (const tenant of contexto) {
    // 1) Vice-presidência — governança admite no máximo 2 por torcida.
    if (tenant.viceRoleId) {
      const vicesAtuais = await db.userRole.count({
        where: { tenantId: tenant.id, roleId: tenant.viceRoleId },
      })
      const vagas = Math.max(0, MAX_VICE_PRESIDENTES - vicesAtuais)
      const candidatos = embaralhar(tenant.aprovados).slice(0, vagas)
      if (vagas === 0) {
        console.log(`  ↔  ${tenant.slug}: vice-presidência já no limite (${vicesAtuais}/${MAX_VICE_PRESIDENTES})`)
      }
      const rows = candidatos.map((m) => ({
        id: crypto.randomUUID(),
        userId: m.userId,
        tenantId: tenant.id,
        roleId: tenant.viceRoleId,
      }))
      await createManyBatched('userRole', rows, `${tenant.slug}: vice-presidentes`)
      resumo.vices += rows.length
    }

    // 2) Overrides individuais — testa precedência sobre o pacote do cargo.
    const jaTemOverride = await db.userPermission.count({
      where: { tenantId: tenant.id, user: filtroUserTeste },
    })
    if (jaTemOverride > 0) {
      console.log(`  ↔  ${tenant.slug}: overrides individuais já semeados — pulando`)
      continue
    }
    const alvos = embaralhar(tenant.aprovados).slice(0, 6)
    const rows = []
    alvos.forEach((m, i) => {
      const conceder = i % 2 === 0
      rows.push({
        id: crypto.randomUUID(),
        userId: m.userId,
        tenantId: tenant.id,
        permission: conceder ? pick(OVERRIDES_CONCEDIDOS) : pick(OVERRIDES_NEGADOS),
        granted: conceder,
      })
    })
    await createManyBatched('userPermission', rows, `${tenant.slug}: overrides individuais`)
    resumo.overridesPermissao += rows.length
  }
}

// ── Fase C: patrimônio ───────────────────────────────────────────────────
const PATRIMONIO_CATALOGO = [
  { nome: 'Surdo de marcação 22"', categoria: 'INSTRUMENTO', qtd: [4, 10], valor: 900 },
  { nome: 'Caixa de guerra', categoria: 'INSTRUMENTO', qtd: [6, 14], valor: 550 },
  { nome: 'Repinique', categoria: 'INSTRUMENTO', qtd: [3, 8], valor: 620 },
  { nome: 'Tamborim', categoria: 'INSTRUMENTO', qtd: [10, 25], valor: 160 },
  { nome: 'Chocalho / ganzá', categoria: 'INSTRUMENTO', qtd: [8, 20], valor: 190 },
  { nome: 'Bandeirão da torcida', categoria: 'BANDEIRA', qtd: [1, 3], valor: 3500 },
  // qtd = número de peças (cada uma vira ficha com foto própria), não lote.
  { nome: 'Bandeira de mastro 2x1,5m', categoria: 'BANDEIRA', qtd: [4, 12], valor: 220 },
  { nome: 'Faixa de arquibancada', categoria: 'BANDEIRA', qtd: [2, 6], valor: 400 },
  { nome: 'Uniforme da bateria', categoria: 'UNIFORME', qtd: [20, 40], valor: 120 },
  { nome: 'Colete de organização', categoria: 'UNIFORME', qtd: [10, 20], valor: 85 },
  { nome: 'Mesa de plástico', categoria: 'MOBILIARIO', qtd: [10, 25], valor: 130 },
  { nome: 'Cadeira de plástico', categoria: 'MOBILIARIO', qtd: [40, 90], valor: 55 },
  { nome: 'Caixa de som ativa', categoria: 'ELETRONICO', qtd: [1, 3], valor: 1800 },
  { nome: 'Freezer horizontal do bar', categoria: 'ELETRONICO', qtd: [1, 2], valor: 2600 },
  { nome: 'Notebook da secretaria', categoria: 'ELETRONICO', qtd: [1, 2], valor: 3200 },
  { nome: 'Barracão de ensaio', categoria: 'ESPACO', qtd: [1, 1], valor: null },
  { nome: 'Depósito de materiais', categoria: 'ESPACO', qtd: [1, 1], valor: null },
  { nome: 'Toldo / tenda 3x3', categoria: 'OUTROS', qtd: [2, 5], valor: 480 },
]

async function fasePatrimonio(contexto, resumo) {
  for (const tenant of contexto) {
    const jaTem = await db.patrimonioItem.count({
      where: { tenantId: tenant.id, observacao: { startsWith: MARCA } },
    })
    if (jaTem > 0) {
      console.log(`  ↔  ${tenant.slug}: patrimônio já semeado (${jaTem} itens) — pulando`)
      continue
    }

    const qtdItens = 10 + Math.floor(Math.random() * 6) // 10–15
    const escolhidos = embaralhar(PATRIMONIO_CATALOGO).slice(0, qtdItens)
    const rows = []
    for (const item of escolhidos) {
      const [min, max] = item.qtd
      const quantidade = min + Math.floor(Math.random() * (max - min + 1))
      const responsavel = tenant.aprovados.length > 0 && Math.random() < 0.6 ? pick(tenant.aprovados) : null
      const pecaUnica = item.categoria === 'BANDEIRA'
      const nomes = pecaUnica ? nomesPecasPatrimonio(item.nome, quantidade) : [item.nome]
      for (const nome of nomes) {
        rows.push({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          nome,
          categoria: item.categoria,
          status: pickPonderado([
            ['DISPONIVEL', 60],
            ['EM_USO', 25],
            ['MANUTENCAO', 10],
            ['BAIXADO', 5],
          ]),
          quantidade: pecaUnica ? 1 : quantidade,
          localizacao: pick(['Sede — depósito', 'Sede — salão', 'Barracão', 'Com o responsável', null]),
          valorEstimado: item.valor,
          observacao: `${MARCA} inventário sintético para teste de volume.`,
          responsavelId: responsavel?.userId ?? null,
          criadoPorId: tenant.ownerUserId,
        })
      }
    }

    await createManyBatched('patrimonioItem', rows, `${tenant.slug}: patrimônio`)
    resumo.patrimonio += rows.length
  }
}

// ── Fase D: financeiro (livro-caixa) ─────────────────────────────────────
const FINANCEIRO_TEMPLATES = [
  { tipo: 'RECEITA', categoria: 'MENSALIDADE', descricao: 'Mensalidades de sócios', faixa: [1800, 9000], peso: 20 },
  { tipo: 'RECEITA', categoria: 'DOACAO', descricao: 'Doação de associados', faixa: [100, 1200], peso: 8 },
  { tipo: 'RECEITA', categoria: 'EVENTO', descricao: 'Bilheteria de evento da torcida', faixa: [400, 4500], peso: 8 },
  { tipo: 'RECEITA', categoria: 'CARAVANA', descricao: 'Vagas de caravana', faixa: [600, 6000], peso: 8 },
  { tipo: 'RECEITA', categoria: 'OUTROS', descricao: 'Rifa da torcida', faixa: [200, 1500], peso: 4 },
  { tipo: 'DESPESA', categoria: 'OUTROS', descricao: 'Aluguel da sede', faixa: [1500, 4500], peso: 10 },
  { tipo: 'DESPESA', categoria: 'OUTROS', descricao: 'Energia elétrica', faixa: [300, 1400], peso: 8 },
  { tipo: 'DESPESA', categoria: 'OUTROS', descricao: 'Internet e telefonia', faixa: [120, 400], peso: 6 },
  { tipo: 'DESPESA', categoria: 'PATRIMONIO', descricao: 'Manutenção de instrumentos', faixa: [200, 2200], peso: 8 },
  { tipo: 'DESPESA', categoria: 'CARAVANA', descricao: 'Fretamento de ônibus', faixa: [1200, 7000], peso: 8 },
  { tipo: 'DESPESA', categoria: 'EVENTO', descricao: 'Locação de som e estrutura', faixa: [400, 3000], peso: 6 },
  { tipo: 'DESPESA', categoria: 'LOJA', descricao: 'Compra de material para a loja', faixa: [800, 5000], peso: 6 },
]

async function faseFinanceiro(contexto, resumo) {
  for (const tenant of contexto) {
    const jaTem = await db.financeiroLancamento.count({
      where: { tenantId: tenant.id, observacao: { startsWith: MARCA } },
    })
    if (jaTem > 0) {
      console.log(`  ↔  ${tenant.slug}: financeiro já semeado (${jaTem} lançamentos) — pulando`)
      continue
    }

    const rows = []
    // 6 meses de movimento — 5 a 10 lançamentos por mês.
    for (let mes = 0; mes < 6; mes++) {
      const qtd = 5 + Math.floor(Math.random() * 6)
      for (let i = 0; i < qtd; i++) {
        const t = pickPonderado(FINANCEIRO_TEMPLATES.map((x) => [x, x.peso]))
        const [min, max] = t.faixa
        rows.push({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          tipo: t.tipo,
          categoria: t.categoria,
          valor: dinheiro(min + Math.random() * (max - min)),
          descricao: t.descricao,
          data: diasAtras(mes * 30 + Math.floor(Math.random() * 28)),
          observacao: `${MARCA} lançamento sintético para teste de volume.`,
          criadoPorId: tenant.ownerUserId,
        })
      }
    }
    await createManyBatched('financeiroLancamento', rows, `${tenant.slug}: livro-caixa`)
    resumo.financeiro += rows.length
  }
}

// ── Fase E: loja nas torcidas sem catálogo ───────────────────────────────
const LOJA_CATEGORIAS = [
  { slug: 'masculino', nome: 'Masculino', ordem: 1 },
  { slug: 'feminino', nome: 'Feminino', ordem: 2 },
  { slug: 'infantil', nome: 'Infantil', ordem: 3 },
  { slug: 'acessorios', nome: 'Acessórios', ordem: 4 },
]
const TAM_ROUPA = ['P', 'M', 'G', 'GG']
const LOJA_PRODUTOS = [
  { slug: 'camisa-oficial-escudo', nome: 'Camisa oficial escudo', preco: 129.9, categoria: 'masculino', tamanhos: TAM_ROUPA, destaque: true },
  { slug: 'camiseta-retro', nome: 'Camiseta retrô', preco: 149.9, precoOriginal: 189.9, categoria: 'masculino', tamanhos: TAM_ROUPA, destaque: true },
  { slug: 'regata-torcida', nome: 'Regata da torcida', preco: 89.9, categoria: 'masculino', tamanhos: TAM_ROUPA },
  { slug: 'moletom-canguru', nome: 'Moletom canguru', preco: 219.9, categoria: 'masculino', tamanhos: TAM_ROUPA },
  { slug: 'bermuda-tactel', nome: 'Bermuda tactel', preco: 99.9, categoria: 'masculino', tamanhos: TAM_ROUPA },
  { slug: 'baby-look-escudo', nome: 'Baby look escudo', preco: 109.9, categoria: 'feminino', tamanhos: TAM_ROUPA },
  { slug: 'cropped-bordado', nome: 'Cropped bordado', preco: 99.9, categoria: 'feminino', tamanhos: TAM_ROUPA },
  { slug: 'blusa-feminina-manga-longa', nome: 'Blusa feminina manga longa', preco: 139.9, categoria: 'feminino', tamanhos: TAM_ROUPA },
  { slug: 'camisa-infantil', nome: 'Camisa infantil', preco: 89.9, categoria: 'infantil', tamanhos: ['2', '4', '6', '8'] },
  { slug: 'conjunto-infantil', nome: 'Conjunto infantil', preco: 119.9, categoria: 'infantil', tamanhos: ['2', '4', '6', '8'] },
  { slug: 'bone-aba-curva', nome: 'Boné aba curva', preco: 79.9, categoria: 'acessorios', tamanhos: ['UN'] },
  { slug: 'bandeira-2x15', nome: 'Bandeira 2x1,5m', preco: 99.9, categoria: 'acessorios', tamanhos: ['UN'], destaque: true },
  { slug: 'caneca-esmaltada', nome: 'Caneca esmaltada', preco: 39.9, categoria: 'acessorios', tamanhos: ['UN'] },
  { slug: 'chaveiro-escudo', nome: 'Chaveiro escudo', preco: 19.9, categoria: 'acessorios', tamanhos: ['UN'] },
  { slug: 'mochila-torcida', nome: 'Mochila da torcida', preco: 179.9, categoria: 'acessorios', tamanhos: ['UN'] },
]

function estoqueFake(tamanhos) {
  return Object.fromEntries(tamanhos.map((t, i) => [t, 6 + ((i * 3) % 9)]))
}

async function faseLoja(contexto, resumo) {
  for (const tenant of contexto) {
    const criarCatalogo = TENANTS_SEM_LOJA.includes(tenant.slug)

    if (criarCatalogo) {
      const jaTem = await db.saasProduto.count({
        where: { tenantId: tenant.id, slug: { startsWith: SLUG_TESTE } },
      })
      if (jaTem > 0) {
        console.log(`  ↔  ${tenant.slug}: catálogo de teste já existe (${jaTem} produtos)`)
      } else {
        const catRows = LOJA_CATEGORIAS.map((c) => ({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          nome: c.nome,
          slug: `${SLUG_TESTE}${c.slug}`,
          ordem: c.ordem,
        }))
        await createManyBatched('saasCategoria', catRows, `${tenant.slug}: categorias da loja`)
        resumo.lojaCategorias += catRows.length
        const catPorSlug = new Map(catRows.map((c) => [c.slug.replace(SLUG_TESTE, ''), c.id]))

        const prodRows = LOJA_PRODUTOS.map((p, i) => ({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          nome: p.nome,
          slug: `${SLUG_TESTE}${p.slug}`,
          descricao: `${p.nome} — produto oficial da ${tenant.nome}.`,
          preco: p.preco,
          precoOriginal: p.precoOriginal ?? null,
          ativo: true,
          destaque: Boolean(p.destaque),
          ordem: i + 1,
          estoque: estoqueFake(p.tamanhos),
          tamanhos: p.tamanhos,
          imagensUrl: [],
          categoriaId: catPorSlug.get(p.categoria) ?? null,
        }))
        await createManyBatched('saasProduto', prodRows, `${tenant.slug}: produtos da loja`)
        resumo.lojaProdutos += prodRows.length

        await db.saasCupom.upsert({
          where: { tenantId_codigo: { tenantId: tenant.id, codigo: `${CUPOM_PREFIXO}10` } },
          update: {},
          create: {
            tenantId: tenant.id,
            codigo: `${CUPOM_PREFIXO}10`,
            tipo: 'PERCENTUAL',
            valor: 10,
            ativo: true,
            validoAte: diasAFrente(90),
          },
        })
        resumo.lojaCupons += 1
      }
    }

    // Pedidos — em toda torcida com catálogo ativo (inclui o Gaviões real).
    const produtos = await db.saasProduto.findMany({
      where: { tenantId: tenant.id, ativo: true },
      select: { id: true, nome: true, preco: true, tamanhos: true },
    })
    if (produtos.length === 0 || tenant.aprovados.length === 0) continue

    const pedidosExistentes = await db.saasPedido.count({
      where: { tenantId: tenant.id, user: filtroUserTeste },
    })
    if (pedidosExistentes >= 20) {
      console.log(`  ↔  ${tenant.slug}: já tem ${pedidosExistentes} pedidos de teste — pulando`)
    } else {
      const compradores = embaralhar(tenant.aprovados).slice(0, 12 + Math.floor(Math.random() * 9))
      let criados = 0
      for (const membro of compradores) {
        // Carrinho multi-item (1–3 produtos distintos).
        const itens = embaralhar(produtos)
          .slice(0, 1 + Math.floor(Math.random() * 3))
          .map((produto) => {
            const quantidade = 1 + Math.floor(Math.random() * 2)
            const precoUnit = Number(produto.preco.toString())
            return {
              produtoId: produto.id,
              produtoNome: produto.nome,
              tamanho: produto.tamanhos.length > 0 ? pick(produto.tamanhos) : 'UN',
              quantidade,
              precoUnit,
              total: dinheiro(precoUnit * quantidade),
            }
          })
        const subtotal = dinheiro(itens.reduce((s, i) => s + i.total, 0))
        const usaCupom = criarCatalogo && Math.random() < 0.25
        const desconto = usaCupom ? dinheiro(subtotal * 0.1) : 0
        const total = dinheiro(subtotal - desconto)
        const status = pickPonderado([
          ['ENTREGUE', 45],
          ['CONFIRMADO', 30],
          ['PENDENTE', 15],
          ['CANCELADO', 10],
        ])

        await db.saasPedido.create({
          data: {
            tenantId: tenant.id,
            userId: membro.userId,
            subtotal,
            desconto,
            total,
            status,
            cupomCodigo: usaCupom ? `${CUPOM_PREFIXO}10` : null,
            modalidadeEntrega: pickPonderado([['RETIRADA', 80], ['ENVIO', 20]]),
            criadoEm: diasAtras(Math.floor(Math.random() * 120)),
            itens: { create: itens },
          },
          select: { id: true },
        })
        criados += 1
      }
      resumo.lojaPedidos += criados
      console.log(`  ✅ ${tenant.slug}: ${criados} pedidos de loja`)
    }

    // Receita no livro-caixa para pedidos pagos que ainda não têm lançamento.
    const pagos = await db.saasPedido.findMany({
      where: {
        tenantId: tenant.id,
        user: filtroUserTeste,
        status: { in: ['CONFIRMADO', 'ENTREGUE'] },
        financeiroLancamentoId: null,
      },
      select: { id: true, total: true, criadoEm: true },
    })
    for (const pedido of pagos) {
      const lanc = await db.financeiroLancamento.create({
        data: {
          tenantId: tenant.id,
          tipo: 'RECEITA',
          categoria: 'LOJA',
          valor: pedido.total,
          descricao: 'Venda da loja',
          data: pedido.criadoEm,
          observacao: `${MARCA} receita de pedido sintético.`,
          criadoPorId: tenant.ownerUserId,
        },
        select: { id: true },
      })
      await db.saasPedido.update({
        where: { id: pedido.id },
        data: { financeiroLancamentoId: lanc.id },
      })
      resumo.financeiro += 1
    }
    if (pagos.length > 0) console.log(`  ✅ ${tenant.slug}: ${pagos.length} receitas LOJA no livro-caixa`)
  }
}

// ── Fase F: bar (PDV) ────────────────────────────────────────────────────
const BAR_CATEGORIAS = [
  { slug: 'cervejas', nome: 'Cervejas', ordem: 1 },
  { slug: 'destilados', nome: 'Destilados e drinks', ordem: 2 },
  { slug: 'sem-alcool', nome: 'Sem álcool', ordem: 3 },
  { slug: 'porcoes', nome: 'Porções', ordem: 4 },
]
const BAR_PRODUTOS = [
  { nome: 'Cerveja lata 350ml', preco: 8, custo: 4.8, categoria: 'cervejas', estoque: 240 },
  { nome: 'Cerveja long neck', preco: 12, custo: 7.2, categoria: 'cervejas', estoque: 120 },
  { nome: 'Cerveja 600ml', preco: 18, custo: 11, categoria: 'cervejas', estoque: 80 },
  { nome: 'Dose de cachaça', preco: 8, custo: 3, categoria: 'destilados', estoque: 60 },
  { nome: 'Caipirinha', preco: 18, custo: 6.5, categoria: 'destilados', estoque: 50 },
  { nome: 'Dose de whisky', preco: 20, custo: 11, categoria: 'destilados', estoque: 40 },
  { nome: 'Refrigerante lata', preco: 6, custo: 3.2, categoria: 'sem-alcool', estoque: 150 },
  { nome: 'Água mineral 500ml', preco: 4, custo: 1.5, categoria: 'sem-alcool', estoque: 200 },
  { nome: 'Energético', preco: 14, custo: 8, categoria: 'sem-alcool', estoque: 60 },
  { nome: 'Porção de frango a passarinho', preco: 45, custo: 22, categoria: 'porcoes', estoque: 30 },
  { nome: 'Batata frita', preco: 30, custo: 13, categoria: 'porcoes', estoque: 40 },
  { nome: 'Pastel de carne', preco: 10, custo: 4.5, categoria: 'porcoes', estoque: 70 },
]

async function faseBar(contexto, resumo) {
  for (const tenant of contexto) {
    // Unidades com bar: a sede principal + até 2 unidades filhas.
    const unidadesFilhas = tenant.sedes.filter((s) => s.id !== tenant.sedePrincipal?.id)
    const unidadesBar = [tenant.sedePrincipal, ...embaralhar(unidadesFilhas).slice(0, 2)].filter(Boolean)
    if (unidadesBar.length === 0) continue

    for (const unidade of unidadesBar) {
      // 1) Catálogo — reaproveita o real quando já existe (Gaviões).
      let produtos = await db.barProduto.findMany({
        where: { tenantId: tenant.id, sedeId: unidade.id, ativo: true },
        select: { id: true, nome: true, preco: true, custoMedio: true, estoque: true },
      })
      if (produtos.length === 0) {
        const catRows = BAR_CATEGORIAS.map((c) => ({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          sedeId: unidade.id,
          nome: c.nome,
          slug: `${SLUG_TESTE}${c.slug}`,
          ordem: c.ordem,
        }))
        await createManyBatched('barCategoria', catRows, `${tenant.slug}/${unidade.nome}: categorias do bar`)
        resumo.barCategorias += catRows.length
        const catPorSlug = new Map(catRows.map((c) => [c.slug.replace(SLUG_TESTE, ''), c.id]))

        const prodRows = BAR_PRODUTOS.map((p, i) => ({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          sedeId: unidade.id,
          categoriaId: catPorSlug.get(p.categoria) ?? null,
          nome: p.nome,
          preco: p.preco,
          custoMedio: p.custo,
          estoque: p.estoque,
          estoqueMinimo: Math.max(6, Math.round(p.estoque * 0.1)),
          ativo: true,
          destaque: i < 3,
          ordem: i + 1,
          criadoPorId: tenant.ownerUserId,
        }))
        await createManyBatched('barProduto', prodRows, `${tenant.slug}/${unidade.nome}: produtos do bar`)
        resumo.barProdutos += prodRows.length

        // Entrada de estoque inicial (compra de insumo → despesa BAR).
        const custoTotalCompra = dinheiro(
          BAR_PRODUTOS.reduce((s, p) => s + p.custo * p.estoque, 0),
        )
        const lancCompra = await db.financeiroLancamento.create({
          data: {
            tenantId: tenant.id,
            tipo: 'DESPESA',
            categoria: 'BAR',
            valor: custoTotalCompra,
            descricao: `Compra de insumos do bar — ${unidade.nome}`,
            data: diasAtras(45),
            observacao: `${MARCA} entrada de estoque sintética.`,
            criadoPorId: tenant.ownerUserId,
          },
          select: { id: true },
        })
        resumo.financeiro += 1

        const movEntrada = prodRows.map((p, i) => ({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          sedeId: unidade.id,
          produtoId: p.id,
          tipo: 'ENTRADA',
          quantidade: BAR_PRODUTOS[i].estoque,
          custoTotal: dinheiro(BAR_PRODUTOS[i].custo * BAR_PRODUTOS[i].estoque),
          motivo: `${MARCA} carga inicial de estoque`,
          financeiroLancamentoId: lancCompra.id,
          operadorId: tenant.ownerUserId,
          criadoEm: diasAtras(45),
        }))
        await createManyBatched('barMovimentacaoEstoque', movEntrada, `${tenant.slug}/${unidade.nome}: entradas de estoque`)
        resumo.barMovimentacoes += movEntrada.length

        produtos = prodRows.map((p) => ({
          id: p.id,
          nome: p.nome,
          preco: p.preco,
          custoMedio: p.custoMedio,
          estoque: p.estoque,
        }))
      }

      // 2) Vendas — turno fechado (histórico) + turno aberto (operação).
      const jaTemVenda = await db.barVenda.count({
        where: { tenantId: tenant.id, sedeId: unidade.id, observacao: { startsWith: MARCA } },
      })
      if (jaTemVenda > 0) {
        console.log(`  ↔  ${tenant.slug}/${unidade.nome}: bar já tem vendas de teste (${jaTemVenda}) — pulando`)
        continue
      }
      const operadores = embaralhar(tenant.aprovados).slice(0, 3)
      if (operadores.length === 0) continue

      // Estoque em memória — a Server Action do PDV recusa venda com
      // `produto.estoque < quantidade`; sem espelhar isso aqui o seed
      // gera estoque negativo, estado que o app nunca produziria.
      const estoquePorProduto = new Map(produtos.map((p) => [p.id, Number(p.estoque ?? 0)]))

      // Regra do módulo: no máximo um turno ABERTO por unidade. Se a unidade
      // já tem um (inclusive de dado real), o seed não abre outro.
      const jaTemTurnoAberto = await db.barCaixaTurno.count({
        where: { tenantId: tenant.id, sedeId: unidade.id, fechadoEm: null },
      })
      const turnos = [
        { abertoEm: diasAtras(7), fechar: true },
        { abertoEm: diasAtras(2), fechar: true },
        ...(jaTemTurnoAberto > 0 ? [] : [{ abertoEm: diasAtras(0), fechar: false }]),
      ]
      if (jaTemTurnoAberto > 0) {
        console.log(`  ·  ${tenant.slug}/${unidade.nome}: já há turno de caixa aberto — só turnos fechados`)
      }

      for (const spec of turnos) {
        const turno = await db.barCaixaTurno.create({
          data: {
            tenantId: tenant.id,
            sedeId: unidade.id,
            abertoEm: spec.abertoEm,
            abertoPorId: tenant.ownerUserId,
            observacao: `${MARCA} turno sintético de caixa.`,
          },
          select: { id: true },
        })
        resumo.barTurnos += 1

        const qtdVendas = spec.fechar ? 12 + Math.floor(Math.random() * 13) : 3 + Math.floor(Math.random() * 5)
        let dinheiroEsperado = 0

        for (let v = 0; v < qtdVendas; v++) {
          const itensVenda = embaralhar(produtos)
            .slice(0, 1 + Math.floor(Math.random() * 3))
            .map((produto) => {
              const disponivel = estoquePorProduto.get(produto.id) ?? 0
              // Nunca vender mais do que há em estoque (espelha a validação
              // "Estoque insuficiente" do PDV).
              const quantidade = Math.min(1 + Math.floor(Math.random() * 4), disponivel)
              if (quantidade <= 0) return null
              const precoUnit = Number(produto.preco.toString())
              const custoUnit = Number((produto.custoMedio ?? 0).toString())
              return {
                produtoId: produto.id,
                produtoNome: produto.nome,
                quantidade,
                precoUnit,
                custoUnit,
                total: dinheiro(precoUnit * quantidade),
              }
            })
            .filter(Boolean)
          if (itensVenda.length === 0) continue // unidade sem estoque
          const subtotal = dinheiro(itensVenda.reduce((s, i) => s + i.total, 0))
          const desconto = Math.random() < 0.1 ? dinheiro(Math.min(5, subtotal * 0.1)) : 0
          const total = dinheiro(subtotal - desconto)
          const metodo = pickPonderado([
            ['PIX', 40],
            ['DINHEIRO', 25],
            ['CARTAO_DEBITO', 15],
            ['CARTAO_CREDITO', 12],
            ['FIADO', 8],
          ])
          // Regra do PDV (`registrarVenda`): `pago = metodo !== 'PIX'` — ou
          // seja, FIADO nasce **PAGA** (baixa estoque, conta no turno), com a
          // receita entrando no livro-caixa só na quitação. Só PIX fica
          // PENDENTE esperando o gateway.
          const status =
            metodo === 'FIADO'
              ? 'PAGA'
              : pickPonderado([
                  ['PAGA', 88],
                  ['CANCELADA', 6],
                  ['ESTORNADA', 6],
                ])
          const criadoEm = new Date(spec.abertoEm.getTime() + v * 7 * 60 * 1000)
          const operador = pick(operadores)
          const paga = status === 'PAGA'
          const geraReceitaNaVenda = paga && metodo !== 'FIADO'

          /** @type {string | null} */ let financeiroLancamentoId = null
          if (geraReceitaNaVenda) {
            const lanc = await db.financeiroLancamento.create({
              data: {
                tenantId: tenant.id,
                tipo: 'RECEITA',
                categoria: 'BAR',
                valor: total,
                descricao: `Venda no bar — ${unidade.nome}`,
                data: criadoEm,
                observacao: `${MARCA} receita de venda sintética do bar.`,
                criadoPorId: tenant.ownerUserId,
              },
              select: { id: true },
            })
            financeiroLancamentoId = lanc.id
            resumo.financeiro += 1
            if (metodo === 'DINHEIRO') dinheiroEsperado += total
          }

          /** @type {string | null} */ let estornoLancamentoId = null
          if (status === 'ESTORNADA') {
            const lanc = await db.financeiroLancamento.create({
              data: {
                tenantId: tenant.id,
                tipo: 'DESPESA',
                categoria: 'BAR',
                valor: total,
                descricao: `Estorno de venda no bar — ${unidade.nome}`,
                data: criadoEm,
                observacao: `${MARCA} estorno de venda sintética do bar.`,
                criadoPorId: tenant.ownerUserId,
              },
              select: { id: true },
            })
            estornoLancamentoId = lanc.id
            resumo.financeiro += 1
          }

          const venda = await db.barVenda.create({
            data: {
              tenantId: tenant.id,
              sedeId: unidade.id,
              turnoId: turno.id,
              operadorId: operador.userId,
              subtotal,
              desconto,
              total,
              metodoPagamento: metodo,
              status,
              pagoEm: paga ? criadoEm : null,
              financeiroLancamentoId,
              financeiroEstornoLancamentoId: estornoLancamentoId,
              estornadoPorId: status === 'ESTORNADA' ? tenant.ownerUserId : null,
              estornadoEm: status === 'ESTORNADA' ? new Date(criadoEm.getTime() + 3600_000) : null,
              motivoEstorno: status === 'ESTORNADA' ? 'Cobrança duplicada no PDV' : null,
              observacao: `${MARCA} venda sintética do bar.`,
              criadoEm,
              itens: { create: itensVenda },
            },
            select: { id: true },
          })
          resumo.barVendas += 1

          // Fiado: débito aberto do membro (alguns já quitados).
          if (metodo === 'FIADO') {
            const quitado = Math.random() < 0.35
            let lancFiadoId = null
            if (quitado) {
              const lanc = await db.financeiroLancamento.create({
                data: {
                  tenantId: tenant.id,
                  tipo: 'RECEITA',
                  categoria: 'BAR',
                  valor: total,
                  descricao: `Quitação de fiado do bar — ${unidade.nome}`,
                  data: new Date(criadoEm.getTime() + 3 * 86400_000),
                  observacao: `${MARCA} quitação de fiado sintético.`,
                  criadoPorId: tenant.ownerUserId,
                },
                select: { id: true },
              })
              lancFiadoId = lanc.id
              resumo.financeiro += 1
              // `quitarFiado` liga o MESMO lançamento à venda — sem isso a
              // venda quitada fica sem receita no livro-caixa.
              await db.barVenda.update({
                where: { id: venda.id },
                data: { financeiroLancamentoId: lancFiadoId },
              })
            }
            const devedor = pick(tenant.aprovados)
            await db.barFiado.create({
              data: {
                tenantId: tenant.id,
                sedeId: unidade.id,
                vendaId: venda.id,
                userId: devedor.userId,
                membroId: devedor.id,
                valor: total,
                vencimento: new Date(criadoEm.getTime() + 15 * 86400_000),
                status: quitado ? 'PAGA' : 'PENDENTE',
                pagoEm: quitado ? new Date(criadoEm.getTime() + 3 * 86400_000) : null,
                metodoPagamentoQuitacao: quitado ? pick(['PIX', 'DINHEIRO']) : null,
                financeiroLancamentoId: lancFiadoId,
                criadoPorId: operador.userId,
              },
            })
            resumo.barFiados += 1
          }

          // Baixa de estoque das vendas efetivadas (FIADO já é PAGA).
          if (paga) {
            const movRows = itensVenda.map((item) => ({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              sedeId: unidade.id,
              produtoId: item.produtoId,
              tipo: 'SAIDA',
              quantidade: item.quantidade,
              motivo: `${MARCA} baixa por venda no PDV`,
              vendaId: venda.id,
              operadorId: operador.userId,
              criadoEm,
            }))
            await db.barMovimentacaoEstoque.createMany({ data: movRows, skipDuplicates: true })
            resumo.barMovimentacoes += movRows.length
            for (const item of itensVenda) {
              await db.barProduto.update({
                where: { id: item.produtoId },
                data: { estoque: { decrement: item.quantidade } },
              })
              estoquePorProduto.set(
                item.produtoId,
                (estoquePorProduto.get(item.produtoId) ?? 0) - item.quantidade,
              )
            }
          }
        }

        if (spec.fechar) {
          // Fechamento com pequena divergência de caixa em parte dos turnos.
          const sangria = dinheiro(Math.min(dinheiroEsperado, 50 + Math.random() * 150))
          const diferencaBruta = Math.random() < 0.3 ? dinheiro((Math.random() - 0.5) * 60) : 0
          const esperado = dinheiro(dinheiroEsperado - sangria)
          const contado = dinheiro(esperado + diferencaBruta)
          await db.barCaixaTurno.update({
            where: { id: turno.id },
            data: {
              fechadoEm: new Date(spec.abertoEm.getTime() + 6 * 3600_000),
              fechadoPorId: tenant.ownerUserId,
              sangria,
              dinheiroContado: contado,
              dinheiroEsperado: esperado,
              diferenca: dinheiro(contado - esperado),
              divergenciaAlta: Math.abs(contado - esperado) > 20,
            },
          })
        }
      }
      console.log(`  ✅ ${tenant.slug}/${unidade.nome}: bar semeado`)
    }
  }
}

// ── Fase G: caravanas e bateria ──────────────────────────────────────────
const CARAVANA_DESTINOS = [
  'Rio de Janeiro/RJ — Maracanã',
  'Belo Horizonte/MG — Mineirão',
  'Curitiba/PR — Arena da Baixada',
  'Porto Alegre/RS — Beira-Rio',
  'Salvador/BA — Fonte Nova',
  'Campinas/SP — Brinco de Ouro',
]

async function faseCaravanasBateria(contexto, resumo) {
  for (const tenant of contexto) {
    const jaTem = await db.evento.count({
      where: {
        tenantId: tenant.id,
        tipo: { in: ['CARAVANA', 'ENSAIO'] },
        titulo: { startsWith: MARCA },
        valorVaga: { not: null },
      },
    })
    if (jaTem > 0) {
      console.log(`  ↔  ${tenant.slug}: caravanas/ensaios já semeados — pulando`)
      continue
    }
    const userIds = tenant.aprovados.map((m) => m.userId)
    if (userIds.length === 0) continue

    // 1) Caravanas — vaga paga + capacidade + lista de espera.
    for (let i = 0; i < 2; i++) {
      const capacidade = 20 + Math.floor(Math.random() * 25)
      const valorVaga = pick([60, 80, 120, 150])
      const evento = await db.evento.create({
        data: {
          tenantId: tenant.id,
          tipo: 'CARAVANA',
          titulo: `${MARCA} Caravana — ${pick(CARAVANA_DESTINOS)}`,
          descricao: 'Saída da sede 6h. Vaga paga, com lista de espera quando lotar.',
          data: diasAFrente(7 + i * 21),
          local: 'Concentração na sede',
          sedeId: tenant.sedePrincipal?.id ?? null,
          valorVaga,
          capacidade,
          criadoPorId: tenant.ownerUserId,
        },
        select: { id: true },
      })
      resumo.caravanas += 1

      // Mais inscritos que vagas: excedente vai para LISTA_ESPERA.
      const interessados = embaralhar(userIds).slice(0, Math.round(capacidade * 1.3))
      const rsvpRows = interessados.map((userId, idx) => ({
        id: crypto.randomUUID(),
        eventoId: evento.id,
        userId,
        status: idx < capacidade ? 'CONFIRMADO' : 'LISTA_ESPERA',
        criadoEm: diasAtras(5 - Math.min(4, Math.floor(idx / 10))),
      }))
      await createManyBatched('eventoRsvp', rsvpRows, `${tenant.slug}: RSVPs da caravana`)
      resumo.rsvps += rsvpRows.length

      // Receita das vagas confirmadas no livro-caixa.
      const confirmados = rsvpRows.filter((r) => r.status === 'CONFIRMADO').length
      await db.financeiroLancamento.create({
        data: {
          tenantId: tenant.id,
          tipo: 'RECEITA',
          categoria: 'CARAVANA',
          valor: dinheiro(confirmados * valorVaga),
          descricao: 'Vagas confirmadas de caravana',
          data: diasAtras(1),
          observacao: `${MARCA} receita de caravana sintética.`,
          criadoPorId: tenant.ownerUserId,
        },
      })
      resumo.financeiro += 1
    }

    // 2) Bateria — série de ensaios semanais (mesmo serieId), com check-in
    //    nos que já aconteceram.
    const serieId = crypto.randomUUID()
    for (let semana = -3; semana <= 4; semana++) {
      const data = diasAFrente(semana * 7)
      const passado = semana < 0
      const evento = await db.evento.create({
        data: {
          tenantId: tenant.id,
          tipo: 'ENSAIO',
          titulo: `${MARCA} Ensaio da bateria — semana ${semana + 4}`,
          descricao: 'Ensaio semanal da bateria no barracão. Instrumentos disponíveis na sede.',
          data,
          local: 'Barracão da bateria',
          sedeId: tenant.sedePrincipal?.id ?? null,
          capacidade: 60,
          serieId,
          criadoPorId: tenant.ownerUserId,
        },
        select: { id: true },
      })
      resumo.ensaios += 1

      const presentes = embaralhar(userIds).slice(0, 15 + Math.floor(Math.random() * 20))
      const rsvpRows = presentes.map((userId) => ({
        id: crypto.randomUUID(),
        eventoId: evento.id,
        userId,
        status: 'CONFIRMADO',
        // Confirmar ≠ comparecer: só parte dos confirmados tem check-in.
        checkedInAt: passado && Math.random() < 0.7 ? data : null,
        checkedInPorId: passado && Math.random() < 0.7 ? tenant.ownerUserId : null,
      }))
      await createManyBatched('eventoRsvp', rsvpRows, `${tenant.slug}: RSVPs do ensaio`)
      resumo.rsvps += rsvpRows.length
    }
    console.log(`  ✅ ${tenant.slug}: 2 caravanas + 8 ensaios (série semanal)`)
  }
}

// ── Fase H: moderação (fila de denúncias) ────────────────────────────────
const MOTIVOS_DENUNCIA = [
  'Discurso de ódio contra torcida rival',
  'Conteúdo violento',
  'Spam de divulgação externa',
  'Informação falsa sobre a diretoria',
  'Ofensa pessoal a outro associado',
  'Publicação fora do assunto do canal',
]

async function faseModeracao(contexto, resumo) {
  for (const tenant of contexto) {
    const jaTem = await db.denuncia.count({
      where: { tenantId: tenant.id, denunciante: filtroUserTeste },
    })
    if (jaTem >= 3) {
      console.log(`  ↔  ${tenant.slug}: fila de moderação já semeada (${jaTem}) — pulando`)
      continue
    }
    const posts = await db.post.findMany({
      where: { tenantId: tenant.id, autor: filtroUserTeste },
      select: { id: true },
      take: 200,
    })
    const denunciantes = tenant.aprovados
    if (posts.length === 0 || denunciantes.length === 0) continue

    const alvos = embaralhar(posts).slice(0, 4 + Math.floor(Math.random() * 5)) // 4–8
    const rows = alvos.map((post) => {
      const status = pickPonderado([
        ['PENDENTE', 60],
        ['RESOLVIDA', 25],
        ['DESCARTADA', 15],
      ])
      const resolvida = status !== 'PENDENTE'
      return {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        postId: post.id,
        denuncianteId: pick(denunciantes).userId,
        motivo: pick(MOTIVOS_DENUNCIA),
        status,
        resolvidoPorId: resolvida ? tenant.ownerUserId : null,
        resolvidoEm: resolvida ? diasAtras(Math.floor(Math.random() * 10)) : null,
        criadoEm: diasAtras(Math.floor(Math.random() * 20)),
      }
    })
    await createManyBatched('denuncia', rows, `${tenant.slug}: denúncias`)
    resumo.denuncias += rows.length
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seed de teste — Corinthians · FASE 2 (módulos operacionais)\n')
  console.log(`Fases selecionadas: ${FASES.join(', ')}\n`)

  const contexto = await carregarContexto()
  const totalMembros = contexto.reduce((s, t) => s + t.membrosTeste.length, 0)
  if (totalMembros === 0) {
    throw new Error(
      'Nenhum membro de teste encontrado. Rode `pnpm --filter @torcida/db seed:corinthians-teste` primeiro.',
    )
  }
  console.log(`${contexto.length} torcidas · ${totalMembros} membros de teste no universo\n`)

  const resumo = {
    preferenciaDepartamento: 0,
    equipeDepartamento: 0,
    gestoresDepartamento: 0,
    perfisArea: 0,
    vices: 0,
    overridesPermissao: 0,
    patrimonio: 0,
    financeiro: 0,
    lojaCategorias: 0,
    lojaProdutos: 0,
    lojaCupons: 0,
    lojaPedidos: 0,
    barCategorias: 0,
    barProdutos: 0,
    barTurnos: 0,
    barVendas: 0,
    barFiados: 0,
    barMovimentacoes: 0,
    caravanas: 0,
    ensaios: 0,
    rsvps: 0,
    denuncias: 0,
  }

  const fases = [
    ['A', 'departamentos (preferência → equipe → gestores)', () => fasesDepartamentos(contexto, resumo)],
    ['B', 'cenários de permissão (vice, overrides)', () => fasePermissoes(contexto, resumo)],
    ['C', 'patrimônio (inventário)', () => fasePatrimonio(contexto, resumo)],
    ['D', 'financeiro (livro-caixa)', () => faseFinanceiro(contexto, resumo)],
    ['E', 'loja (catálogo nas 5 torcidas + pedidos)', () => faseLoja(contexto, resumo)],
    ['F', 'bar / PDV (catálogo, turnos, vendas, fiado)', () => faseBar(contexto, resumo)],
    ['G', 'caravanas e bateria', () => faseCaravanasBateria(contexto, resumo)],
    ['H', 'moderação (denúncias)', () => faseModeracao(contexto, resumo)],
  ]

  for (const [letra, titulo, fn] of fases) {
    if (!FASES.includes(letra)) continue
    console.log(`\n── Fase ${letra}: ${titulo} ──`)
    await fn()
  }

  console.log('\n🎉 Fase 2 concluída!\n')
  console.log('📊 Resumo:')
  for (const [chave, qtd] of Object.entries(resumo)) {
    if (qtd > 0) console.log(`   ${chave.padEnd(26)}: ${qtd}`)
  }
  console.log('\nReversão: pnpm --filter @torcida/db reset:corinthians-teste -- --dry-run')
}

main()
  .catch((err) => {
    console.error('❌ Erro no seed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
