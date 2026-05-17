// Mapa temporário em memória: userId -> dados pendentes do produto
// { type: 'add'|'edit', nome, tamanhos, preco, channelId, produtoId? }
const pending = new Map();
module.exports = pending;
