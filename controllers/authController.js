const bcrypt = require('bcrypt'); // если понадобится
const getDbConnection = require('../config/db');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const registerUser = async (req, res) => {
  const { key, username } = req.body;

  if (!key || !username) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  try {
    const pool = await getDbConnection();

    const hashedKey = hashKey(key);

    // Проверка существования пользователя
    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR user_key = $2',
      [username, hashedKey]
    );

    if (result.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким ником или ключом уже существует' });
    }

    // Сохраняем пользователя и получаем id
    const insertResult = await pool.query(
        'INSERT INTO users (user_key, username, avatar) VALUES ($1, $2, $3) RETURNING id',
      [hashedKey, username, null]
    );

    const userId = insertResult.rows[0].id;

    // Создание папки пользователя
    const uploadsBasePath = path.join(__dirname, '..', 'uploads', 'users');
    await fs.mkdir(uploadsBasePath, { recursive: true });

    const userFolderPath = path.join(uploadsBasePath, String(userId));
    await fs.mkdir(userFolderPath, { recursive: true });

    // Копирование аватара по умолчанию
    const defaultAvatarPath = path.join(__dirname, '..', 'uploads', 'default-avatar.webp');
    const userAvatarPath = path.join(userFolderPath, 'avatar.webp');
    await fs.copyFile(defaultAvatarPath, userAvatarPath);

    const avatarDbPath = path.join('/uploads', 'users', String(userId), 'avatar.webp');

    // Обновляем путь к аватару
    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarDbPath, userId]);

    // Получаем нового пользователя
    const userResult = await pool.query(
      'SELECT id, username, avatar FROM users WHERE id = $1',
      [userId]
    );
    const newUser = userResult.rows[0];

    // Создаём сессию
    req.session.userId = newUser.id;
    req.session.user = newUser;

    res.status(201).json({ message: 'Пользователь успешно зарегистрирован', user: newUser });
  } catch (err) {
    console.error('Ошибка при регистрации:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const loginUser = async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Ключ обязателен' });
  }

  try {
    const hashedKey = hashKey(key);

    const pool = await getDbConnection();
    const result = await pool.query(
      'SELECT id, username, avatar FROM users WHERE user_key = $1',
      [hashedKey]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Пользователь с таким ключом не найден' });
    }

    const user = result.rows[0];

    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
    };

    res.status(200).json({ message: 'Успешный вход', user: req.session.user });
  } catch (err) {
    console.error('Ошибка при входе:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const logoutUser = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Ошибка при выходе:', err);
      return res.status(500).json({ error: 'Ошибка выхода' });
    }

    res.clearCookie('connect.sid');
    res.json({ message: 'Выход выполнен' });
  });
};

const getCurrentUser = (req, res) => {
  if (req.session.userId && req.session.user) {
    res.status(200).json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Не авторизован' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
};
