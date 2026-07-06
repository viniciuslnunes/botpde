const { getDb } = require('./prisma')

/**
 * Helper único de leitura/escrita da tabela bot_config (key/value), via
 * Prisma. Substitui o padrão idêntico que estava duplicado em 5 arquivos
 * (elenco, hierarquiaEmbed, muralAssociados, quadroRecrutadores,
 * topRecrutadores) — ver ARCHITECTURE.md, Fase 1 de unificação de dados.
 */

async function getBotConfig(key) {
  const db = await getDb()
  const row = await db.botConfig.findUnique({ where: { key } })
  return row?.value ?? null
}

async function setBotConfig(key, value) {
  const db = await getDb()
  await db.botConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

module.exports = { getBotConfig, setBotConfig }
