const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('validarid')
    .setDescription('Valida se um ID está impedido de ser recrutado')
    .addStringOption(option =>
      option.setName('id').setDescription('ID para consultar').setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const idBusca = interaction.options.getString('id').trim();
    const canal   = interaction.guild.channels.cache.get(config.canais.historicoNaoRec);

    if (!canal) return interaction.reply({ content: '❌ Canal de histórico não configurado.', flags: 64 });

    await interaction.deferReply({ flags: 64 });
    const msgs = await canal.messages.fetch({ limit: 100 });
    let bloqueado = null;

    msgs.forEach(msg => {
      if (msg.embeds && msg.embeds.length > 0) {
        const embed  = msg.embeds[0];
        const idField = embed.fields?.find(f => f.name === 'ID');
        if (idField && idField.value.trim() === idBusca) bloqueado = embed;
      }
    });

    if (bloqueado) {
      return interaction.editReply({
        embeds: [{ color: 0xFF0000, title: '🚫 ID BLOQUEADO — NÃO RECRUTAR', fields: bloqueado.fields ?? [] }],
      });
    }

    return interaction.editReply({ content: `✅ ID **${idBusca}** não encontrado na lista de bloqueados.` });
  },
};
