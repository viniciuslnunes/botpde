const db = require('./db');

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

async function adicionarProduto(nome, tamanhos, preco, imagem_url = null) {
  const res = await db.query(
    `INSERT INTO produtos (nome, tamanhos, preco, imagem_url) VALUES ($1, $2, $3, $4) RETURNING *`,
    [nome, tamanhos, parseFloat(preco), imagem_url || null],
  );
  return res.rows[0];
}

async function atualizarProduto(id, campos) {
  const sets  = [];
  const vals  = [];
  let   idx   = 1;
  for (const [k, v] of Object.entries(campos)) {
    sets.push(`${k} = $${idx++}`);
    vals.push(v);
  }
  vals.push(id);
  const res = await db.query(
    `UPDATE produtos SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals,
  );
  return res.rows[0];
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

module.exports = { listarProdutos, buscarProduto, adicionarProduto, atualizarProduto, removerProduto, registrarPedido, atualizarStatusPedido };
