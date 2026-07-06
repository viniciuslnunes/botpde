const db   = require('./db');
const { getBotConfig, setBotConfig } = require('./botConfig');
const path = require('path');
const config = require('../config');

const LOGO_PATH = path.join(__dirname, '../../img/logo.png');
const LOGO_FILE = { attachment: LOGO_PATH, name: 'logo.png' };
const CAPA_PATH = path.join(__dirname, '../../img/capa.png');
const CAPA_FILE = { attachment: CAPA_PATH, name: 'capa.png' };

const CANAL_MURAL = config.canais.mural;
const CONFIG_KEY  = 'mural_associados_message_id';

async function getMuralMessageId() {
  return getBotConfig(CONFIG_KEY);
}

async function setMuralMessageId(id) {
  await setBotConfig(CONFIG_KEY, id);
}

function construirEmbed(rows) {
  const MAX_DESC = 3900;
  let descricao  = '';

  for (const s of rows) {
    const num   = String(s.numero_socio).padStart(2, '0');
    const linha = `**SÓCIO Nº ${num}** — ${s.nome}\n`;
    if ((descricao + linha).length > MAX_DESC) {
      descricao += '*… e mais*';
      break;
    }
    descricao += linha;
  }

  if (!descricao) descricao = '*Nenhum sócio registrado ainda.*';

  return {
    color: 0x000000,
    title: '📋 MURAL DE ASSOCIADOS',
    description: descricao,
    thumbnail: { url: 'attachment://logo.png' },
    image:     { url: 'attachment://capa.png' },
    footer:    { text: `Total: ${rows.length} sócio${rows.length !== 1 ? 's' : ''}` },
    timestamp: new Date().toISOString(),
  };
}

async function atualizarMural(client) {
  const res  = await db.query('SELECT numero_socio, nome FROM socios ORDER BY numero_socio ASC');
  const rows = res.rows;
  const embed = construirEmbed(rows);

  const canal     = await client.channels.fetch(CANAL_MURAL);
  const messageId = await getMuralMessageId();

  if (messageId) {
    try {
      const msg = await canal.messages.fetch(messageId);
      await msg.edit({ embeds: [embed], files: [LOGO_FILE, CAPA_FILE], allowedMentions: { users: [] } });
      return;
    } catch {
      // mensagem não existe mais — envia nova abaixo
    }
  }

  const nova = await canal.send({ embeds: [embed], files: [LOGO_FILE, CAPA_FILE], allowedMentions: { users: [] } });
  await setMuralMessageId(nova.id);
}

module.exports = { atualizarMural };
