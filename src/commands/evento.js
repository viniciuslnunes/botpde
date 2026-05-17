const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Cria um evento com lista de confirmação de presença'),

  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId('modal_evento').setTitle('Criar Evento');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('titulo').setLabel('Título do Evento').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('horario').setLabel('Horário').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50),
      ),
    );

    await interaction.showModal(modal);
  },
};
