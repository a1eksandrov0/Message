// Генерация свободного ID для формы регистрации
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

// Регистрация с четко переданным ID
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
