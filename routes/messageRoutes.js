const express = require('express');

module.exports = (io) => {
  const router = express.Router();
  const controller = require('../controllers/messageController')(io);

  router.get('/:chatId', controller.getMessages);
  router.get('/:chatId/lastMessageId', controller.getLastMessageId);
  router.put('/:messageId', controller.updateMessage);
  router.delete('/:messageId', controller.deleteMessage);
  router.post('/', controller.sendMessage);

  return router;
};
