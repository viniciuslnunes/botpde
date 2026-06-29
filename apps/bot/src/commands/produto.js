const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { listarProdutos, adicionarProduto, removerProduto, atualizarProduto } = require('../utils/loja');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('produto')
    .setDescription('Gerenciamento de produtos da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('adicionar').setDescription('Adicionar novo produto'))
    .addSubcommand(s => s.setName('remover').setDescription('Remover produto do estoque'))
    .addSubcommand(s => s.setName('listar').setDescription('Listar todos os produtos'))
    .addSubcommand(s =>
      s.setName('editar_preco')
        .setDescription('Editar preço de um produto')
        .addIntegerOption(o => o.setName('id').setDescription('ID do produto').setRequired(true))
        .addStringOption(o => o.setName('preco').setDescription('Novo preço (ex: 89.90)').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'adicionar') {
      const modal = new ModalBuilder().setCustomId('modal_produto_add').setTitle('Adicionar Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('nome').setLabel('NOME DO PRODUTO').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('tamanhos').setLabel('TAMANHOS (separados por vírgula)').setPlaceholder('P,M,G,GG ou ÚNICO').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('preco').setLabel('PREÇO (ex: 89.90)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10),
        ),
      );
      return interaction.showModal(modal);
    }

    if (sub === 'remover') {
      const produtos = await listarProdutos(false).catch(() => []);
      const ativos   = produtos.filter(p => p.ativo);
      if (!ativos.length) return interaction.reply({ content: '❌ Nenhum produto ativo no estoque.', flags: 64 });

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_remover_produto')
        .setPlaceholder('Selecione o produto para remover')
        .addOptions(ativos.slice(0, 25).map(p => ({
          label: `${p.nome} — R$ ${Number(p.preco).toFixed(2)}`,
          value: String(p.id),
        })));
      return interaction.reply({ content: '🗑️ Selecione o produto:', components: [new ActionRowBuilder().addComponents(select)], flags: 64 });
    }

    if (sub === 'listar') {
      const produtos = await listarProdutos(false).catch(() => []);
      if (!produtos.length) return interaction.reply({ content: '📦 Nenhum produto cadastrado.', flags: 64 });

      const fields = produtos.map(p => ({
        name: `${p.ativo ? '🟢' : '🔴'} [#${p.id}] ${p.nome}`,
        value: `Tamanhos: \`${p.tamanhos}\` | Preço: \`R$ ${Number(p.preco).toFixed(2)}\``,
        inline: false,
      }));

      return interaction.reply({
        embeds: [{ color: 0x000000, title: '📦 ESTOQUE — PRODUTOS', fields }],
        flags: 64,
      });
    }

    if (sub === 'editar_preco') {
      const id    = interaction.options.getInteger('id');
      const preco = interaction.options.getString('preco');
      const val   = parseFloat(preco.replace(',', '.'));
      if (isNaN(val) || val <= 0) return interaction.reply({ content: '❌ Preço inválido.', flags: 64 });
      const p = await atualizarProduto(id, { preco: val }).catch(() => null);
      if (!p) return interaction.reply({ content: '❌ Produto não encontrado.', flags: 64 });
      return interaction.reply({ content: `✅ Preço de **${p.nome}** atualizado para R$ ${val.toFixed(2)}.`, flags: 64 });
    }
  },
};
