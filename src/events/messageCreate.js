const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const pendingProdutos = require('../utils/pendingProdutos');
const { adicionarProduto, atualizarProduto } = require('../utils/loja');

function carrosselEmbeds(embedBase, imagem_url) {
  if (!imagem_url) return [embedBase];
  const urls = imagem_url.split(',').map(u => u.trim()).filter(Boolean).slice(0, 4);
  if (!urls.length) return [embedBase];
  const ANCHOR = 'https://discord.com/channels/@me';
  const embeds = [{ ...embedBase, url: ANCHOR, image: { url: urls[0] } }];
  for (let i = 1; i < urls.length; i++) embeds.push({ url: ANCHOR, image: { url: urls[i] } });
  return embeds;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // ── Captura de fotos para produto pendente ────────────────────────────
    const dados = pendingProdutos.get(message.author.id);
    if (dados && message.channelId === dados.channelId && message.attachments.size > 0) {
      const urls = [...message.attachments.values()]
        .filter(a => a.contentType?.startsWith('image/'))
        .slice(0, 4)
        .map(a => a.url)
        .join(',');

      if (!urls) return; // nenhum anexo era imagem, ignora

      pendingProdutos.delete(message.author.id);
      await message.delete().catch(() => {});

      let p;
      if (dados.type === 'add') {
        p = await adicionarProduto(dados.nome, dados.tamanhos, dados.preco, urls).catch(() => null);
      } else {
        p = await atualizarProduto(dados.id, { nome: dados.nome, tamanhos: dados.tamanhos, preco: dados.preco, imagem_url: urls }).catch(() => null);
      }

      if (!p) {
        await message.channel.send({ content: `${message.author} ❌ ERRO AO SALVAR PRODUTO.` });
        return;
      }

      const qtdImgs = urls.split(',').filter(Boolean).length;
      const titulo  = dados.type === 'add' ? '✅ PRODUTO ADICIONADO' : '✅ PRODUTO ATUALIZADO';
      const embedBase = {
        color: 0x000000,
        title: titulo,
        fields: [
          { name: 'NOME',     value: p.nome,                             inline: true },
          { name: 'TAMANHOS', value: p.tamanhos,                         inline: true },
          { name: 'PREÇO',    value: `R$ ${Number(p.preco).toFixed(2)}`, inline: true },
          { name: 'FOTOS',    value: `${qtdImgs} foto(s) salva(s)`,      inline: false },
        ],
      };

      await message.channel.send({
        content: `${message.author}`,
        embeds: carrosselEmbeds(embedBase, p.imagem_url),
      });
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

