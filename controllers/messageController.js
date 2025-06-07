const getDbConnection = require('../config/db');

module.exports = (io) => ({
  async getMessages(req, res) {
    const { chatId } = req.params;

    try {
      const connection = await getDbConnection();
      const { rows } = await connection.query(
        'SELECT * FROM messages WHERE chat_id = $1 ORDER BY timestamp ASC',
        [chatId]
      );

      const messages = rows.map(msg => ({
        messageId: msg.message_id,
        chatId: msg.chat_id,
        senderId: msg.sender_id,
        text: msg.text,
        createdAt: msg.timestamp instanceof Date
          ? msg.timestamp.toISOString()
          : new Date(msg.timestamp).toISOString(),
      }));

      res.json({ messages });
    } catch (err) {
      console.error('Ошибка при получении сообщений:', err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  },

  async getLastMessageId(req, res) {
    const { chatId } = req.params;

    try {
      const connection = await getDbConnection();
      const { rows } = await connection.query(
        'SELECT MAX(message_id) AS "lastMessageId" FROM messages WHERE chat_id = $1',
        [chatId]
      );

      const lastMessageId = rows[0].lastMessageId || null;
      res.status(200).json({ lastMessageId });
    } catch (err) {
      console.error('Ошибка при получении последнего message_id:', err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  },

  async updateMessage(req, res) {
    const { messageId } = req.params;
    const { text } = req.body;

    try {
      const connection = await getDbConnection();

      await connection.query(
        'UPDATE messages SET text = $1 WHERE message_id = $2',
        [text, messageId]
      );

      const { rows } = await connection.query(
        'SELECT chat_id FROM messages WHERE message_id = $1',
        [messageId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Сообщение не найдено' });
      }

      const chatId = rows[0].chat_id;
      const roomId = `chat_${chatId}`;

      io.to(roomId).emit('updateMessage', { messageId, text });
      res.json({ message: 'Сообщение обновлено' });
    } catch (err) {
      console.error('Ошибка при обновлении сообщения:', err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  },

  async deleteMessage(req, res) {
    const { messageId } = req.params;

    try {
      const connection = await getDbConnection();

      const { rows } = await connection.query(
        'SELECT chat_id FROM messages WHERE message_id = $1',
        [messageId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Сообщение не найдено' });
      }

      const chatId = rows[0].chat_id;

      await connection.query(
        'DELETE FROM messages WHERE message_id = $1',
        [messageId]
      );

      io.to(`chat_${chatId}`).emit('deleteMessage', { messageId });
      res.json({ message: 'Сообщение удалено' });
    } catch (err) {
      console.error('Ошибка при удалении сообщения:', err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  },

  async sendMessage(req, res) {
    const { chatId, senderId, receiverId, text } = req.body;

    if (!chatId || !senderId || !receiverId || !text) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    try {
      const connection = await getDbConnection();

      // Проверка на блокировку
      const { rows: blockedRows } = await connection.query(
        `SELECT 1 FROM users_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $3 AND blocked_id = $4) LIMIT 1`,
        [senderId, receiverId, receiverId, senderId]
      );

      if (blockedRows.length > 0) {
        return res.status(403).json({ message: 'Отправка сообщений запрещена — пользователь заблокирован' });
      }

      // Вставка нового сообщения с RETURNING для получения id и других полей
      const { rows: insertRows } = await connection.query(
        'INSERT INTO messages (chat_id, sender_id, text) VALUES ($1, $2, $3) RETURNING message_id, chat_id, sender_id, text, timestamp',
        [chatId, senderId, text]
      );

      if (insertRows.length === 0) {
        return res.status(500).json({ message: 'Ошибка при вставке сообщения' });
      }

      const newMessage = insertRows[0];

      // Увеличиваем unread_count получателю
      await connection.query(
        `INSERT INTO chat_unread (chat_id, user_id, unread_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (chat_id, user_id) DO UPDATE SET unread_count = chat_unread.unread_count + 1`,
        [chatId, receiverId]
      );

      const { rows: unreadRows } = await connection.query(
        'SELECT unread_count FROM chat_unread WHERE chat_id = $1 AND user_id = $2',
        [chatId, receiverId]
      );
      const unreadCountReceiver = unreadRows[0]?.unread_count || 0;

      const createdAtISO = newMessage.timestamp instanceof Date
        ? newMessage.timestamp.toISOString()
        : new Date(newMessage.timestamp).toISOString();

      io.to(`chat_${chatId}`).emit('newMessage', {
        messageId: newMessage.message_id,
        chatId: newMessage.chat_id,
        senderId: newMessage.sender_id,
        text: newMessage.text,
        createdAt: createdAtISO,
      });

      res.status(201).json({ message: newMessage });
    } catch (err) {
      console.error('Ошибка при отправке сообщения:', err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  }
});
