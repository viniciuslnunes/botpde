const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const pendingProdutos = require('../utils/pendingProdutos');
const { adicionarProduto, atualizarProduto, formatarEstoque } = require('../utils/loja');
const config = require('../config');

function carrosselEmbeds(embedBase, imagem_url) {
  if (!imagem_url) return { embeds: [embedBase], files: [] };
  const items = imagem_url.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  if (!items.length) return { embeds: [embedBase], files: [] };

  const isUrl = items[0].startsWith('http');
  if (isUrl) {
    if (items.length === 1) return { embeds: [{ ...embedBase, image: { url: items[0] } }], files: [] };
    const ANCHOR = 'https://discord.com/channels/@me';
    const embeds = [{ ...embedBase, url: ANCHOR, image: { url: items[0] } }];
    for (let i = 1; i < items.length; i++) embeds.push({ color: embedBase.color ?? 0, url: ANCHOR, image: { url: items[i] } });
    return { embeds, files: [] };
  }

  // Dados em base64 — cria Buffers e envia como attachment para nunca expirarem
  const files = items.map((b64, i) => ({ attachment: Buffer.from(b64, 'base64'), name: `imagem${i + 1}.png` }));
  if (items.length === 1) return { embeds: [{ ...embedBase, image: { url: 'attachment://imagem1.png' } }], files };
  const ANCHOR = 'https://discord.com/channels/@me';
  const embeds = [{ ...embedBase, url: ANCHOR, image: { url: 'attachment://imagem1.png' } }];
  for (let i = 1; i < items.length; i++) embeds.push({ color: embedBase.color ?? 0, url: ANCHOR, image: { url: `attachment://imagem${i + 1}.png` } });
  return { embeds, files };
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // ── Captura de fotos para produto pendente ────────────────────────────
    const dados = pendingProdutos.get(message.author.id);
    if (dados && message.channelId === dados.channelId && message.attachments.size > 0) {
      const anexos = [...message.attachments.values()]
        .filter(a => a.contentType?.startsWith('image/'))
        .slice(0, 4);

      if (!anexos.length) return; // nenhum anexo era imagem, ignora

      // Baixa os buffers ANTES de apagar — ao deletar a mensagem, o Discord
      // remove o arquivo do CDN e qualquer URL salva fica inválida.
      const buffers = await Promise.all(
        anexos.map(a => fetch(a.url).then(r => r.arrayBuffer()).then(ab => Buffer.from(ab))),
      );
      const urls = buffers.map(buf => buf.toString('base64')).join(',');

      pendingProdutos.delete(message.author.id);
      await message.delete().catch(() => {});

      let p;
      if (dados.type === 'add') {
        p = await adicionarProduto(dados.nome, dados.tamanhos, dados.preco, urls, dados.estoque || {}).catch(() => null);
      } else {
        p = await atualizarProduto(dados.id, { nome: dados.nome, tamanhos: dados.tamanhos, preco: dados.preco, estoque: dados.estoque || {}, imagem_url: urls }).catch(() => null);
      }

      if (!p) {
        await message.channel.send({ content: `${message.author} ❌ ERRO AO SALVAR PRODUTO.` });
        return;
      }

      const qtdImgs = urls.split(',').filter(Boolean).length;
      const titulo  = dados.type === 'add' ? '📦 PRODUTO ADICIONADO' : '📦 PRODUTO ATUALIZADO';
      const embedBase = {
        color: 0x000000,
        title: titulo,
        fields: [
          { name: 'NOME',           value: p.nome,                              inline: true },
          { name: 'PREÇO',          value: `R$ ${Number(p.preco).toFixed(2)}`,  inline: true },
          { name: 'ESTOQUE',        value: formatarEstoque(p.estoque),          inline: false },
          { name: 'FOTOS',          value: `${qtdImgs} foto(s) salva(s)`,       inline: false },
          { name: 'REGISTRADO POR', value: `<@${message.author.id}>`,           inline: false },
        ],
      };
      // Log detalhado no canal logs-itens-loja
      const logsItensLojaCh = await message.client.channels.fetch(config.canais.logsItensLoja).catch(() => null);
      if (logsItensLojaCh) {
        logsItensLojaCh.send({ ...carrosselEmbeds(embedBase, p.imagem_url) });
      }
      // Confirmação com detalhes para o usuário no canal de gerenciamento (apaga em 1 min)
      const qtdFotos = urls.split(',').filter(Boolean).length;
      const confirmMsg = await message.channel.send({
        content: `${message.author}`,
        embeds: [{ color: 0x000000,
          title: dados.type === 'add' ? 'PRODUTO ADICIONADO' : 'PRODUTO ATUALIZADO',
          fields: [
            { name: 'NOME',    value: p.nome,                              inline: true  },
            { name: 'PREÇO',   value: `R$ ${Number(p.preco).toFixed(2)}`,  inline: true  },
            { name: 'ESTOQUE', value: formatarEstoque(p.estoque),          inline: false },
            { name: 'FOTOS',   value: `${qtdFotos} foto(s) salva(s)`,      inline: false },
          ],
          footer: { text: 'Esta mensagem será apagada em 1 minuto.' },
        }],
      });
      setTimeout(() => confirmMsg.delete().catch(() => {}), 60_000);
      return;
    }

    if (message.content === '!parceiros') {
      const embed = {
        color: 0x000000,
        title: '🤝 PARCEIROS',
        description: 'Conheça nossos parceiros clicando nos botões abaixo!',
      };
      await message.channel.send({ embeds: [embed] });
    }
  },
};

