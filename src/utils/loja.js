const db = require('./db');

// Ordem canônica dos tamanhos para exibição
const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'EXG'];

// Parseia o campo estoque_texto do modal ("PP:5\nP:10\nM:8") para objeto JSON
function parseEstoque(texto) {
  const obj = {};
  for (const linha of texto.split(/[\n,]+/)) {
    const [tam, qtd] = linha.trim().toUpperCase().split(':');
    if (tam && qtd !== undefined) {
      const n = parseInt(qtd);
      obj[tam] = isNaN(n) ? 0 : n;
    }
  }
  return obj;
}

// Formata estoque para exibição ("PP: 5 | P: 10 | M: 8")
function formatarEstoque(estoque) {
  if (!estoque || !Object.keys(estoque).length) return 'SEM ESTOQUE';
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

// ── Produtos ─────────────────────────────────────────────────────────────────

async function listarProdutos(apenasAtivos = true) {
  const q = apenasAtivos
    ? `SELECT * FROM produtos WHERE ativo = TRUE ORDER BY nome`
    : `SELECT * FROM produtos ORDER BY ativo DESC, nome`;
  const res = await db.query(q);
  return res.rows;
}

async function buscarProduto(id) {
  const res = await db.query('SELECT * FROM produtos WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function adicionarProduto(nome, tamanhos, preco, imagem_url = null, estoque = {}) {
  const res = await db.query(
    `INSERT INTO produtos (nome, tamanhos, preco, imagem_url, estoque) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nome, tamanhos, parseFloat(preco), imagem_url || null, JSON.stringify(estoque)],
  );
  return res.rows[0];
}

async function atualizarProduto(id, campos) {
  const sets  = [];
  const vals  = [];
  let   idx   = 1;
  for (const [k, v] of Object.entries(campos)) {
    sets.push(`${k} = $${idx++}`);
    // estoque precisa ser serializado
    vals.push(k === 'estoque' ? JSON.stringify(v) : v);
  }
  vals.push(id);
  const res = await db.query(
    `UPDATE produtos SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals,
  );
  return res.rows[0];
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
  await db.query(`UPDATE produtos SET ativo = FALSE WHERE id = $1`, [id]);
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

async function registrarPedido({ discord_id, discord_tag, produto_id, produto_nome, tamanho, quantidade, preco_unit, canal_ticket_id }) {
  const total = parseFloat(preco_unit) * parseInt(quantidade);
  const res = await db.query(
    `INSERT INTO pedidos (discord_id, discord_tag, produto_id, produto_nome, tamanho, quantidade, preco_unit, total, canal_ticket_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [discord_id, discord_tag, produto_id, produto_nome, tamanho, quantidade, preco_unit, total, canal_ticket_id],
  );
  return res.rows[0];
}

async function atualizarStatusPedido(id, status) {
  await db.query(`UPDATE pedidos SET status = $1 WHERE id = $2`, [status, id]);
}

module.exports = { listarProdutos, buscarProduto, adicionarProduto, atualizarProduto, removerProduto, registrarPedido, atualizarStatusPedido, decrementarEstoque, parseEstoque, formatarEstoque, tamanhoDisponiveis };
