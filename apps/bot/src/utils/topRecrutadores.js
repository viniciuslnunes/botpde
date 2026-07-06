const db   = require('./db');
const { getBotConfig, setBotConfig } = require('./botConfig');
const config = require('../config');

const CANAL_TOP = config.canais.topRecrutadores;
const CONFIG_KEY = 'top_recrutadores_message_id';

// Guard: não executa se o canal ainda não foi configurado
function canalConfigurado() {
  return CANAL_TOP && !CANAL_TOP.startsWith('ID_');
}

async function getTopMessageId() {
  return getBotConfig(CONFIG_KEY);
}

async function setTopMessageId(id) {
  await setBotConfig(CONFIG_KEY, id);
}

async function construirEmbed() {
  const result = await db.query(
    'SELECT aprovador_id, COUNT(*) as total FROM aprovacoes_recrutamento GROUP BY aprovador_id ORDER BY total DESC LIMIT 25',
  );
  const rows = result.rows;

  let descricao = '';
  for (let i = 0; i < rows.length; i++) {
    const { aprovador_id, total } = rows[i];
    descricao += `${i + 1}. <@${aprovador_id}> — **${total} APROVAÇÕES**\n`;
  }
  if (!descricao) descricao = '*NENHUMA APROVAÇÃO REGISTRADA AINDA.*';
  if (descricao.length > 4096) descricao = descricao.substring(0, 4093) + '...';

  return {
    color: 0x000000,
    title: '🏆 TOP RECRUTADORES',
    description: descricao,
    footer:    { text: `Total: ${rows.length} recrutador${rows.length !== 1 ? 'es' : ''}` },
    timestamp: new Date().toISOString(),
  };
}

async function atualizarTopRecrutadores(client) {
  if (!canalConfigurado()) return;
  try {
    const canal = await client.channels.fetch(CANAL_TOP);
    if (!canal) return;

    const embed     = await construirEmbed();
    const messageId = await getTopMessageId();

    if (messageId) {
      try {
        const msg = await canal.messages.fetch(messageId);
        await msg.edit({ embeds: [embed], allowedMentions: { users: [] } });
        return;
      } catch {
        // mensagem deletada — recriar
      }
    }

    const sent = await canal.send({ embeds: [embed], allowedMentions: { users: [] } });
    await setTopMessageId(sent.id);
  } catch (err) {
    console.error('[topRecrutadores] Erro ao atualizar:', err);
  }
}

module.exports = { atualizarTopRecrutadores };
