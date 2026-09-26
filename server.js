const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "users.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

console.log("ROOT:", ROOT);
console.log("INDEX_FILE:", INDEX_FILE);
console.log("Index exists:", fs.existsSync(INDEX_FILE));

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function hash(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// --- API ---

// ID из 6 случайных цифр
app.get("/api/generate-id", (req, res) => {
  const users = loadUsers();
  let id;
  let attempts = 0;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000)); // 100000..999999
    attempts++;
    if (attempts > 1000) {
      return res.status(500).json({ error: "Не удалось создать ID" });
    }
  } while (users[id]);
  res.json({ id });
});

app.post("/api/register", (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) {
    return res.status(400).json({ error: "ID и пароль обязательны" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль минимум 6 символов" });
  }
  if (!/^\d{6}$/.test(id)) {
    return res.status(400).json({ error: "ID должен состоять из 6 цифр" });
  }
  const users = loadUsers();
  if (users[id]) {
    return res.status(409).json({ error: "Такой ID уже существует" });
  }
  users[id] = { password: hash(password), createdAt: Date.now() };
  saveUsers(users);
  res.json({ id });
});

app.post("/api/login", (req, res) => {
  const { id, password } = req.body || {};
  const users = loadUsers();
  const user = users[id];
  if (!user || user.password !== hash(password)) {
    return res.status(401).json({ error: "Неверный ID или пароль" });
  }
  res.json({ id });
});

// --- Фронтенд ---

app.use(express.static(PUBLIC_DIR));

app.get(["/", "/index.html"], (req, res) => {
  if (!fs.existsSync(INDEX_FILE)) {
    return res.status(500).send("index.html не найден: " + INDEX_FILE);
  }
  res.sendFile(INDEX_FILE);
});

app.use((req, res) => {
  if (fs.existsSync(INDEX_FILE)) {
    return res.sendFile(INDEX_FILE);
  }
  res.status(404).send("Not found");
});

// --- Запуск ---

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});
