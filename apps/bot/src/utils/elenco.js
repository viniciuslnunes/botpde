const { getBotConfig, setBotConfig } = require('./botConfig');
const path = require('path');
const config = require('../config');

const IMG_PATH   = path.join(__dirname, '../../img/elenco.png');
const CANAL_ELENCO = config.canais.elenco;
const CONFIG_KEY   = 'elenco_message_id';
const CARGO_ELENCO = config.cargos.elenco;

async function getElencoMessageId() {
  return getBotConfig(CONFIG_KEY);
}

async function setElencoMessageId(id) {
  await setBotConfig(CONFIG_KEY, id);
}

function construirEmbed(guild) {
  const membros = guild.members.cache.filter(m => m.roles.cache.has(CARGO_ELENCO));

  let descricao = '';
  let i = 1;
  membros.forEach(m => { descricao += `${i++}. <@${m.id}>\n`; });

  if (!descricao) descricao = '*NENHUM MEMBRO NO ELENCO.*';
  if (descricao.length > 4096) descricao = descricao.substring(0, 4093) + '...';

  return {
    color: 0x000000,
    title: '🏅 ELENCO',
    description: descricao,
    image:  { url: 'attachment://elenco.png' },
    footer: { text: `Total: ${membros.size} membros` },
    timestamp: new Date().toISOString(),
  };
}

async function atualizarElenco(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch({ withPresences: false, force: true }).catch(() => {});

    const embed  = construirEmbed(guild);
    const canal  = await client.channels.fetch(CANAL_ELENCO);
    if (!canal) return;

    const messageId = await getElencoMessageId();

    if (messageId) {
      try {
        const msg = await canal.messages.fetch(messageId);
        await msg.edit({ embeds: [embed], files: [{ attachment: IMG_PATH, name: 'elenco.png' }], allowedMentions: { users: [] } });
        return;
      } catch {
        // mensagem deletada — recriar
      }
    }

    const sent = await canal.send({ embeds: [embed], files: [{ attachment: IMG_PATH, name: 'elenco.png' }], allowedMentions: { users: [] } });
    await setElencoMessageId(sent.id);
  } catch (err) {
    console.error('[elenco] Erro ao atualizar:', err);
  }
}

module.exports = { atualizarElenco, CARGO_ELENCO };
