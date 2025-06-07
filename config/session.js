const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // строка подключения к Supabase
  ssl: {
    rejectUnauthorized: false,  // нужно для Supabase SSL
  },
});

const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // в продакшене cookie только по https
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24,
  },
});

module.exports = sessionMiddleware;
