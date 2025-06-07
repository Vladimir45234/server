const getDbConnection = require('../config/db');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const getProfile = (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: 'Пользователь не авторизован' });
  }

  res.status(200).json({ user });
};

const getCurrentUser = (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: 'Необходима авторизация' });
  }

  res.status(200).json({ user });
};

const logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Ошибка при завершении сессии:', err);
      return res.status(500).json({ message: 'Ошибка при выходе' });
    }

    res.clearCookie('connect.sid'); // Очистим cookie сессии
    res.status(200).json({ message: 'Выход выполнен успешно' });
  });
};

const updateUsername = async (req, res) => {
  const { username } = req.body;
  const user = req.session.user;

  if (!username) return res.status(400).json({ error: 'Ник обязателен' });

  const client = await getDbConnection();

  try {
    const updateResult = await client.query(
      'UPDATE users SET username = $1 WHERE id = $2',
      [username, user.id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Получаем обновлённого пользователя
    const userResult = await client.query(
      'SELECT id, username, "key", avatar FROM users WHERE id = $1',
      [user.id]
    );
    const updatedUser = userResult.rows[0];

    // Обновляем сессию
    req.session.user = updatedUser;

    res.status(200).json({ user: updatedUser });
  } catch (err) {
    console.error('Ошибка обновления ника:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

const uploadAvatar = async (req, res) => {
  try {
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Файл не загружен' });
    }

    const uploadDir = path.join(__dirname, '..', 'uploads', 'users', `${user.id}`);
    const webpFileName = `${Date.now()}.webp`;
    const webpFilePath = path.join(uploadDir, webpFileName);

    // Создаем директорию, если её нет
    fs.mkdirSync(uploadDir, { recursive: true });

    // Конвертация и сохранение WebP
    await sharp(req.file.path)
      .resize(512, 512, { fit: 'cover' })
      .toFormat('webp')
      .toFile(webpFilePath);

    // Удаляем оригинальный файл
    fs.unlinkSync(req.file.path);

    const avatarPath = `/uploads/users/${user.id}/${webpFileName}`;

    const client = await getDbConnection();

    await client.query(
      'UPDATE users SET avatar = $1 WHERE id = $2',
      [avatarPath, user.id]
    );

    const userResult = await client.query(
      'SELECT id, username, "key", avatar FROM users WHERE id = $1',
      [user.id]
    );

    const updatedUser = userResult.rows[0];
    req.session.user = updatedUser;

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Ошибка загрузки аватара:', error);
    res.status(500).json({ message: 'Ошибка сервера при загрузке аватара' });
  }
};

module.exports = { getProfile, getCurrentUser, logoutUser, updateUsername, uploadAvatar };
