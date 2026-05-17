const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bloquearid')
    .setDescription('Adiciona um novo ID à lista de não recrutar')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    if (interaction.channelId !== config.canais.naoRecrutar) {
      return interaction.reply({ content: `Use este comando apenas no canal correto.`, flags: 64 });
    }

    const modal = new ModalBuilder().setCustomId('modal_bloquearid').setTitle('Bloquear novo ID');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(10),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('motivo').setLabel('Motivo do bloqueio').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(4).setMaxLength(200),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('prova').setLabel('Prova (link ou descrição)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200),
      ),
    );

    await interaction.showModal(modal);
  },
};
