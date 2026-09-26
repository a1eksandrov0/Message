const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ОБЯЗАТЕЛЬНО: Поддержка JSON-тел запросов
app.use(express.json());
app.use(express.static('public'));

// ⚠️ ВАЖНО: Подставьте свои реальные данные из панели Supabase!
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Генерация случайного 6-значного ID
function generateShortId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==================== REST API ====================

// Регистрация нового аккаунта
app.post('/api/register', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Пароль обязателен' });
    }

    let newId;
    let isUnique = false;

    // Генерируем уникальный ID
    while (!isUnique) {
      newId = generateShortId();
      const { data } = await supabase.from('users').select('id').eq('id', newId).single();
      if (!data) isUnique = true;
    }

    // Сохраняем пользователя в таблице users
    const { error } = await supabase
      .from('users')
      .insert([{ id: newId, password }]);

    if (error) {
      console.error('Ошибка записи в Supabase:', error);
      return res.status(500).json({ error: 'Ошибка сервера при создании пользователя' });
    }

    return res.json({ id: newId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Ошибка соединения с сервером' });
  }
});

// Авторизация (Вход)
app.post('/api/login', async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    if (user.password !== password) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }

    return res.json({ id: user.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Ошибка соединения с сервером' });
  }
});

// Получение всей истории сообщений для диалогов
app.get('/api/messages/:myId/all', async (req, res) => {
  try {
    const { myId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

// Получение чата с конкретным собеседником
app.get('/api/messages/:myId/:partnerId', async (req, res) => {
  try {
    const { myId, partnerId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка загрузки чата' });
  }
});

// ==================== SOCKET.IO ====================

const userSockets = {};

io.on('connection', (socket) => {
  socket.on('register_socket', (userId) => {
    userSockets[userId] = socket.id;
    socket.userId = userId;

    // Передаем текущий список онлайн
    const onlineList = Object.keys(userSockets);
    socket.emit('initial_online_list', onlineList);

    // Уведомляем остальных о подлючении
    socket.broadcast.emit('user_online_status', { userId, isOnline: true });
  });

  socket.on('send_message', async ({ sender_id, receiver_id, text }) => {
    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id, receiver_id, text }])
      .select()
      .single();

    if (!error && data) {
      const receiverSocketId = userSockets[receiver_id];
      const isReceiverOnline = !!receiverSocketId;

      if (isReceiverOnline) {
        io.to(receiverSocketId).emit('receive_message', data);
      }

      socket.emit('message_sent', {
        ...data,
        isRead: isReceiverOnline
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      delete userSockets[socket.userId];
      io.emit('user_online_status', { userId: socket.userId, isOnline: false });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер успешно запущен на порту ${PORT}`));
