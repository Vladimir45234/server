const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: 'Необходима авторизация' });
  }
  next();
};


module.exports = requireAuth;
