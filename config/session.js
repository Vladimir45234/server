const session = require('express-session');

const sessionMiddleware = session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, 
    sameSite: 'lax',   
    maxAge: 1000 * 60 * 60 * 24, 
  }
});

module.exports = sessionMiddleware;