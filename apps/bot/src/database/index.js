const { Pool } = require('pg');

// Pool único do bot (consumido também via ../utils/db, que reexporta este
// módulo). `max: 5` explícito para não somar com o pool do web no limite de
// conexões do Postgres no Railway.
// SSL sempre ativo: comportamento do pool que estava em uso (utils/db.js);
// o proxy público do Railway exige TLS mesmo sem NODE_ENV=production.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] Erro inesperado no pool do PostgreSQL:', err);
});

// Testa a conexão ao iniciar
pool.query('SELECT 1').then(() => {
  console.log('[db] Conexão com PostgreSQL estabelecida com sucesso.');
}).catch(err => {
  console.error('[db] FALHA AO CONECTAR NO POSTGRESQL:', err.message);
});

module.exports = pool;
