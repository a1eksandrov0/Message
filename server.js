const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/register', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
  }

  let uniqueID = generateID();
  let isUnique = false;

  while (!isUnique) {
    const { data } = await supabase.from('users').select('id').eq('id', uniqueID);
    if (!data || data.length === 0) {
      isUnique = true;
    } else {
      uniqueID = generateID();
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const { error } = await supabase.from('users').insert([{ id: uniqueID, password: hashedPassword }]);

  if (error) return res.status(500).json({ error: 'Ошибка БД' });
  res.json({ id: uniqueID });
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();

  if (error || !data) {
    return res.status(400).json({ error: 'Неверный ID или пароль' });
  }

  const validPassword = await bcrypt.compare(password, data.password);
  if (!validPassword) {
    return res.status(400).json({ error: 'Неверный ID или пароль' });
  }

  res.json({ success: true, id: data.id });
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  res.json(data);
});

const userSockets = {};

io.on('connection', (socket) => {
  socket.on('register_socket', (userId) => {
    userSockets[userId] = socket.id;
  });

  socket.on('send_message', async ({ sender_id, receiver_id, text }) => {
    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id, receiver_id, text }])
      .select()
      .single();

    if (!error && data) {
      const receiverSocketId = userSockets[receiver_id];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', data);
      }
      socket.emit('message_sent', data);
    }
  });

  socket.on('disconnect', () => {
    for (const [id, socketId] of Object.entries(userSockets)) {
      if (socketId === socket.id) {
        delete userSockets[id];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
