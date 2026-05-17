const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const path   = require('path');
const config = require('../config');

const LOGO_PATH = path.join(__dirname, '../../img/logo.png');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enviarrecrutamento')
    .setDescription('Envia manualmente o botão de recrutamento no canal configurado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('abrir_recrutamento').setLabel('SOLICITAR RECRUTAMENTO').setStyle(ButtonStyle.Secondary),
    );
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('RECRUTAMENTO')
      .setDescription('Clique no botão abaixo para solicitar seu recrutamento!');

    const fs = require('node:fs');
    const temLogo = fs.existsSync(LOGO_PATH);
    if (temLogo) embed.setThumbnail('attachment://logo.png');

    const canal = await interaction.client.channels.fetch(config.canais.recrutamento);
    const payload = { embeds: [embed], components: [row] };
    if (temLogo) payload.files = [{ attachment: LOGO_PATH, name: 'logo.png' }];
    await canal.send(payload);
    await interaction.reply({ content: 'Botão de recrutamento enviado!', flags: 64 });
  },
};
