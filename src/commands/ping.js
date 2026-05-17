const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde com a latência do bot.'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Calculando ping...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    await interaction.editReply(
      `🏓 Pong!\n**Latência:** ${latency}ms\n**API:** ${apiLatency}ms`,
    );
  },
};
