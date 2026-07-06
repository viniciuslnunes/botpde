const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

async function jaTemBotao(canal, client) {
  try {
    const msgs = await canal.messages.fetch({ limit: 10 });
    return msgs.some(m => m.author.id === client.user.id && m.components.length > 0);
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-botoes')
    .setDescription('Envia as mensagens fixas com botões em todos os canais configurados')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const client = interaction.client;
    const guild  = interaction.guild;
    let enviados = 0;

    // Canal de ticket
    const canalTicket = guild.channels.cache.get(config.canais.ticket);
    if (canalTicket && !await jaTemBotao(canalTicket, client)) {
      await canalTicket.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('🎫 SUPORTE — TICKET').setDescription('Clique no botão abaixo para abrir um ticket e falar com nossa equipe.')],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('abrir_ticket').setLabel('🎫 ABRIR TICKET').setStyle(ButtonStyle.Secondary))],
      });
      enviados++;
    }

    // Canal de advertências de membros
    const canalAdv = guild.channels.cache.get(config.canais.advertencia);
    if (canalAdv && !await jaTemBotao(canalAdv, client)) {
      await canalAdv.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('⛔ ADVERTÊNCIAS').setDescription('Use os botões abaixo para registrar ou remover uma advertência de um membro.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('abrir_registrar_advertencia').setLabel('⛔ REGISTRAR ADVERTÊNCIA').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('abrir_remover_advertencia').setLabel('✅ REMOVER ADVERTÊNCIA').setStyle(ButtonStyle.Secondary),
        )],
      });
      enviados++;
    }

    // Canal de advertências de recrutadores
    const canalAdvRec = guild.channels.cache.get(config.canais.advRecrutadores);
    if (canalAdvRec && !await jaTemBotao(canalAdvRec, client)) {
      await canalAdvRec.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('⛔ ADVERTÊNCIAS DE RECRUTADORES').setDescription('Use os botões abaixo para registrar ou remover uma advertência de um recrutador.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('abrir_registrar_adv_rec').setLabel('⛔ REGISTRAR ADVERTÊNCIA').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('abrir_remover_adv_rec').setLabel('✅ REMOVER ADVERTÊNCIA').setStyle(ButtonStyle.Secondary),
        )],
      });
      enviados++;
    }

    // Canal de não-recrutar (botões de bloquear/validar ID)
    const canalNaoRec = guild.channels.cache.get(config.canais.naoRecrutar);
    if (canalNaoRec && !await jaTemBotao(canalNaoRec, client)) {
      await canalNaoRec.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('🚫 NÃO RECRUTAR').setDescription('Use os botões abaixo para bloquear ou validar um ID.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('abrir_bloquearid').setLabel('🚫 BLOQUEAR ID').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('abrir_validarid').setLabel('🔍 VALIDAR ID').setStyle(ButtonStyle.Secondary),
        )],
      });
      enviados++;
    }

    await interaction.editReply({ content: `✅ Setup concluído! ${enviados} mensagem(ns) enviada(s).` });
  },
};
