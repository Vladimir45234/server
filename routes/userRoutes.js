const express = require('express');
const router = express.Router();
const { getProfile, logoutUser, getCurrentUser, updateUsername, uploadAvatar } = require('../controllers/userController');
const requireAuth = require('../middlewares/auth');
const upload = require('../middlewares/uploadAvatar');

// Профиль пользователя (только для авторизованных)
router.get('/profile', requireAuth, getProfile);

// Получить текущего пользователя (для проверки сессии)
router.get('/current-user', getCurrentUser);

// Выход
router.post('/logout', logoutUser);

// Загрузка аватара (только для авторизованных)
router.post('/upload-avatar', requireAuth, upload.single('avatar'), uploadAvatar);

router.put('/update', requireAuth, updateUsername)

module.exports = router;