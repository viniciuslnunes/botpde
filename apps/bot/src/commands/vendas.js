const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../utils/prisma');
const config = require('../config');

async function gerarEmbedVendas() {
  const db = await getDb();

  const grupos = await db.botPedido.groupBy({
    by: ['produtoNome', 'tamanho'],
    where: { status: 'confirmado' },
    _sum: { quantidade: true, total: true },
    orderBy: [{ produtoNome: 'asc' }, { tamanho: 'asc' }],
  });

  const totalGeral = await db.botPedido.aggregate({
    where: { status: 'confirmado' },
    _sum: { total: true },
    _count: true,
  });
  const montante   = totalGeral._sum.total ?? 0;
  const qtd_vendas = totalGeral._count;

  const linhas = grupos.map(r =>
    `**${r.produtoNome.toUpperCase()}** — ${r.tamanho === 'UN' ? 'ÚNICO' : r.tamanho.toUpperCase()}: ${r._sum.quantidade} un. — R$ ${Number(r._sum.total).toFixed(2)}`,
  );

  return {
    color: 0x000000,
    title: 'RESUMO DE VENDAS',
    description: linhas.length ? linhas.join('\n') : '*Nenhuma venda confirmada ainda.*',
    fields: [
      { name: 'TOTAL DE VENDAS', value: String(qtd_vendas),                          inline: true },
      { name: 'MONTANTE TOTAL',  value: `R$ ${Number(montante).toFixed(2)}`,          inline: true },
    ],
    footer: { text: `Atualizado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` },
  };
}

async function atualizarResumoVendas(client) {
  try {
    const canal = await client.channels.fetch(config.canais.resumoVendas).catch(() => null);
    if (!canal) return;
    const embed = await gerarEmbedVendas();
    const msgs  = await canal.messages.fetch({ limit: 10 });
    const msgBot = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (msgBot) {
      await msgBot.edit({ embeds: [embed] });
    } else {
      await canal.send({ embeds: [embed] });
    }
  } catch (e) {
    console.error('[vendas] Erro ao atualizar resumo:', e);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vendas')
    .setDescription('Exibe o resumo de vendas e atualiza o canal de montante')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  atualizarResumoVendas,

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const embed = await gerarEmbedVendas();
    await atualizarResumoVendas(interaction.client);
    return interaction.editReply({ embeds: [embed] });
  },
};
