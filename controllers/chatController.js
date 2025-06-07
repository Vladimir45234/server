const getDbConnection = require('../config/db');

// Создать или получить чат между двумя пользователями
const createOrGetChat = async (req, res) => {
  const user1_id = req.session.user?.id;
  const { user2_id } = req.body;

  if (!user1_id || !user2_id) {
    return res.status(400).json({ message: 'Оба пользователя обязательны' });
  }

  try {
    const pool = await getDbConnection();

    // Проверяем, есть ли уже чат между user1 и user2 (в любом порядке)
    const existingChatResult = await pool.query(
      `SELECT * FROM chats WHERE 
       (user1_id = $1 AND user2_id = $2) OR 
       (user1_id = $2 AND user2_id = $1)`,
      [user1_id, user2_id]
    );

    if (existingChatResult.rows.length > 0) {
      return res.status(200).json({ chat: existingChatResult.rows[0], existed: true });
    }

    // Если нет — создаём новый чат
    const insertResult = await pool.query(
      `INSERT INTO chats (user1_id, user2_id) VALUES ($1, $2) RETURNING *`,
      [user1_id, user2_id]
    );

    const newChat = insertResult.rows[0];

    res.status(201).json({ chat: newChat, created: true });
  } catch (error) {
    console.error('Ошибка при создании чата:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Получить все чаты пользователя с последним сообщением и данными партнёра
const getUserChats = async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Необходимо войти в систему' });
  }

  try {
    const pool = await getDbConnection();

    const query = `
      SELECT
        c.*,
        m.text AS "lastMessage",
        m.timestamp AS "lastMessageTime",
        m.sender_id AS "lastMessageUserId",
        COALESCE(cu.unread_count, 0) AS "unreadCount",
        u.id AS "partnerId",
        u.username AS "partnerUsername",
        u.avatar AS "partnerAvatar",
        u.is_online AS "partnerOnline",
        u.last_seen AS "partnerLastSeen"
      FROM chats c
      LEFT JOIN (
        SELECT m1.*
        FROM messages m1
        INNER JOIN (
          SELECT chat_id, MAX(id) AS max_message_id
          FROM messages
          GROUP BY chat_id
        ) m2 ON m1.id = m2.max_message_id
      ) m ON c.id = m.chat_id
      LEFT JOIN chat_unread cu ON cu.chat_id = c.id AND cu.user_id = $1
      JOIN users u ON u.id = CASE 
        WHEN c.user1_id = $1 THEN c.user2_id
        ELSE c.user1_id
      END
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY m.timestamp DESC;
    `;

    const { rows: chats } = await pool.query(query, [userId]);

    return res.status(200).json({ chats });
  } catch (err) {
    console.error('Ошибка при получении чатов:', err);
    return res.status(500).json({ message: 'Ошибка при получении чатов' });
  }
};

// Получить статус блокировки в чате
const getBlockStatus = async (req, res) => {
  const userId = req.session.user.id;
  const { chatId } = req.params;

  try {
    const pool = await getDbConnection();

    const chatResult = await pool.query(
      'SELECT user1_id, user2_id FROM chats WHERE id = $1',
      [chatId]
    );

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const chat = chatResult.rows[0];
    let partnerId = null;
    if (chat.user1_id === userId) partnerId = chat.user2_id;
    else if (chat.user2_id === userId) partnerId = chat.user1_id;
    else return res.status(403).json({ error: 'Вы не участник этого чата' });

    const blockResult = await pool.query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId, partnerId]
    );

    const isBlocked = blockResult.rows.length > 0;

    res.json({ isBlocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить информацию о чате и партнере
const getChatInfo = async (req, res) => {
  const { chatId } = req.params;
  const userId = req.session.user?.id || req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Не авторизован' });
  }

  try {
    const pool = await getDbConnection();

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const chat = chatResult.rows[0];

    if (chat.user1_id !== userId && chat.user2_id !== userId) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;

    const usersResult = await pool.query(
      'SELECT id, username, avatar, last_seen, is_online FROM users WHERE id = $1',
      [partnerId]
    );

    if (usersResult.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const partner = usersResult.rows[0];

    const blockedByPartnerResult = await pool.query(
      `SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1`,
      [partnerId, userId]
    );

    const blockedByMeResult = await pool.query(
      `SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1`,
      [userId, partnerId]
    );

    const blockedByPartner = blockedByPartnerResult.rows.length > 0;
    const blockedByMe = blockedByMeResult.rows.length > 0;

    return res.status(200).json({ partner: { ...partner, blockedByPartner, blockedByMe } });
  } catch (err) {
    console.error('Ошибка getChatInfo:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Удаление чата
const deleteChat = async (req, res) => {
  const { chatId } = req.params;
  const userId = req.session.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Необходимо войти в систему' });
  }

  try {
    const pool = await getDbConnection();

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const chat = chatResult.rows[0];

    if (chat.user1_id !== userId && chat.user2_id !== userId) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    await pool.query('DELETE FROM chats WHERE id = $1', [chatId]);

    return res.status(200).json({ message: 'Чат успешно удалён' });
  } catch (error) {
    console.error('Ошибка при удалении чата:', error);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Отметить чат как прочитанный
const markChatRead = async (io, userId, chatId, lastReadMessageId) => {
  try {
    const pool = await getDbConnection();

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return;

    const chat = chatResult.rows[0];
    const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;

    // В PostgreSQL вместо ON DUPLICATE KEY UPDATE используется UPSERT через ON CONFLICT
    await pool.query(
      `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (chat_id, user_id) DO UPDATE 
         SET last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id)`,
      [chatId, userId, lastReadMessageId]
    );

    const sockets = userSockets.get(partnerId);
    if (sockets) {
      for (const socketId of sockets) {
        io.to(socketId).emit('chatRead', { chatId, userId, lastReadMessageId });
      }
    }
  } catch (err) {
    console.error('Ошибка markChatRead:', err);
  }
};

module.exports = { 
  getUserChats, 
  createOrGetChat, 
  getChatInfo, 
  deleteChat, 
  markChatRead, 
  getBlockStatus 
};
