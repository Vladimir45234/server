const { Pool } = require('pg');

let pool = null;

const getDbConnection = async () => {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'social_user',
      password: process.env.DB_PASSWORD || 'minodo95',
      database: process.env.DB_NAME || 'sociality',
      port: process.env.DB_PORT || 5432,
      max: 10,
    });

    try {
      await pool.query('SELECT 1'); // проверка соединения без явного подключения клиента
      console.log('✅ Пул подключений к PostgreSQL создан!');
    } catch (err) {
      console.error('❌ Ошибка подключения к PostgreSQL:', err);
    }
  }
  return pool;
};


module.exports = getDbConnection;