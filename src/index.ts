import { Telegraf, Markup } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import http from 'http';
import cron from 'node-cron';

dotenv.config();

// Dummy Web Server for Render
http.createServer((req, res) => {
  res.write('Advanced Master Bot is running!');
  res.end();
}).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN || '');
const ADMIN_ID = process.env.ADMIN_ID || '';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Database Auto-Setup for Groups
const setupDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channels (
      chat_id BIGINT PRIMARY KEY,
      title TEXT,
      exam_pref TEXT DEFAULT 'UPPSC',
      is_active BOOLEAN DEFAULT TRUE
    )
  `);
};
setupDatabase();

// 1. START COMMAND
bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || 'student';

  try {
    await pool.query(
      'INSERT INTO users (telegram_id, username) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, username]
    );
    ctx.reply('नमस्ते! स्मार्ट AI क्विज़ प्लेटफॉर्म में आपका स्वागत है।\n\n/quiz - क्विज़ शुरू करें\n/generate - नया प्रश्न बनाएं');
  } catch (err) {
    console.error(err);
  }
});

// 2. MASTER ADMIN PANEL
bot.command('admin', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) {
    return ctx.reply('❌ आप इस बॉट के एडमिन नहीं हैं।');
  }
  
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const questions = await pool.query('SELECT COUNT(*) FROM questions');
    const channels = await pool.query('SELECT COUNT(*) FROM channels');

    const stats = `👑 **MASTER ADMIN PANEL** 👑\n\n` +
                  `👥 कुल यूज़र्स: ${users.rows[0].count}\n` +
                  `📚 कुल प्रश्न: ${questions.rows[0].count}\n` +
                  `📢 लिंक्ड चैनल्स/ग्रुप्स: ${channels.rows[0].count}\n\n` +
                  `मैन्युअल ऑटो-पोस्ट ट्रिगर करने के लिए /forcepost दबाएं।`;
    
    ctx.replyWithMarkdown(stats);
  } catch (error) {
    ctx.reply('Admin panel error.');
  }
});

// 3. SETUP CHANNEL/GROUP (किसी भी ग्रुप में ऑटो-पोस्टिंग चालू करने के लिए)
bot.command('setupgroup', async (ctx) => {
  // यह कमांड सिर्फ ग्रुप या चैनल में काम करेगा
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ यह कमांड किसी ग्रुप या चैनल में इस्तेमाल करें।');
  }

  const chatId = ctx.chat.id;
  const title = ctx.chat.title;

  try {
    await pool.query(
      'INSERT INTO channels (chat_id, title) VALUES ($1, $2) ON CONFLICT (chat_id) DO NOTHING',
      [chatId, title]
    );
    ctx.reply(`✅ बेहतरीन! "${title}" अब Auto-Posting के लिए रजिस्टर हो गया है। अब यहाँ समय-समय पर क्विज़ आएंगे।`);
  } catch (error) {
    ctx.reply('❌ ग्रुप सेट करने में एरर आई।');
  }
});

// 4. CORE AI GENERATOR (फंक्शन जिसे हम टाइमर से बुलाएंगे)
const generateAndBroadcast = async () => {
  console.log('Auto-Posting Triggered...');
  try {
    const prompt = `Generate 1 multiple choice question for UPPSC or UPSC exam in Hindi. 
    STRICT RULES:
    - question_text MUST be under 250 characters.
    - options MUST be under 80 characters each.
    - explanation MUST be under 180 characters.
    Return ONLY a raw JSON object (no markdown) with exact keys: 
    exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option (A, B, C, or D), explanation, difficulty.`;

    const apiKey = process.env.GEMINI_API_KEY;
    const modelsToTry = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    let successData = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0]) {
          successData = data;
          break; 
        }
      } catch (err) {}
    }

    if (!successData) return console.log('All AI models failed during auto-post.');

    let jsonString = successData.candidates[0].content.parts[0].text.trim();
    if (jsonString.startsWith('```json')) jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
    else if (jsonString.startsWith('```')) jsonString = jsonString.replace(/^```\n/, '').replace(/\n```$/, '');

    const q = JSON.parse(jsonString);

    // Save to Database
    await pool.query(
      `INSERT INTO questions (exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, language) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Hindi')`,
      [q.exam_type, q.subject, q.chapter || 'Misc', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.charAt(0), q.explanation, q.difficulty]
    );

    // Broadcast to all registered Groups/Channels
    const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
    const options = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.correct_option.toUpperCase().charAt(0));

    for (const channel of channels.rows) {
      try {
        await bot.telegram.sendQuiz(
          channel.chat_id, 
          q.question_text.substring(0, 290), 
          options, 
          { correct_option_id: correctIndex !== -1 ? correctIndex : 0, explanation: q.explanation ? q.explanation.substring(0, 190) : 'व्याख्या नहीं है' }
        );
      } catch (err) {
        console.error(`Failed to send to ${channel.chat_id}`);
      }
    }
  } catch (error) {
    console.error('Auto Post Error:', error);
  }
};

// 5. AUTOMATION SCHEDULER (Cron Job) - हर 2 घंटे में ऑटोमैटिक पोस्ट
cron.schedule('0 */2 * * *', () => {
  generateAndBroadcast();
});

// Admin Command to Force Post immediately
bot.command('forcepost', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  ctx.reply('🚀 सभी ग्रुप्स में नया क्विज़ जनरेट करके भेजा जा रहा है...');
  await generateAndBroadcast();
  ctx.reply('✅ ब्रॉडकास्ट पूरा हुआ!');
});

// Normal User Commands
bot.command('generate', async (ctx) => {
  ctx.reply('कृपया /admin पैनल से ऑटोमेशन का उपयोग करें, या समय का इंतज़ार करें।');
});

bot.command('quiz', async (ctx) => {
  // Existing quiz logic for direct messages...
  try {
    const res = await pool.query('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1');
    if (res.rows.length === 0) return ctx.reply('कोई प्रश्न नहीं है।');
    const q = res.rows[0];
    const options = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
    await ctx.replyWithQuiz(q.question_text.substring(0, 290), options, { correct_option_id: correctIndex !== -1 ? correctIndex : 0, explanation: q.explanation ? q.explanation.substring(0, 190) : '' });
  } catch (error) {
    ctx.reply('एरर आई।');
  }
});

bot.launch({ dropPendingUpdates: true }).then(() => {
  console.log('Master Bot is running with Auto-Posting capabilities!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
