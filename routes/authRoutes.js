const express = require('express');
const {
  registerUser,
  loginUser,
  updateUsername,
  logoutUser,
  getCurrentUser
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/me', getCurrentUser);


module.exports = router;
