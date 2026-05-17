const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { atualizarMural } = require('../utils/muralAssociados');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mural')
    .setDescription('Atualiza o mural de associados no canal dedicado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    try {
      await atualizarMural(interaction.client);
      await interaction.editReply({ content: '✅ Mural de associados atualizado!' });
    } catch (err) {
      console.error('[mural] Erro:', err);
      await interaction.editReply({ content: '❌ Erro ao atualizar o mural. Tente novamente.' });
    }
  },
};
