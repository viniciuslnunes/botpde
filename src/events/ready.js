const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs   = require('node:fs');
const path = require('path');
const config = require('../config');

const LOGO_PATH = path.join(__dirname, '../assets/pdelogo.png');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Bot online como ${client.user.tag}`);

    const temLogo = fs.existsSync(LOGO_PATH);
    const logoFile = temLogo ? [{ attachment: LOGO_PATH, name: 'pdelogo.png' }] : [];

    // ── Mensagem fixa de recrutamento ────────────────────────
    try {
      const canalRec = await client.channels.fetch(config.canais.recrutamento).catch(() => null);
      if (canalRec) {
        const msgs     = await canalRec.messages.fetch({ limit: 20 });
        const jaExiste = msgs.some(m => m.author.id === client.user.id && m.components.length > 0);
        if (!jaExiste) {
          const row   = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('abrir_recrutamento').setLabel('SOLICITAR RECRUTAMENTO').setStyle(ButtonStyle.Secondary),
          );
          const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('RECRUTAMENTO')
            .setDescription('Clique no botão abaixo para solicitar seu recrutamento!');
          if (temLogo) embed.setThumbnail('attachment://pdelogo.png');
          await canalRec.send({ embeds: [embed], components: [row], files: logoFile });
        }
      }
    } catch (err) {
      console.error('[ready] Erro ao enviar mensagem de recrutamento:', err);
    }

    // ── Mensagem fixa de ticket ───────────────────────────────
    try {
      const canalTicket = await client.channels.fetch(config.canais.ticket).catch(() => null);
      if (canalTicket) {
        const msgs     = await canalTicket.messages.fetch({ limit: 20 });
        const jaExiste = msgs.some(m => m.author.id === client.user.id && m.components.length > 0);
        if (!jaExiste) {
          const row   = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('abrir_ticket').setLabel('ABRIR TICKET').setStyle(ButtonStyle.Secondary),
          );
          const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('SUPORTE — TICKET')
            .setDescription('Clique no botão abaixo para abrir um ticket e falar com nossa equipe.');
          if (temLogo) embed.setThumbnail('attachment://pdelogo.png');
          await canalTicket.send({ embeds: [embed], components: [row], files: logoFile });
        }
      }
    } catch (err) {
      console.error('[ready] Erro ao enviar mensagem de ticket:', err);
    }

    // ── Mensagem fixa de loja ────────────────────────────────
    try {
      const canalLoja = await client.channels.fetch(config.canais.loja).catch(() => null);
      if (canalLoja) {
        const msgs     = await canalLoja.messages.fetch({ limit: 20 });
        const jaExiste = msgs.some(m => m.author.id === client.user.id && m.components.length > 0);
        if (!jaExiste) {
          const row   = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('abrir_loja').setLabel('VER PRODUTOS').setStyle(ButtonStyle.Secondary),
          );
          const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('LOJA PDE')
            .setDescription('Clique no botão abaixo para ver os produtos disponíveis e realizar seu pedido!');
          if (temLogo) embed.setThumbnail('attachment://pdelogo.png');
          await canalLoja.send({ embeds: [embed], components: [row], files: logoFile });
        }
      }
    } catch (err) {
      console.error('[ready] Erro ao enviar mensagem de loja:', err);
    }

    // ── Mensagem fixa de gerenciamento da loja ───────────────
    try {
      const canalGerenc = await client.channels.fetch(config.canais.gerenciamentoLoja).catch(() => null);
      if (canalGerenc) {
        const msgs     = await canalGerenc.messages.fetch({ limit: 20 });
        const jaExiste = msgs.some(m => m.author.id === client.user.id && m.components.length > 0);
        if (!jaExiste) {
          const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('GERENCIAMENTO — LOJA')
            .setDescription('USE OS BOTÕES ABAIXO PARA GERENCIAR O ESTOQUE DA LOJA.\n\n**ADICIONAR** — CADASTRAR NOVO PRODUTO\n**REMOVER** — RETIRAR PRODUTO DO ESTOQUE\n**LISTAR** — VER TODOS OS PRODUTOS\n**EDITAR** — ALTERAR NOME, TAMANHOS, PREÇO OU IMAGEM');
          if (temLogo) embed.setThumbnail('attachment://pdelogo.png');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_produto_adicionar').setLabel('ADICIONAR').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_produto_remover').setLabel('REMOVER').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_produto_listar').setLabel('LISTAR').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_produto_editar').setLabel('EDITAR').setStyle(ButtonStyle.Secondary),
          );
          await canalGerenc.send({ embeds: [embed], components: [row], files: logoFile });
        }
      }
    } catch (err) {
      console.error('[ready] Erro ao enviar mensagem de gerenciamento:', err);
    }

    // ── Mensagem fixa de redes sociais ───────────────────────
    try {
      const canalRedes = await client.channels.fetch(config.canais.redesSociais).catch(() => null);
      if (canalRedes) {
        const msgs     = await canalRedes.messages.fetch({ limit: 20 });
        const jaExiste = msgs.some(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (!jaExiste) {
          const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('REDES SOCIAIS — PDE FIEL BAIXADA')
            .setDescription('ACESSE TODAS AS NOSSAS REDES SOCIAIS ABAIXO:\n\n[**INSTAGRAM**](https://www.instagram.com/pdefielbaixada/)');
          if (temLogo) embed.setThumbnail('attachment://pdelogo.png');
          await canalRedes.send({ embeds: [embed], files: logoFile });
        }
      }
    } catch (err) {
      console.error('[ready] Erro ao enviar mensagem de redes sociais:', err);
    }
  },
};
