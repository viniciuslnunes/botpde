const { getBotConfig, setBotConfig } = require('./botConfig');
const path = require('path');
const config = require('../config');

const LOGO_PATH       = path.join(__dirname, '../../img/logo.png');
const CANAL_QUADRO    = config.canais.quadroRecrutadores;
const CONFIG_KEY      = 'quadro_recrutadores_message_id';
const CARGO_RECRUTADOR = config.cargos.recrutador;

async function getQuadroMessageId() {
  return getBotConfig(CONFIG_KEY);
}

async function setQuadroMessageId(id) {
  await setBotConfig(CONFIG_KEY, id);
}

function construirEmbed(guild) {
  const membros = guild.members.cache.filter(m => m.roles.cache.has(CARGO_RECRUTADOR));

  let descricao = '';
  membros.forEach(m => { descricao += `<@${m.id}>\n`; });
  if (!descricao) descricao = '*NENHUM RECRUTADOR REGISTRADO.*';
  if (descricao.length > 4096) descricao = descricao.substring(0, 4093) + '...';

  return {
    color: 0x000000,
    title: '📋 QUADRO DE RECRUTADORES',
    description: descricao,
    thumbnail: { url: 'attachment://logo.png' },
    footer:    { text: `TOTAL: ${membros.size} RECRUTADOR${membros.size !== 1 ? 'ES' : ''}` },
    timestamp: new Date().toISOString(),
  };
}

async function atualizarQuadroRecrutadores(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch({ withPresences: false, force: true }).catch(() => {});

    const embed     = construirEmbed(guild);
    const canal     = await client.channels.fetch(CANAL_QUADRO);
    if (!canal) return;

    const messageId = await getQuadroMessageId();

    if (messageId) {
      try {
        const msg = await canal.messages.fetch(messageId);
        await msg.edit({ embeds: [embed], files: [{ attachment: LOGO_PATH, name: 'logo.png' }], allowedMentions: { users: [] } });
        return;
      } catch {
        // mensagem deletada — recriar
      }
    }

    const sent = await canal.send({ embeds: [embed], files: [{ attachment: LOGO_PATH, name: 'logo.png' }], allowedMentions: { users: [] } });
    await setQuadroMessageId(sent.id);
  } catch (err) {
    console.error('[quadroRecrutadores] Erro ao atualizar:', err);
  }
}

module.exports = { atualizarQuadroRecrutadores, CARGO_RECRUTADOR };
