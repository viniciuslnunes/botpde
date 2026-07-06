/**
 * Client Prisma compartilhado (@torcida/db) — base para a migração
 * progressiva dos call-sites de pg cru pra Prisma (ver ARCHITECTURE.md,
 * Fase 1 de unificação de dados).
 *
 * @torcida/db é um pacote ESM ("type": "module"); apps/bot é CommonJS.
 * require() direto de ESM não é portável entre versões de Node (só
 * Node 22+ suporta require(esm) de forma estável, e o deploy do bot não
 * fixa uma versão exata) — por isso o import é dinâmico (import()), que
 * funciona em qualquer versão com suporte a ES modules. Isso torna getDb()
 * assíncrono: os call-sites migrados fazem `const db = await getDb()`
 * antes de usar, uma única vez por chamada (o import fica em cache depois
 * da primeira resolução, então não há custo repetido).
 */

let dbPromise

function getDb() {
  if (!dbPromise) {
    dbPromise = import('@torcida/db').then((mod) => mod.db)
  }
  return dbPromise
}

module.exports = { getDb }
