require('dotenv').config();
const express = require('express');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sharedSession = require('express-socket.io-session');

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const usersRoutes = require('./routes/usersRoutes');

const userRoutes = require('./routes/userRoutes');
const sessionMiddleware = require('./config/session');
const path = require('path');

const app = express();
const server = https.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://izmerenie.netlify.app/',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;
const userSockets = new Map();
const disconnectTimeouts = new Map(); 

const messageRoutes = require('./routes/messageRoutes')(io);

app.use(cors({ origin: 'https://izmerenie.netlify.app/', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(sessionMiddleware);

// Подключаем сессии к Socket.IO
io.use(sharedSession(sessionMiddleware, {
  autoSave: true,
}));

// Routes
app.use('/api', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/user', userRoutes, express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Предположим, есть middleware, который кладёт текущего пользователя в req.user



// Socket.IO
require('./socket')(io, userSockets, disconnectTimeouts);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
