const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aprovar_recrutamento')
      .setLabel('APROVAR')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('reprovar_recrutamento')
      .setLabel('REPROVAR')
      .setStyle(ButtonStyle.Danger),
  ),
];
