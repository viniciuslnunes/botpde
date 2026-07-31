/**
 * Auditoria de regras de negócio sobre os dados do banco — pensada para
 * rodar depois de um seed de volume, mas vale para dado real também.
 *
 * Faz duas coisas:
 *
 *  1. **Matriz de relações entre torcidas** — replica a lógica de
 *     `apps/web/src/lib/hierarquia.ts` (lineage → allied → rival, nessa
 *     precedência) para poder rodar fora do Next. Serve para ver, de fora,
 *     quem enxerga o que: `ancestor` vê tudo, `descendant`/`allied` só o
 *     público, `rival` e `unrelated` não veem nada
 *     (`packages/types/src/visibility.js`).
 *
 *  2. **Invariantes de domínio** — o que o app garante nas Server Actions,
 *     conferido no dado gravado. Cada checagem cita a regra que valida.
 *     ERRO = contradiz regra do produto; ALERTA = permitido mas suspeito,
 *     ou lacuna de cobertura de teste.
 *
 * Cuidado ao adicionar checagem nova: use `NOT EXISTS`, não `LEFT JOIN … IS
 * NULL`, quando a relação for 1:N (com LEFT JOIN você conta LINHAS que não
 * casaram, não entidades órfãs — falso positivo garantido).
 *
 * Uso:
 *   pnpm --filter @torcida/db audit:regras
 */
import { db } from '../src/index.js'

const achados = []
function ok(area, msg) { achados.push({ nivel: 'ok', area, msg }) }
function alerta(area, msg) { achados.push({ nivel: 'ALERTA', area, msg }) }
function erro(area, msg) { achados.push({ nivel: 'ERRO', area, msg }) }

const ordenarPar = (a, b) => (a < b ? [a, b] : [b, a])

// ── lineage (árvore de Sede) ─────────────────────────────────────────────
async function ancestorTenantIds(tenantId) {
  const sede = (await db.sede.findFirst({ where: { tenantId, tipo: 'SEDE' }, select: { id: true, tenantId: true, sedeId: true } }))
    ?? (await db.sede.findFirst({ where: { tenantId }, select: { id: true, tenantId: true, sedeId: true } }))
  const ids = []
  let atual = sede
  for (let i = 0; i < 10 && atual?.sedeId; i++) {
    const pai = await db.sede.findFirst({ where: { id: atual.sedeId }, select: { id: true, tenantId: true, sedeId: true } })
    if (!pai) break
    if (pai.tenantId && pai.tenantId !== tenantId) ids.push(pai.tenantId)
    atual = pai
  }
  return [...new Set(ids)]
}
async function descendantTenantIds(sedeId, vis = new Set()) {
  if (!sedeId || vis.has(sedeId)) return []
  vis.add(sedeId)
  const filhos = await db.sede.findMany({ where: { sedeId }, select: { id: true, tenantId: true } })
  const ids = []
  for (const f of filhos) {
    if (f.tenantId) ids.push(f.tenantId)
    ids.push(...(await descendantTenantIds(f.id, vis)))
  }
  return [...new Set(ids)]
}
async function lineage(tenantId) {
  const raiz = (await db.sede.findFirst({ where: { tenantId, tipo: 'SEDE' }, select: { id: true } }))
    ?? (await db.sede.findFirst({ where: { tenantId }, select: { id: true } }))
  const [anc, desc] = await Promise.all([ancestorTenantIds(tenantId), descendantTenantIds(raiz?.id)])
  return { anc, desc, all: [...new Set([tenantId, ...anc, ...desc.filter((d) => d !== tenantId)])] }
}

async function saoAliados(aId, bId, linA, linB) {
  if (aId === bId) return true
  const c = await db.alianca.count({
    where: {
      status: 'ATIVA',
      OR: [
        { tenantOrigemId: { in: linA.all }, tenantAliadoId: { in: linB.all } },
        { tenantOrigemId: { in: linB.all }, tenantAliadoId: { in: linA.all } },
      ],
    },
  })
  return c > 0
}
async function saoRivais(aId, bId, afA, afB) {
  if (aId === bId) return false
  const [tA, tB] = ordenarPar(aId, bId)
  if (await db.rivalidadeTorcida.count({ where: { tenantAId: tA, tenantBId: tB } })) return true
  if (!afA || !afB || afA === afB) return false
  const [cA, cB] = ordenarPar(afA, afB)
  return (await db.rivalidadeClube.count({ where: { afiliacaoAId: cA, afiliacaoBId: cB } })) > 0
}

async function relacao(a, b, lins, afiliacaoPorTenant) {
  if (a === b) return 'self'
  const linA = lins.get(a)
  if (linA.anc.includes(b)) return 'descendant'
  if (linA.desc.includes(b)) return 'ancestor'
  if (await saoAliados(a, b, linA, lins.get(b))) return 'allied'
  if (await saoRivais(a, b, afiliacaoPorTenant.get(a), afiliacaoPorTenant.get(b))) return 'rival'
  return 'unrelated'
}

// ── main ─────────────────────────────────────────────────────────────────
const SLUGS_LOTE = [
  'pde-gavioes-fiel', 'camisa-12-corinthians', 'pavilhao-nove', 'estopim-da-fiel-sp',
  'torcida-fiel-macabra-sp', 'torcida-organizada-coringao-chopp-sp',
  'torcida-jovem-flamengo', 'mancha-alviverde', 'dragoes-da-real', 'torcida-jovem-santos',
  'geral-do-gremio', 'camisa-12-inter', 'pavilhao-independente-cruzeiro',
  'galo-metal-torcida-organizada-mg', 'young-flu', 'furia-jovem-do-botafogo-rj',
]

const tenants = await db.tenant.findMany({
  where: { slug: { in: SLUGS_LOTE } },
  select: { id: true, slug: true, afiliacaoId: true, afiliacao: { select: { nome: true } } },
})
const afiliacaoPorTenant = new Map(tenants.map((t) => [t.id, t.afiliacaoId]))
const lins = new Map()
for (const t of tenants) lins.set(t.id, await lineage(t.id))

// ══ 1. Matriz de relações ════════════════════════════════════════════════
console.log('══ 1. MATRIZ DE RELAÇÕES (ator → alvo) ══\n')
const contagem = {}
const paresPorRelacao = { allied: [], rival: [], ancestor: [], descendant: [] }
for (const a of tenants) {
  const linha = []
  for (const b of tenants) {
    const r = await relacao(a.id, b.id, lins, afiliacaoPorTenant)
    contagem[r] = (contagem[r] ?? 0) + 1
    if (paresPorRelacao[r]) paresPorRelacao[r].push(`${a.slug} → ${b.slug}`)
    linha.push(r === 'self' ? '·' : r === 'unrelated' ? ' ' : r === 'allied' ? 'A' : r === 'rival' ? 'R' : r === 'ancestor' ? '↑' : '↓')
  }
  console.log(`${a.slug.padEnd(38)} ${linha.join(' ')}`)
}
console.log('\nlegenda: · self | A allied | R rival | ↑ ancestor(vê tudo) | ↓ descendant(só público) | (vazio) unrelated')
console.log('contagem:', JSON.stringify(contagem))
console.log(`\npares rival: ${paresPorRelacao.rival.length} · allied: ${paresPorRelacao.allied.length} · hierárquicos: ${paresPorRelacao.ancestor.length + paresPorRelacao.descendant.length}`)

if (paresPorRelacao.ancestor.length + paresPorRelacao.descendant.length === 0) {
  alerta('hierarquia', 'Nenhum par ancestor/descendant entre as 16 torcidas: as Subsedes/PDEs são Sede filhas SEM tenant próprio, então a visibilidade hierárquica cross-tenant (§3.2) não é exercitada por nenhum dado de teste.')
}

// ══ 2. Rivalidade e aliança ══════════════════════════════════════════════
console.log('\n══ 2. RIVALIDADE / ALIANÇA ══')
const rivClubeTodos = await db.rivalidadeClube.findMany({ select: { afiliacaoAId: true, afiliacaoBId: true } })
const foraCanon = rivClubeTodos.filter((r) => !(r.afiliacaoAId < r.afiliacaoBId))
foraCanon.length ? erro('rivalidade', `${foraCanon.length} RivalidadeClube fora do par canônico (aId < bId) — a consulta normaliza, mas duplicata invertida passaria pelo unique`) : ok('rivalidade', 'RivalidadeClube: todos os pares na forma canônica aId < bId')
const rivTorcTodos = await db.rivalidadeTorcida.findMany({ select: { tenantAId: true, tenantBId: true } })
const foraCanonT = rivTorcTodos.filter((r) => !(r.tenantAId < r.tenantBId))
foraCanonT.length ? erro('rivalidade', `${foraCanonT.length} RivalidadeTorcida fora do par canônico`) : ok('rivalidade', 'RivalidadeTorcida: todos os pares na forma canônica')

const aliancas = await db.alianca.findMany({
  select: { id: true, status: true, tenantOrigem: { select: { slug: true, afiliacaoId: true } }, tenantAliado: { select: { slug: true, afiliacaoId: true } } },
})
const mesmoClube = aliancas.filter((a) => a.tenantOrigem.afiliacaoId && a.tenantOrigem.afiliacaoId === a.tenantAliado.afiliacaoId)
mesmoClube.length
  ? erro('aliança', `${mesmoClube.length} aliança(s) entre torcidas do MESMO clube (co-irmãs não viram Alianca — proporAlianca rejeita): ${mesmoClube.map((a) => `${a.tenantOrigem.slug}→${a.tenantAliado.slug} [${a.status}]`).join(', ')}`)
  : ok('aliança', `${aliancas.length} alianças, nenhuma entre co-irmãs do mesmo clube (regra de proporAlianca respeitada)`)

const aliadosRivais = []
for (const a of aliancas) {
  if (a.status !== 'ATIVA') continue
  const tO = tenants.find((t) => t.slug === a.tenantOrigem.slug)
  const tA = tenants.find((t) => t.slug === a.tenantAliado.slug)
  if (!tO || !tA) continue
  if (await saoRivais(tO.id, tA.id, tO.afiliacaoId, tA.afiliacaoId)) aliadosRivais.push(`${a.tenantOrigem.slug}→${a.tenantAliado.slug}`)
}
aliadosRivais.length
  ? alerta('aliança', `${aliadosRivais.length} aliança ATIVA entre torcidas de clubes RIVAIS: ${aliadosRivais.join(', ')} — a precedência allied>rival neutraliza a segregação anti-infiltração`)
  : ok('aliança', 'Nenhuma aliança ATIVA entre clubes rivais (precedência allied>rival não está neutralizando segregação)')

const invertidas = []
for (const a of aliancas) {
  if (aliancas.some((b) => b.tenantOrigem.slug === a.tenantAliado.slug && b.tenantAliado.slug === a.tenantOrigem.slug)) {
    invertidas.push(`${a.tenantOrigem.slug}↔${a.tenantAliado.slug}`)
  }
}
invertidas.length ? erro('aliança', `Par direcional duplicado nas duas direções: ${[...new Set(invertidas)].join(', ')} — o unique é por direção, leitura é simétrica`) : ok('aliança', 'Nenhum par de aliança duplicado em direção inversa')

// ══ 3. Comunidade Nacional ═══════════════════════════════════════════════
console.log('\n══ 3. COMUNIDADE NACIONAL / PERFIL TORCEDOR ══')
const nacNaoPublico = await db.post.count({ where: { alcanceNacional: true, visibilidade: { not: 'PUBLICO' } } })
nacNaoPublico ? erro('comunidade', `${nacNaoPublico} post(s) com alcanceNacional=true e visibilidade≠PUBLICO — vazaria conteúdo interno no feed nacional`) : ok('comunidade', 'Todo post com alcance nacional é PUBLICO')

const nacSemClube = await db.post.count({ where: { alcanceNacional: true, tenant: { afiliacaoId: null } } })
nacSemClube ? alerta('comunidade', `${nacSemClube} post nacional em tenant sem afiliacaoId — órfão no feed nacional`) : ok('comunidade', 'Todo post nacional pertence a tenant com clube definido')

// Torcedor global de um clube que é membro de organizada de OUTRO clube
const contradicoes = await db.$queryRaw`
  SELECT COUNT(*)::int AS n
  FROM saas_perfis_torcedor p
  JOIN saas_membros m ON m.user_id = p.user_id
  JOIN saas_tenants t ON t.id = m.tenant_id
  WHERE p.afiliacao_id IS NOT NULL AND t.afiliacao_id IS NOT NULL
    AND p.afiliacao_id <> t.afiliacao_id`
const nContra = contradicoes[0]?.n ?? 0
nContra ? alerta('comunidade', `${nContra} usuário(s) com PerfilTorcedor de um clube e SaasMembro em organizada de OUTRO clube`) : ok('comunidade', 'Nenhum usuário torce por um clube e é membro de organizada de outro')

const perfisSemOnboarding = await db.perfilTorcedor.count({ where: { onboardingConcluidoEm: null } })
perfisSemOnboarding ? alerta('comunidade', `${perfisSemOnboarding} PerfilTorcedor sem onboardingConcluidoEm — não publica no feed nacional`) : ok('comunidade', 'Todo PerfilTorcedor concluiu onboarding')

// ══ 4. Departamentos ═════════════════════════════════════════════════════
console.log('\n══ 4. DEPARTAMENTOS ══')
const torcedorComPreferencia = await db.saasMembro.count({
  where: { tipo: 'TORCEDOR', departamentoId: { not: null } },
})
torcedorComPreferencia
  ? erro('departamentos', `${torcedorComPreferencia} TORCEDOR com departamentoId — preferência de área é exclusiva de sócio`)
  : ok('departamentos', 'Nenhum TORCEDOR possui preferência de departamento')

const perfilAreaInelegivel = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_user_roles ur
  JOIN saas_roles r ON r.id = ur.role_id
  LEFT JOIN saas_membros m ON m.user_id = ur.user_id AND m.tenant_id = ur.tenant_id
  WHERE r.departamento_id IS NOT NULL
    AND (
      m.id IS NULL OR m.tipo <> 'SOCIO' OR m.status <> 'APROVADO'
      OR m.desligado_em IS NOT NULL OR m.espelhado = true
      OR m.membro_origem_id IS NOT NULL
    )`
;(perfilAreaInelegivel[0]?.n ?? 0)
  ? erro('departamentos', `${perfilAreaInelegivel[0].n} perfil(is) de área atribuído(s) a usuário inelegível`)
  : ok('departamentos', 'Todo perfil de área pertence a sócio elegível')

const equipeInelegivel = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_user_departamentos ud
  LEFT JOIN saas_membros m ON m.user_id = ud.user_id AND m.tenant_id = ud.tenant_id
  WHERE m.id IS NULL OR m.tipo <> 'SOCIO' OR m.status <> 'APROVADO'
    OR m.desligado_em IS NOT NULL OR m.espelhado = true
    OR m.membro_origem_id IS NOT NULL`
;(equipeInelegivel[0]?.n ?? 0)
  ? erro('departamentos', `${equipeInelegivel[0].n} UserDepartamento de usuário inelegível`)
  : ok('departamentos', 'Toda equipe de área contém somente sócios elegíveis')

const gestorInelegivel = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_departamento_gestores g
  JOIN saas_departamentos d ON d.id = g.departamento_id
  LEFT JOIN saas_membros m ON m.user_id = g.user_id AND m.tenant_id = d.tenant_id
  WHERE m.id IS NULL OR m.tipo <> 'SOCIO' OR m.status <> 'APROVADO'
    OR m.desligado_em IS NOT NULL OR m.espelhado = true
    OR m.membro_origem_id IS NOT NULL`
;(gestorInelegivel[0]?.n ?? 0)
  ? erro('departamentos', `${gestorInelegivel[0].n} DepartamentoGestor de usuário inelegível`)
  : ok('departamentos', 'Toda gestão de área contém somente sócios elegíveis')

const deptOutroTenant = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_membros m
  JOIN saas_departamentos d ON d.id = m.departamento_id
  WHERE m.departamento_id IS NOT NULL AND d.tenant_id <> m.tenant_id`
;(deptOutroTenant[0]?.n ?? 0) ? erro('departamentos', `${deptOutroTenant[0].n} SaasMembro.departamentoId aponta para departamento de OUTRO tenant`) : ok('departamentos', 'Toda preferência de área aponta para departamento do próprio tenant')

const gestorSemEquipe = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_departamento_gestores g
  JOIN saas_departamentos d ON d.id = g.departamento_id
  LEFT JOIN saas_user_departamentos ud
    ON ud.user_id = g.user_id AND ud.departamento_id = g.departamento_id
  WHERE ud.id IS NULL`
;(gestorSemEquipe[0]?.n ?? 0) ? erro('departamentos', `${gestorSemEquipe[0].n} DepartamentoGestor sem UserDepartamento correspondente (projeção órfã)`) : ok('departamentos', 'Todo gestor de área também é membro da área')

// NOT EXISTS, não LEFT JOIN: com LEFT JOIN a checagem conta LINHAS de
// userRole que não são o perfil da área, não alocações órfãs.
const equipeSemPerfil = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_user_departamentos ud
  WHERE NOT EXISTS (
    SELECT 1 FROM saas_user_roles ur JOIN saas_roles r ON r.id = ur.role_id
    WHERE ur.user_id = ud.user_id AND ur.tenant_id = ud.tenant_id
      AND r.departamento_id = ud.departamento_id)`
;(equipeSemPerfil[0]?.n ?? 0) ? erro('departamentos', `${equipeSemPerfil[0].n} UserDepartamento sem perfil de área correspondente (órfão — db:repair-departamento-orfaos)`) : ok('departamentos', 'Toda alocação de equipe tem perfil de área correspondente')

// ══ 5. RBAC ══════════════════════════════════════════════════════════════
console.log('\n══ 5. RBAC ══')
const vicePorTenant = await db.$queryRaw`
  SELECT t.slug, COUNT(*)::int AS n FROM saas_user_roles ur
  JOIN saas_roles r ON r.id = ur.role_id
  JOIN saas_tenants t ON t.id = ur.tenant_id
  WHERE r.is_system AND r.nome = 'vice' GROUP BY t.slug HAVING COUNT(*) > 2`
vicePorTenant.length ? erro('rbac', `Torcida(s) acima de MAX_VICE_PRESIDENTES=2: ${vicePorTenant.map((v) => `${v.slug}=${v.n}`).join(', ')}`) : ok('rbac', 'Nenhuma torcida excede 2 vice-presidentes')

const ownerPorTenant = await db.$queryRaw`
  SELECT t.slug, COUNT(*)::int AS n FROM saas_user_roles ur
  JOIN saas_roles r ON r.id = ur.role_id
  JOIN saas_tenants t ON t.id = ur.tenant_id
  WHERE r.is_system AND r.nome = 'owner' GROUP BY t.slug HAVING COUNT(*) > 1`
ownerPorTenant.length ? alerta('rbac', `Torcida(s) com mais de um owner: ${ownerPorTenant.map((v) => `${v.slug}=${v.n}`).join(', ')}`) : ok('rbac', 'Nenhuma torcida com owner duplicado')

const roleCrossTenant = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_user_roles ur
  JOIN saas_roles r ON r.id = ur.role_id
  WHERE r.tenant_id <> ur.tenant_id`
;(roleCrossTenant[0]?.n ?? 0) ? erro('rbac', `${roleCrossTenant[0].n} UserRole com cargo de OUTRO tenant`) : ok('rbac', 'Nenhum UserRole aponta para cargo de outro tenant')

const cargoSemMembro = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_user_roles ur
  LEFT JOIN saas_membros m ON m.user_id = ur.user_id AND m.tenant_id = ur.tenant_id
  WHERE m.id IS NULL`
;(cargoSemMembro[0]?.n ?? 0) ? alerta('rbac', `${cargoSemMembro[0].n} UserRole sem SaasMembro no mesmo tenant (cargo sem vínculo de sócio)`) : ok('rbac', 'Todo cargo pertence a alguém com vínculo de membro')

const cargoDeNaoAprovado = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_user_roles ur
  JOIN saas_membros m ON m.user_id = ur.user_id AND m.tenant_id = ur.tenant_id
  WHERE m.status <> 'APROVADO'`
;(cargoDeNaoAprovado[0]?.n ?? 0) ? erro('rbac', `${cargoDeNaoAprovado[0].n} UserRole de membro NÃO aprovado`) : ok('rbac', 'Nenhum cargo atribuído a membro não aprovado')

// ══ 6. Multi-tenant ══════════════════════════════════════════════════════
console.log('\n══ 6. INTEGRIDADE MULTI-TENANT ══')
for (const [tabela, sql, label] of [
  ['saas_membros', db.$queryRaw`SELECT COUNT(*)::int AS n FROM saas_membros m JOIN saas_sedes s ON s.id = m.sede_id WHERE m.sede_id IS NOT NULL AND s.tenant_id <> m.tenant_id`, 'SaasMembro.sedeId em unidade de outro tenant'],
  ['saas_eventos', db.$queryRaw`SELECT COUNT(*)::int AS n FROM saas_eventos e JOIN saas_sedes s ON s.id = e.sede_id WHERE e.sede_id IS NOT NULL AND s.tenant_id <> e.tenant_id`, 'Evento.sedeId em unidade de outro tenant'],
  ['saas_bar_vendas', db.$queryRaw`SELECT COUNT(*)::int AS n FROM saas_bar_vendas v JOIN saas_sedes s ON s.id = v.sede_id WHERE s.tenant_id <> v.tenant_id`, 'BarVenda.sedeId em unidade de outro tenant'],
  ['saas_bar_produtos', db.$queryRaw`SELECT COUNT(*)::int AS n FROM saas_bar_produtos p JOIN saas_bar_categorias c ON c.id = p.categoria_id WHERE p.categoria_id IS NOT NULL AND (c.tenant_id <> p.tenant_id OR c.sede_id <> p.sede_id)`, 'BarProduto em categoria de outro tenant/unidade'],
  ['saas_pedido_itens', db.$queryRaw`SELECT COUNT(*)::int AS n FROM saas_pedido_itens i JOIN saas_pedidos p ON p.id = i.pedido_id JOIN saas_produtos pr ON pr.id = i.produto_id WHERE pr.tenant_id <> p.tenant_id`, 'SaasPedidoItem com produto de outro tenant'],
]) {
  const r = await sql
  ;(r[0]?.n ?? 0) ? erro('multi-tenant', `${r[0].n} × ${label}`) : ok('multi-tenant', label.replace(/^(\w+)/, 'OK:') && `Nenhum caso: ${label}`)
}

// ══ 7. Bar / financeiro / loja ═══════════════════════════════════════════
console.log('\n══ 7. BAR / FINANCEIRO / LOJA ══')
const estoqueNeg = await db.barProduto.findMany({ where: { estoque: { lt: 0 } }, select: { nome: true, estoque: true, tenant: { select: { slug: true } } } })
estoqueNeg.length
  ? erro('bar', `${estoqueNeg.length} BarProduto com estoque NEGATIVO (ex.: ${estoqueNeg.slice(0, 3).map((p) => `${p.tenant.slug}/${p.nome}=${p.estoque}`).join(', ')}) — venda não deveria poder furar o estoque`)
  : ok('bar', 'Nenhum produto de bar com estoque negativo')

// FIADO nasce PAGA mas SEM receita: o lançamento entra só na quitação
// (registrarVenda / quitarFiado). Contar FIADO aqui daria falso positivo.
const vendaPagaSemLanc = await db.barVenda.count({ where: { status: 'PAGA', financeiroLancamentoId: null, metodoPagamento: { not: 'FIADO' } } })
const fiadoAbertoSemLanc = await db.barVenda.count({ where: { status: 'PAGA', metodoPagamento: 'FIADO', financeiroLancamentoId: null, fiado: { status: 'PENDENTE' } } })
console.log(`   FIADO em aberto sem receita no caixa: ${fiadoAbertoSemLanc} (correto por regra — receita entra na quitação)`)
vendaPagaSemLanc ? erro('bar', `${vendaPagaSemLanc} BarVenda PAGA sem lançamento no livro-caixa`) : ok('bar', 'Toda venda PAGA tem lançamento no livro-caixa')

const vendaNaoPagaComLanc = await db.barVenda.count({ where: { status: { not: 'PAGA' }, financeiroLancamentoId: { not: null } } })
vendaNaoPagaComLanc ? alerta('bar', `${vendaNaoPagaComLanc} BarVenda não-PAGA com lançamento de receita (estorno mantém o par receita+despesa: conferir se é intencional)`) : ok('bar', 'Nenhuma venda não-paga com receita lançada')

const turnosAbertosDup = await db.$queryRaw`
  SELECT tenant_id, sede_id, COUNT(*)::int AS n FROM saas_bar_caixa_turnos
  WHERE fechado_em IS NULL GROUP BY tenant_id, sede_id HAVING COUNT(*) > 1`
turnosAbertosDup.length ? erro('bar', `${turnosAbertosDup.length} unidade(s) com mais de um turno de caixa ABERTO (regra: no máximo 1)`) : ok('bar', 'No máximo um turno de caixa aberto por unidade')

const fiadoPagoSemLanc = await db.barFiado.count({ where: { status: 'PAGA', financeiroLancamentoId: null } })
fiadoPagoSemLanc ? erro('bar', `${fiadoPagoSemLanc} BarFiado quitado sem lançamento no livro-caixa`) : ok('bar', 'Todo fiado quitado tem lançamento')

// Pós-migração fiado→comanda: venda vira EM_COMANDA (ainda válida). Legado
// pré-migração continua PAGA. Qualquer outro status é erro.
const fiadoStatusVenda = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_bar_fiados f JOIN saas_bar_vendas v ON v.id = f.venda_id
  WHERE f.status = 'PAGA' AND v.status NOT IN ('PAGA', 'EM_COMANDA')`
;(fiadoStatusVenda[0]?.n ?? 0) ? erro('bar', `${fiadoStatusVenda[0].n} BarFiado quitado cuja BarVenda não está PAGA nem EM_COMANDA`) : ok('bar', 'Fiado quitado tem venda PAGA ou EM_COMANDA (migrado)')

// ── Invariantes Comanda (modulo-bar-comanda.md §11) ──────────────────────
const emComandaSemComanda = await db.barVenda.count({
  where: { status: 'EM_COMANDA', OR: [{ comandaId: null }, { financeiroLancamentoId: { not: null } }] },
})
emComandaSemComanda
  ? erro('bar', `${emComandaSemComanda} BarVenda EM_COMANDA sem comandaId ou com receita no lançamento`)
  : ok('bar', 'EM_COMANDA ⇒ comandaId set + financeiroLancamentoId null')

const pagConfirmSemLanc = await db.barComandaPagamento.count({
  where: { status: 'CONFIRMADO', financeiroLancamentoId: null },
})
pagConfirmSemLanc
  ? erro('bar', `${pagConfirmSemLanc} BarComandaPagamento CONFIRMADO sem financeiroLancamentoId`)
  : ok('bar', 'Pagamento CONFIRMADO tem lançamento no livro-caixa')

const fechadaPagaSaldo = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_bar_comandas
  WHERE status = 'FECHADA_PAGA'
    AND ROUND(total - desconto - total_pago, 2) <> 0`
;(fechadaPagaSaldo[0]?.n ?? 0)
  ? erro('bar', `${fechadaPagaSaldo[0].n} comanda FECHADA_PAGA com saldo ≠ 0`)
  : ok('bar', 'FECHADA_PAGA tem saldo 0')

const debitoInvalido = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_bar_comandas
  WHERE status IN ('FECHADA_COM_DEBITO', 'VENCIDA')
    AND (
      ROUND(total - desconto - total_pago, 2) <= 0
      OR vencimento IS NULL
      OR tipo <> 'MEMBRO'
    )`
;(debitoInvalido[0]?.n ?? 0)
  ? erro('bar', `${debitoInvalido[0].n} comanda com débito sem saldo>0/vencimento/MEMBRO`)
  : ok('bar', 'FECHADA_COM_DEBITO/VENCIDA ⇒ saldo > 0 + vencimento + MEMBRO')

const pedidoPagoSemLanc = await db.saasPedido.count({ where: { status: { in: ['CONFIRMADO', 'ENTREGUE'] }, financeiroLancamentoId: null } })
pedidoPagoSemLanc ? alerta('loja', `${pedidoPagoSemLanc} SaasPedido confirmado/entregue sem receita no livro-caixa`) : ok('loja', 'Todo pedido confirmado/entregue tem receita lançada')

// Conciliação de caixa do bar, por tenant:
//   esperado = vendas PAGA
//            − fiado legado ainda PAGA (receita só na quitação)
//            + pagamentos de comanda CONFIRMADO (receita no pagamento; venda EM_COMANDA)
const tenantsComBar = await db.barVenda.groupBy({ by: ['tenantId'], where: { status: 'PAGA' }, _sum: { total: true } })
const tenantsComPagComanda = await db.$queryRaw`
  SELECT c.tenant_id AS "tenantId", COALESCE(SUM(p.valor), 0)::float AS total
  FROM saas_bar_comanda_pagamentos p
  JOIN saas_bar_comandas c ON c.id = p.comanda_id
  WHERE p.status = 'CONFIRMADO'
  GROUP BY c.tenant_id`
const pagPorTenant = new Map(tenantsComPagComanda.map((r) => [r.tenantId, Number(r.total)]))
const tenantIds = [...new Set([
  ...tenantsComBar.map((l) => l.tenantId),
  ...pagPorTenant.keys(),
])]
const desconciliados = []
for (const tenantId of tenantIds) {
  const linha = tenantsComBar.find((l) => l.tenantId === tenantId)
  const [fiadoAberto, receitaBar] = await Promise.all([
    db.barFiado.aggregate({
      where: {
        tenantId,
        status: { in: ['PENDENTE', 'VENCIDA'] },
        venda: { status: 'PAGA' },
      },
      _sum: { valor: true },
    }),
    db.financeiroLancamento.aggregate({ where: { tenantId, categoria: 'BAR', tipo: 'RECEITA' }, _sum: { valor: true } }),
  ])
  const esperado =
    Number(linha?._sum.total ?? 0)
    - Number(fiadoAberto._sum.valor ?? 0)
    + (pagPorTenant.get(tenantId) ?? 0)
  const real = Number(receitaBar._sum.valor ?? 0)
  if (Math.abs(esperado - real) > 0.02) {
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
    desconciliados.push(`${t?.slug}: esperado R$ ${esperado.toFixed(2)} · caixa R$ ${real.toFixed(2)} (Δ ${(real - esperado).toFixed(2)})`)
  }
}
desconciliados.length
  ? alerta('bar', `Caixa do bar não concilia em ${desconciliados.length} torcida(s): ${desconciliados.join(' | ')}`)
  : ok('bar', `Caixa do bar concilia em ${tenantIds.length} torcida(s): PAGA − fiado legado + pag. comanda = receitas BAR`)

const somaItens = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_bar_vendas v
  WHERE ROUND(v.subtotal - v.desconto, 2) <> ROUND(v.total, 2)`
;(somaItens[0]?.n ?? 0) ? erro('bar', `${somaItens[0].n} BarVenda com total ≠ subtotal - desconto`) : ok('bar', 'total = subtotal - desconto em toda venda')

const itensVsSubtotal = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM (
    SELECT v.id, v.subtotal, SUM(i.total) AS soma FROM saas_bar_vendas v
    JOIN saas_bar_venda_itens i ON i.venda_id = v.id GROUP BY v.id, v.subtotal
  ) x WHERE ROUND(x.subtotal, 2) <> ROUND(x.soma, 2)`
;(itensVsSubtotal[0]?.n ?? 0) ? erro('bar', `${itensVsSubtotal[0].n} BarVenda cujo subtotal ≠ soma dos itens`) : ok('bar', 'subtotal = soma dos itens em toda venda')

// ══ 8. Eventos ═══════════════════════════════════════════════════════════
console.log('\n══ 8. EVENTOS / CARAVANAS ══')
const acimaCapacidade = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM (
    SELECT e.id, e.capacidade, COUNT(r.id) AS confirmados FROM saas_eventos e
    JOIN saas_evento_rsvps r ON r.evento_id = e.id AND r.status = 'CONFIRMADO'
    WHERE e.capacidade IS NOT NULL GROUP BY e.id, e.capacidade
  ) x WHERE x.confirmados > x.capacidade`
;(acimaCapacidade[0]?.n ?? 0) ? erro('eventos', `${acimaCapacidade[0].n} evento(s) com CONFIRMADOS acima da capacidade (excedente deveria ser LISTA_ESPERA)`) : ok('eventos', 'Nenhum evento com confirmados acima da capacidade')

const checkinFuturo = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_evento_rsvps r JOIN saas_eventos e ON e.id = r.evento_id
  WHERE r.checked_in_at IS NOT NULL AND e.data > NOW()`
;(checkinFuturo[0]?.n ?? 0) ? erro('eventos', `${checkinFuturo[0].n} check-in registrado em evento FUTURO`) : ok('eventos', 'Nenhum check-in em evento futuro')

const caravanaSemValor = await db.evento.count({ where: { tipo: 'CARAVANA', valorVaga: null } })
caravanaSemValor ? alerta('eventos', `${caravanaSemValor} CARAVANA sem valorVaga (permitido: caravana sem cobrança)`) : ok('eventos', 'Toda caravana tem valor de vaga')

const listaEsperaSemCapacidade = await db.$queryRaw`
  SELECT COUNT(*)::int AS n FROM saas_evento_rsvps r JOIN saas_eventos e ON e.id = r.evento_id
  WHERE r.status = 'LISTA_ESPERA' AND e.capacidade IS NULL`
;(listaEsperaSemCapacidade[0]?.n ?? 0) ? erro('eventos', `${listaEsperaSemCapacidade[0].n} RSVP em LISTA_ESPERA em evento SEM capacidade definida`) : ok('eventos', 'Lista de espera só existe em evento com capacidade')

// ══ Relatório ════════════════════════════════════════════════════════════
console.log('\n\n══════ RELATÓRIO ══════')
for (const nivel of ['ERRO', 'ALERTA', 'ok']) {
  const itens = achados.filter((a) => a.nivel === nivel)
  if (nivel === 'ok') { console.log(`\n✅ Conformes: ${itens.length}`); continue }
  console.log(`\n${nivel === 'ERRO' ? '❌ ERROS' : '⚠️  ALERTAS'}: ${itens.length}`)
  for (const i of itens) console.log(`   [${i.area}] ${i.msg}`)
}
await db.$disconnect()
