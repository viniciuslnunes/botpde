const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
