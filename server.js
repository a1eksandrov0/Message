const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// Инициализация Supabase (укажите свои URL и KEY)
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Сопоставление userId -> socket.id
const userSockets = {};

io.on('connection', (socket) => {
  
  // Регистрация пользователя в сокетах
  socket.on('register_socket', (userId) => {
    userSockets[userId] = socket.id;
    socket.userId = userId;

    // 1. Отправляем новому клиенту СПИСОК всех, кто сейчас онлайн
    const onlineList = Object.keys(userSockets);
    socket.emit('initial_online_list', onlineList);

    // 2. Оповещаем ВСЕХ остальные подключённых, что этот ID зашел в сеть
    socket.broadcast.emit('user_online_status', { userId, isOnline: true });
  });

  // Отправка сообщения
  socket.on('send_message', async ({ sender_id, receiver_id, text }) => {
    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id, receiver_id, text }])
      .select()
      .single();

    if (!error && data) {
      const receiverSocketId = userSockets[receiver_id];
      const isReceiverOnline = !!receiverSocketId;

      // Если получатель в сети — сразу отправляем ему сообщение
      if (isReceiverOnline) {
        io.to(receiverSocketId).emit('receive_message', data);
      }

      // Отправляем подтверждение отправителю с флагом прочтения/доставки
      socket.emit('message_sent', {
        ...data,
        isRead: isReceiverOnline
      });
    }
  });

  // Обработка отключения пользователя
  socket.on('disconnect', () => {
    if (socket.userId) {
      delete userSockets[socket.userId];
      // Оповещаем всех, что пользователь вышел из сети
      io.emit('user_online_status', { userId: socket.userId, isOnline: false });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
