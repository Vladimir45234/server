const getDbConnection = require('../config/db'); // Должен возвращать клиент pg с async/await

const searchUsers = async (req, res) => {
  const pool = await getDbConnection();  // Получаем пул
  const client = await pool.connect();   // Берём клиента из пула
  try {
    const result = await client.query('SELECT id, username, avatar FROM users');
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Ошибка при получении пользователей:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  } finally {
    client.release();  // Освобождаем клиента
  }
};


const getUserById = async (req, res) => {
  const client = await getDbConnection();
  const userId = req.params.id;

  try {
    const result = await client.query(
      'SELECT id, username, avatar FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Ошибка при получении пользователя:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

const blockUser = async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: 'Пользователь не авторизован' });
  }

  const blockerId = req.session.user.id;
  const { userId: blockedUserId } = req.body;

  if (!blockedUserId) {
    return res.status(400).json({ error: 'userId обязателен' });
  }

  if (blockerId === blockedUserId) {
    return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
  }

  const client = await getDbConnection();

  try {
    // В PostgreSQL нет INSERT IGNORE, используем ON CONFLICT DO NOTHING
    const result = await client.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING
       RETURNING *`,
      [blockerId, blockedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Пользователь уже заблокирован' });
    }

    res.json({ message: 'Пользователь заблокирован' });
  } catch (error) {
    console.error('Ошибка при блокировке пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

const unblockUser = async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ message: 'Пользователь не авторизован' });
  }

  const blockerId = req.session.user.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'UserId обязателен' });
  }

  const client = await getDbConnection();

  try {
    const result = await client.query(
      'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [blockerId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Блокировка не найдена' });
    }

    return res.status(200).json({ message: 'Пользователь разблокирован' });
  } catch (err) {
    console.error('Ошибка при разблокировке пользователя:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  } finally {
    client.release();
  }
};

module.exports = { searchUsers, getUserById, blockUser, unblockUser };
