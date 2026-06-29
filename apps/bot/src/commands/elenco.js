const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('elenco')
    .setDescription('Lista todos os membros com o cargo de elenco'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      await interaction.guild.members.fetch({ withPresences: false, force: true });
    } catch (err) {
      console.error('[elenco] Erro ao buscar membros:', err);
    }

    const membros = interaction.guild.members.cache.filter(m => m.roles.cache.has(config.cargos.elenco));

    if (!membros.size) return interaction.editReply('Nenhum membro encontrado no elenco.');

    let desc = '';
    let i    = 1;
    membros.forEach(m => { desc += `${i++}. <@${m.id}>\n`; });
    if (desc.length > 4096) desc = desc.substring(0, 4093) + '...';

    await interaction.editReply({
      embeds: [{
        color: 0x000000,
        title: '🏅 ELENCO',
        description: desc,
        footer: { text: `Total: ${membros.size} membros` },
      }],
      allowedMentions: { users: [] },
    });
  },
};
