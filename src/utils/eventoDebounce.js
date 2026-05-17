const { EmbedBuilder } = require('discord.js');

const EMOJI_CONFIRMAR = '✅';
const locks = new Map(); // messageId -> { busy, queued }

async function _doUpdate(message) {
  const confirmar = message.reactions.cache.get(EMOJI_CONFIRMAR);
  const recusar   = message.reactions.cache.get('❌');

  const confirmados = confirmar
    ? (await confirmar.users.fetch()).filter(u => !u.bot).map(u => `<@${u.id}>`)
    : [];
  const recusados = recusar
    ? (await recusar.users.fetch()).filter(u => !u.bot).map(u => `<@${u.id}>`)
    : [];

  const embed = EmbedBuilder.from(message.embeds[0])
    .setFields(
      { name: `${EMOJI_CONFIRMAR} Confirmados (${confirmados.length})`, value: confirmados.join('\n') || '*nenhum*', inline: true },
      { name: `❌ Recusados (${recusados.length})`, value: recusados.join('\n') || '*nenhum*', inline: true },
    );

  await message.edit({ embeds: [embed] });
}

async function atualizarListaEvento(message) {
  const id = message.id;

  if (!locks.has(id)) locks.set(id, { busy: false, queued: false });
  const lock = locks.get(id);

  if (lock.busy) {
    lock.queued = true;
    return;
  }

  lock.busy = true;
  try {
    await _doUpdate(message);
  } catch (err) {
    console.error('[eventoDebounce] Erro ao atualizar lista:', err);
  } finally {
    if (lock.queued) {
      lock.queued = false;
      lock.busy   = false;
      atualizarListaEvento(message);
    } else {
      lock.busy = false;
    }
  }
}

module.exports = { atualizarListaEvento };
