const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const DB_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function hash(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Генерация ID
app.get("/api/generate-id", (req, res) => {
  const users = loadUsers();
  let id;
  do {
    id = "MSG-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (users[id]);
  res.json({ id });
});

// Регистрация
app.post("/api/register", (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) {
    return res.status(400).json({ error: "ID и пароль обязательны" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль минимум 6 символов" });
  }
  const users = loadUsers();
  if (users[id]) {
    return res.status(409).json({ error: "Такой ID уже существует" });
  }
  users[id] = { password: hash(password), createdAt: Date.now() };
  saveUsers(users);
  res.json({ id });
});

// Логин
app.post("/api/login", (req, res) => {
  const { id, password } = req.body || {};
  const users = loadUsers();
  const user = users[id];
  if (!user || user.password !== hash(password)) {
    return res.status(401).json({ error: "Неверный ID или пароль" });
  }
  res.json({ id });
});

app.listen(3000, () => {
  console.log("Открой в браузере: http://localhost:3000");
});
