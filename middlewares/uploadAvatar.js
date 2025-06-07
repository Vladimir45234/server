const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const userId = req.session.user?.id; // Проверка авторизации
    if (!userId) {
      return cb(new Error('Неавторизованный пользователь'));
    }
    const uploadPath = path.join(__dirname, '..', 'uploads', 'users', String(userId));
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = crypto.randomBytes(16).toString('hex') + ext; // Уникальное имя файла
    cb(null, uniqueName);
  }
});

function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Только изображения разрешены'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 2 } // Ограничение 2 МБ
});

module.exports = upload;
