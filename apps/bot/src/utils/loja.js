const { getDb } = require('./prisma');

// Ordem canônica dos tamanhos (sem PP)
const ORDEM_TAMANHOS = ['P', 'M', 'G', 'GG', 'EXG'];

// Parseia os 3 campos pareados do modal para objeto JSON:
//   campo1 = "P e M"  (ex: "10 e 8")
//   campo2 = "G e GG" (ex: "5 e 3")
//   campo3 = "EXG"    (ex: "2")
// Aceita qualquer separador — extrai apenas os números na ordem
function parseEstoquePares(pM, gGG, exg) {
  const nums = str => { const m = (str || '').match(/\d+/g) || []; return [parseInt(m[0]) || 0, parseInt(m[1]) || 0]; };
  const [p, m]  = nums(pM);
  const [g, gg] = nums(gGG);
  const [e]     = nums(exg);
  return { P: p, M: m, G: g, GG: gg, EXG: e };
}

// Formata estoque para pré-preenchimento do campo pareado ("10 e 8")
function formatarPar(estoque, t1, t2) {
  if (t2 === undefined) return String(estoque?.[t1] ?? 0);
  return `${estoque?.[t1] ?? 0} e ${estoque?.[t2] ?? 0}`;
}

// Formata estoque para exibição ("PP: 5 | P: 10 | M: 8")
function formatarEstoque(estoque) {
  if (!estoque || !Object.keys(estoque).length) return 'SEM ESTOQUE';
  if (Object.keys(estoque).length === 1 && estoque.UN != null) return `${estoque.UN} un.`;
  return ORDEM_TAMANHOS
    .filter(t => estoque[t] !== undefined)
    .concat(Object.keys(estoque).filter(t => !ORDEM_TAMANHOS.includes(t)))
    .map(t => `${t}: ${estoque[t]}`)
    .join(' | ');
}

// Retorna tamanhos com estoque > 0, na ordem canônica
function tamanhoDisponiveis(estoque) {
  if (!estoque || !Object.keys(estoque).length) return [];
  const todos = ORDEM_TAMANHOS
    .filter(t => estoque[t] > 0)
    .concat(Object.keys(estoque).filter(t => !ORDEM_TAMANHOS.includes(t) && estoque[t] > 0));
  return todos;
}

// ── Tradução Prisma (camelCase) → formato snake_case que os call-sites
// existentes esperam (produto.imagem_url, pedido.discord_id etc). Mantém o
// contrato externo idêntico ao do pg cru — call-sites em commands/produto.js,
// events/interactionCreate.js e events/messageCreate.js não precisam mudar.

function produtoParaLinha(p) {
  if (!p) return null;
  return {
    id: p.id,
    nome: p.nome,
    tamanhos: p.tamanhos,
    preco: Number(p.preco),
    imagem_url: p.imagemUrl,
    ativo: p.ativo,
    criado_em: p.criadoEm,
    estoque: p.estoque,
  };
}

function pedidoParaLinha(ped) {
  if (!ped) return null;
  return {
    id: ped.id,
    discord_id: ped.discordId,
    discord_tag: ped.discordTag,
    produto_id: ped.produtoId,
    produto_nome: ped.produtoNome,
    tamanho: ped.tamanho,
    quantidade: ped.quantidade,
    preco_unit: ped.precoUnit != null ? Number(ped.precoUnit) : null,
    total: ped.total != null ? Number(ped.total) : null,
    status: ped.status,
    canal_ticket_id: ped.canalTicketId,
    criado_em: ped.criadoEm,
  };
}

// ── Produtos ─────────────────────────────────────────────────────────────────

async function listarProdutos(apenasAtivos = true) {
  const db = await getDb();
  const rows = await db.botProduto.findMany({
    where: apenasAtivos ? { ativo: true } : undefined,
    orderBy: apenasAtivos ? { nome: 'asc' } : [{ ativo: 'desc' }, { nome: 'asc' }],
  });
  return rows.map(produtoParaLinha);
}

async function buscarProduto(id) {
  const db = await getDb();
  const p = await db.botProduto.findUnique({ where: { id: Number(id) } });
  return produtoParaLinha(p);
}

async function adicionarProduto(nome, tamanhos, preco, imagem_url = null, estoque = {}) {
  const db = await getDb();
  const p = await db.botProduto.create({
    data: { nome, tamanhos, preco: parseFloat(preco), imagemUrl: imagem_url || null, estoque },
  });
  return produtoParaLinha(p);
}

// campos vem em snake_case (mesmo formato que os call-sites já usam) — só
// imagem_url precisa de tradução de nome pro campo do Prisma; o resto
// (nome, tamanhos, preco, ativo, estoque) tem o mesmo nome nos dois lados.
async function atualizarProduto(id, campos) {
  const db = await getDb();
  const data = {};
  for (const [k, v] of Object.entries(campos)) {
    if (k === 'imagem_url') data.imagemUrl = v;
    else data[k] = v;
  }
  const p = await db.botProduto.update({ where: { id: Number(id) }, data });
  return produtoParaLinha(p);
}

// Decrementa qtd unidades do tamanho no estoque; retorna produto atualizado ou null se sem estoque
async function decrementarEstoque(id, tamanho, qtd = 1) {
  const prod = await buscarProduto(id);
  if (!prod) return null;
  const estoque = prod.estoque || {};
  const atual   = estoque[tamanho] ?? 0;
  if (atual < qtd) return null; // sem estoque suficiente
  estoque[tamanho] = atual - qtd;
  return atualizarProduto(id, { estoque });
}

async function removerProduto(id) {
  const db = await getDb();
  await db.botProduto.update({ where: { id: Number(id) }, data: { ativo: false } });
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

async function registrarPedido({ discord_id, discord_tag, produto_id, produto_nome, tamanho, quantidade, preco_unit, canal_ticket_id }) {
  const db = await getDb();
  const total = parseFloat(preco_unit) * parseInt(quantidade);
  const ped = await db.botPedido.create({
    data: {
      discordId: discord_id,
      discordTag: discord_tag,
      produtoId: produto_id,
      produtoNome: produto_nome,
      tamanho,
      quantidade,
      precoUnit: preco_unit,
      total,
      canalTicketId: canal_ticket_id,
    },
  });
  return pedidoParaLinha(ped);
}

async function atualizarStatusPedido(id, status) {
  const db = await getDb();
  await db.botPedido.update({ where: { id: Number(id) }, data: { status } });
}

module.exports = { listarProdutos, buscarProduto, adicionarProduto, atualizarProduto, removerProduto, registrarPedido, atualizarStatusPedido, decrementarEstoque, formatarEstoque, tamanhoDisponiveis };
