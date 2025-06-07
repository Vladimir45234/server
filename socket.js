// socket.js
const getDbConnection = require('./config/db');

module.exports = (io, userSockets, disconnectTimeouts) => {
  io.on('connection', async (socket) => {
    const session = socket.handshake.session;
    if (!session || !session.userId) {
      console.log('No userId in session, disconnecting socket', socket.id);
      socket.disconnect();
      return;
    }

    const userId = session.userId;
    socket.userId = userId;

    if (userId) {
      socket.join(`user_${userId}`);
    }

    if (disconnectTimeouts.has(userId)) {
      clearTimeout(disconnectTimeouts.get(userId));
      disconnectTimeouts.delete(userId);
    }

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    socket.on('avatarUpdated', async ({ avatarUrl }) => {
      try {
        const client = await getDbConnection();

        // В Postgres query возвращает { rows: [...] }
        const { rows: chats } = await client.query(
          'SELECT id, user1_id, user2_id FROM chats WHERE user1_id = $1 OR user2_id = $1',
          [userId]
        );

        for (const chat of chats) {
          const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;

          for (const sockId of userSockets.get(partnerId) || []) {
            io.to(sockId).emit('partnerAvatarUpdated', {
              userId,
              avatarUrl,
            });
          }
        }
      } catch (err) {
        console.error('Ошибка при обновлении аватара:', err);
      }
    });

    socket.on('user_connected', async () => {
      try {
        const client = await getDbConnection();
        await client.query('UPDATE users SET is_online = TRUE WHERE id = $1', [userId]);
      } catch (err) {
        console.error('Ошибка в user_connected:', err);
      }
    });

    socket.on('user_disconnected', async () => {
      try {
        const client = await getDbConnection();
        await client.query('UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1', [userId]);
      } catch (err) {
        console.error('Ошибка в user_disconnected:', err);
      }
    });

    socket.on('startChatWithUser', async (toUserId, callback) => {
      try {
        const client = await getDbConnection();

        const { rows: existingChats } = await client.query(
          `SELECT id FROM chats 
           WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
          [userId, toUserId]
        );

        let chatId;
        if (existingChats.length > 0) {
          chatId = existingChats[0].id;
          // чат уже существует
        } else {
          const insertChat = await client.query(
            'INSERT INTO chats (user1_id, user2_id) VALUES ($1, $2) RETURNING id',
            [userId, toUserId]
          );
          chatId = insertChat.rows[0].id;

          await client.query(
            `INSERT INTO chat_unread (chat_id, user_id, unread_count) VALUES
              ($1, $2, 0),
              ($1, $3, 0)`,
            [chatId, userId, toUserId]
          );
        }

        socket.join(`chat_${chatId}`);
        callback({ status: 'ok', chatId });
      } catch (err) {
        console.error('Ошибка при создании чата:', err);
        callback({ status: 'error', message: 'Ошибка сервера' });
      }
    });

    socket.on('joinRoom', async (chatId) => {
      socket.join(`chat_${chatId}`);
      console.log(`Пользователь ${socket.id} присоединился к комнате ${chatId}`);

      try {
        const client = await getDbConnection();

        await client.query(
          'UPDATE chat_unread SET unread_count = 0 WHERE chat_id = $1 AND user_id = $2',
          [chatId, socket.userId]
        );

        const { rows: chatRows } = await client.query(
          `SELECT last_read_message_id, last_message_time, last_read_by_user_id FROM chats WHERE id = $1`,
          [chatId]
        );

        if (chatRows.length > 0) {
          const { last_read_message_id, last_message_time, last_read_by_user_id } = chatRows[0];

          io.to(socket.id).emit('updateLastMessage', {
            chatId,
            lastMessage: last_read_message_id,
            lastMessageUserId: last_read_by_user_id,
            lastMessageTime: last_message_time,
            unreadCount: 0,
          });
        }
      } catch (err) {
        console.error('Ошибка при сбросе unreadCount:', err);
      }
    });

    socket.on('deleteMessage', async ({ chatId, messageId }) => {
      try {
        const client = await getDbConnection();
        await client.query('DELETE FROM messages WHERE message_id = $1', [messageId]);
        io.to(`chat_${chatId}`).emit('deleteMessage', { messageId });
      } catch (err) {
        console.error('Ошибка при удалении сообщения:', err);
      }
    });

    socket.on('sendMessage', async (messageData, callback) => {
      const { chatId, text, messageId } = messageData;
      const userId = socket.userId;

      if (!chatId) {
        callback({ status: 'error', message: 'chatId обязателен' });
        return;
      }

      try {
        const client = await getDbConnection();

        const { rows: existingMessage } = await client.query(
          'SELECT 1 FROM messages WHERE message_id = $1',
          [messageId]
        );

        if (existingMessage.length > 0) {
          callback({ status: 'error', message: 'Это сообщение уже отправлено' });
          return;
        }

        const { rows: chatRows } = await client.query(
          'SELECT user1_id, user2_id FROM chats WHERE id = $1',
          [chatId]
        );

        if (chatRows.length === 0) {
          callback({ status: 'error', message: 'Чат не найден' });
          return;
        }

        const chat = chatRows[0];
        const { user1_id, user2_id } = chat;

        const { rows: blockRows } = await client.query(
          `SELECT blocker_id, blocked_id FROM user_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
          [user1_id, user2_id]
        );

        if (blockRows.length > 0) {
          callback({ status: 'blocked', message: 'Отправка сообщений запрещена из-за блокировки' });
          return;
        }

        const insertResult = await client.query(
          `INSERT INTO messages (chat_id, sender_id, text, message_id, timestamp)
           VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
          [chatId, userId, text, messageId]
        );

        await client.query(
          'UPDATE chats SET last_read_message_id = $1, last_message_time = NOW() WHERE id = $2',
          [text, chatId]
        );

        const recipientId = user1_id === userId ? user2_id : user1_id;

        const updateResult = await client.query(
          'UPDATE chat_unread SET unread_count = unread_count + 1 WHERE chat_id = $1 AND user_id = $2',
          [chatId, recipientId]
        );

        if (updateResult.rowCount === 0) {
          await client.query(
            'INSERT INTO chat_unread (chat_id, user_id, unread_count) VALUES ($1, $2, 1)',
            [chatId, recipientId]
          );
        }

        const { rows: updatedUnreadRows } = await client.query(
          'SELECT unread_count FROM chat_unread WHERE chat_id = $1 AND user_id = $2',
          [chatId, recipientId]
        );

        const unreadCountForRecipient = updatedUnreadRows.length > 0 ? updatedUnreadRows[0].unread_count : 0;

        const savedMessage = {
          id: insertResult.rows[0].id,
          chatId,
          senderId: userId,
          text,
          messageId,
          createdAt: new Date().toISOString(),
        };

        io.to(`chat_${chatId}`).emit('receiveMessage', savedMessage);

        for (const sockId of userSockets.get(recipientId) || []) {
          io.to(sockId).emit('updateLastMessage', {
            chatId,
            lastMessage: text,
            lastMessageUserId: userId,
            lastMessageTime: new Date().toISOString(),
            unreadCount: unreadCountForRecipient,
          });
        }

        callback({ status: 'ok' });
      } catch (err) {
        console.error('Ошибка при отправке сообщения:', err);
        callback({ status: 'error', message: 'Ошибка сервера' });
      }
    });

    socket.on('getUnreadCounts', async () => {
      try {
        const client = await getDbConnection();

        const { rows } = await client.query(
          'SELECT chat_id, unread_count FROM chat_unread WHERE user_id = $1',
          [userId]
        );

        const unreadCounts = {};
        for (const row of rows) {
          unreadCounts[row.chat_id] = row.unread_count;
        }

        socket.emit('unreadCounts', unreadCounts);
      } catch (err) {
        console.error('Ошибка при получении количества непрочитанных сообщений:', err);
        socket.emit('unreadCounts', {}); // На случай ошибки — пустой объект
      }
    });

    socket.on('markChatRead', async ({ chatId }, callback) => {
      try {
        const client = await getDbConnection();

        const { rows: lastMessages } = await client.query(
          `SELECT message_id, sender_id, text, timestamp
           FROM messages
           WHERE chat_id = $1
           ORDER BY timestamp DESC
           LIMIT 1`,
          [chatId]
        );

        const lastMessage = lastMessages[0];
        const lastMessageId = lastMessage?.message_id || null;
        const senderId = lastMessage?.sender_id || null;

        await client.query(
          'UPDATE chat_unread SET unread_count = 0 WHERE chat_id = $1 AND user_id = $2',
          [chatId, userId]
        );

        if (!lastMessageId || !senderId) {
          return callback?.({ status: 'ok' });
        }

        const { rows: currentReads } = await client.query(
          `SELECT last_read_message_id FROM chat_reads
           WHERE chat_id = $1 AND user_id = $2`,
          [chatId, userId]
        );

        const alreadyReadMessageId = currentReads[0]?.last_read_message_id;

        if (senderId !== userId && alreadyReadMessageId !== lastMessageId) {
          await client.query(
            `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (chat_id, user_id)
             DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id`,
            [chatId, userId, lastMessageId]
          );
        }

        const { rows: chatRows } = await client.query(
          'SELECT user1_id, user2_id FROM chats WHERE id = $1',
          [chatId]
        );

        const chatRow = chatRows[0];
        const partnerId = chatRow.user1_id === userId ? chatRow.user2_id : chatRow.user1_id;

        for (const sockId of userSockets.get(partnerId) || []) {
          io.to(sockId).emit('partnerReadMessages', {
            chatId,
            userId,
            lastReadMessageId: lastMessageId,
          });
        }

        callback?.({ status: 'ok' });
      } catch (err) {
        console.error('Ошибка при отметке прочитанности:', err);
        callback?.({ status: 'error', message: 'Ошибка сервера' });
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.userId;

      if (!userId) return;

      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socket.id);
        if (userSockets.get(userId).size === 0) {
          // Устанавливаем таймаут на обновление статуса оффлайн
          const timeout = setTimeout(async () => {
            try {
              const client = await getDbConnection();
              await client.query(
                'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1',
                [userId]
              );
              userSockets.delete(userId);
              disconnectTimeouts.delete(userId);
            } catch (err) {
              console.error('Ошибка при установке оффлайна:', err);
            }
          }, 5000); // 5 секунд

          disconnectTimeouts.set(userId, timeout);
        }
      }
    });
  });
};
