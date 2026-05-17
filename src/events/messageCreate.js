const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    if (message.content === '!parceiros') {
      const embed = {
        color: 0x000000,
        title: '🤝 PARCEIROS',
        description: 'Conheça nossos parceiros clicando nos botões abaixo!',
      };
      // Adicione os parceiros conforme necessário
      await message.channel.send({ embeds: [embed] });
    }
  },
};
