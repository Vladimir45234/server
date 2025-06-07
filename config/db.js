const { Pool } = require('pg');

let pool = null;

const getDbConnection = async () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // важно для Supabase SSL
      },
      max: 10,
    });

    try {
      await pool.query('SELECT 1'); // проверка соединения
      console.log('✅ Пул подключений к PostgreSQL создан!');
    } catch (err) {
      console.error('❌ Ошибка подключения к PostgreSQL:', err);
    }
  }
  return pool;
};

module.exports = getDbConnection;
