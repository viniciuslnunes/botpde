const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const path   = require('path');
const config = require('../config');

const LOGO_PATH = path.join(__dirname, '../../img/logo.png');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Bot online como ${client.user.tag}`);

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
            .setDescription('Clique no botão abaixo para solicitar seu recrutamento!')
            .setThumbnail('attachment://logo.png');
          await canalRec.send({ embeds: [embed], components: [row], files: [{ attachment: LOGO_PATH, name: 'logo.png' }] });
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
            new ButtonBuilder().setCustomId('abrir_ticket').setLabel('🎫 ABRIR TICKET').setStyle(ButtonStyle.Secondary),
          );
          const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('🎫 SUPORTE — TICKET')
            .setDescription('Clique no botão abaixo para abrir um ticket e falar com nossa equipe.');
          await canalTicket.send({ embeds: [embed], components: [row] });
        }
      }
    } catch (err) {
      console.error('[ready] Erro ao enviar mensagem de ticket:', err);
    }
  },
};
