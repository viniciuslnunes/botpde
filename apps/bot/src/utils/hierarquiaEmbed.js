const { getBotConfig, setBotConfig } = require('./botConfig');
const path = require('path');
const config = require('../config');

const LOGO_PATH      = path.join(__dirname, '../../img/logo.png');
const CANAL_HIERARQUIA = config.canais.hierarquia;
const CONFIG_KEY       = 'hierarquia_message_id';
const HIERARQUIA       = config.hierarquia;

async function getHierarquiaMessageId() {
  return getBotConfig(CONFIG_KEY);
}

async function setHierarquiaMessageId(id) {
  await setBotConfig(CONFIG_KEY, id);
}

function construirEmbed(guild) {
  const fields = [];

  for (const cargo of HIERARQUIA) {
    const membros = guild.members.cache.filter(m => m.roles.cache.has(cargo.id));
    if (!membros.size) continue;

    let lista = '';
    membros.forEach(m => { lista += `<@${m.id}>\n`; });
    if (lista.length > 1024) lista = lista.substring(0, 1021) + '...';

    fields.push({ name: `${cargo.label} (${membros.size})`, value: lista.trim(), inline: false });
  }

  return {
    color: 0x000000,
    title: '🏅 HIERARQUIA',
    fields: fields.length ? fields : [{ name: 'SEM MEMBROS', value: 'Nenhum membro encontrado.', inline: false }],
    thumbnail: { url: 'attachment://logo.png' },
    footer:    { text: `Atualizado em ${new Date().toLocaleString('pt-BR')}` },
    timestamp: new Date().toISOString(),
  };
}

async function atualizarHierarquia(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch({ withPresences: false, force: true }).catch(() => {});

    const embed  = construirEmbed(guild);
    const canal  = await client.channels.fetch(CANAL_HIERARQUIA);
    if (!canal) return;

    const messageId = await getHierarquiaMessageId();

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
    await setHierarquiaMessageId(sent.id);
  } catch (err) {
    console.error('[hierarquia] Erro ao atualizar:', err);
  }
}

module.exports = { atualizarHierarquia, HIERARQUIA };
