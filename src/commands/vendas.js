const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db     = require('../utils/db');
const config = require('../config');

async function gerarEmbedVendas() {
  const res = await db.query(`
    SELECT
      produto_nome,
      tamanho,
      SUM(quantidade)  AS total_qtd,
      SUM(total)       AS total_valor
    FROM pedidos
    WHERE status = 'confirmado'
    GROUP BY produto_nome, tamanho
    ORDER BY produto_nome, tamanho
  `);

  const totalGeral = await db.query(`SELECT COALESCE(SUM(total),0) AS montante, COUNT(*) AS qtd_vendas FROM pedidos WHERE status = 'confirmado'`);
  const { montante, qtd_vendas } = totalGeral.rows[0];

  const linhas = res.rows.map(r =>
    `**${r.produto_nome.toUpperCase()}** — ${r.tamanho === 'UN' ? 'ÚNICO' : r.tamanho.toUpperCase()}: ${r.total_qtd} un. — R$ ${Number(r.total_valor).toFixed(2)}`,
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
