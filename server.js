const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "db.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {}, chats: {} };
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    db.users = db.users || {};
    db.chats = db.chats || {};
    return db;
  } catch {
    return { users: {}, chats: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hash(p) {
  return crypto.createHash("sha256").update(p).digest("hex");
}

function chatKey(a, b) {
  return [a, b].sort().join("_");
}

// --- API ---

app.get("/api/generate-id", (req, res) => {
  const db = loadDB();
  let id, tries = 0;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
    tries++;
    if (tries > 2000) return res.status(500).json({ error: "Ошибка генерации ID" });
  } while (db.users[id]);
  res.json({ id });
});

app.post("/api/register", (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: "ID и пароль обязательны" });
  if (!/^\d{6}$/.test(id)) return res.status(400).json({ error: "ID — 6 цифр" });
  if (password.length < 6) return res.status(400).json({ error: "Пароль минимум 6 символов" });

  const db = loadDB();
  if (db.users[id]) return res.status(409).json({ error: "Такой ID уже существует" });
  db.users[id] = { password: hash(password), createdAt: Date.now(), name: "Пользователь " + id };
  saveDB(db);
  res.json({ id, name: db.users[id].name });
});

app.post("/api/login", (req, res) => {
  const { id, password } = req.body || {};
  const db = loadDB();
  const user = db.users[id];
  if (!user || user.password !== hash(password)) {
    return res.status(401).json({ error: "Неверный ID или пароль" });
  }
  res.json({ id, name: user.name || ("Пользователь " + id) });
});

// Поиск пользователя по ID
app.get("/api/user/:id", (req, res) => {
  const db = loadDB();
  const user = db.users[req.params.id];
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  res.json({ id: req.params.id, name: user.name || ("Пользователь " + req.params.id) });
});

// Сохранить имя
app.post("/api/user/name", (req, res) => {
  const { id, password, name } = req.body || {};
  const db = loadDB();
  const user = db.users[id];
  if (!user || user.password !== hash(password)) return res.status(401).json({ error: "Не авторизован" });
  user.name = String(name || "").slice(0, 40) || ("Пользователь " + id);
  saveDB(db);
  res.json({ id, name: user.name });
});

// Получить список диалогов пользователя
app.get("/api/chats/:id", (req, res) => {
  const db = loadDB();
  const me = req.params.id;
  const result = [];
  for (const key of Object.keys(db.chats)) {
    if (!key.includes(me)) continue;
    const [a, b] = key.split("_");
    const other = a === me ? b : a;
    const msgs = db.chats[key];
    const last = msgs[msgs.length - 1];
    result.push({
      with: other,
      name: (db.users[other] && db.users[other].name) || ("Пользователь " + other),
      last: last ? last.text : "",
      time: last ? last.time : 0,
    });
  }
  result.sort((x, y) => y.time - x.time);
  res.json(result);
});

// Получить сообщения диалога
app.get("/api/messages/:me/:other", (req, res) => {
  const db = loadDB();
  const key = chatKey(req.params.me, req.params.other);
  res.json(db.chats[key] || []);
});

// Отправить сообщение
app.post("/api/messages", (req, res) => {
  const { from, to, text } = req.body || {};
  if (!from || !to || !text) return res.status(400).json({ error: "Нужны from, to, text" });
  const db = loadDB();
  if (!db.users[from] || !db.users[to]) return res.status(404).json({ error: "Пользователь не найден" });
  const key = chatKey(from, to);
  if (!db.chats[key]) db.chats[key] = [];
  const msg = { from, to, text: String(text).slice(0, 2000), time: Date.now() };
  db.chats[key].push(msg);
  saveDB(db);
  res.json(msg);
});

// --- Фронтенд ---

app.use(express.static(PUBLIC_DIR));

app.get(["/", "/index.html"], (req, res) => {
  if (!fs.existsSync(INDEX_FILE)) return res.status(500).send("index.html не найден");
  res.sendFile(INDEX_FILE);
});

app.use((req, res) => {
  if (fs.existsSync(INDEX_FILE)) return res.sendFile(INDEX_FILE);
  res.status(404).send("Not found");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
