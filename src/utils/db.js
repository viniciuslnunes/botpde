const { Pool } = require('pg');

const sslRequired = process.env.DATABASE_URL?.includes('railway') ||
                    process.env.DATABASE_URL?.includes('rlwy') ||
                    process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslRequired ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

module.exports = pool;
