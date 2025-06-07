const express = require('express');
const router = express.Router();
const {
  getUserChats,
  createOrGetChat,
  getChatInfo,
  deleteChat,
  markChatRead,
  getBlockStatus
} = require('../controllers/chatController');
const requireAuth = require('../middlewares/auth');

router.post('/create', requireAuth, createOrGetChat);
router.get('/my-chats', requireAuth, getUserChats);
router.get('/:chatId/info', requireAuth, getChatInfo);
router.delete('/:chatId', requireAuth, deleteChat);
router.get('/:chatId/block-status', requireAuth, getBlockStatus)
// Новый роут для отметки прочтения сообщений
router.post('/:chatId/read', requireAuth, markChatRead);



module.exports = router;
