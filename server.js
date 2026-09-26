const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Инициализация Supabase (ключи берутся из переменных окружения на Render)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());

// Раздаем статические файлы из папки public (где лежит твой index.html)
app.use(express.static(path.join(__dirname, 'public')));

// 1. Генерация свободного ID для формы регистрации
app.get('/api/generate-id', async (req, res) => {
  try {
    let newId;
    let isUnique = false;

    while (!isUnique) {
      newId = Math.floor(100000 + Math.random() * 900000).toString();
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('id', newId)
        .maybeSingle();

      if (!data) isUnique = true;
    }

    return res.json({ id: newId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Ошибка генерации ID' });
  }
});

// 2. Регистрация с четко переданным ID
app.post('/api/register', async (req, res) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({ error: 'Не указан ID или пароль' });
    }

    const cleanId = String(id).trim();
    const cleanPassword = String(password).trim();

    // Проверяем, что ID всё еще свободен
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: 'Этот ID уже занят, перегенерируйте' });
    }

    // Сохраняем в Supabase
    const { error } = await supabase
      .from('users')
      .insert([{ id: cleanId, password: cleanPassword }]);

    if (error) {
      console.error('Ошибка записи в Supabase:', error);
      return res.status(500).json({ error: 'Ошибка сохранения в базу' });
    }

    return res.json({ id: cleanId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 3. Логин (проверка пользователя)
app.post('/api/login', async (req, res) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({ error: 'Введите ID и пароль' });
    }

    const cleanId = String(id).trim();
    const cleanPassword = String(password).trim();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', cleanId)
      .eq('password', cleanPassword)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ error: 'Неверный ID или пароль' });
    }

    return res.json({ id: user.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
