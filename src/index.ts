import { Telegraf } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import http from 'http';
import cron from 'node-cron';

dotenv.config();

// ---------------------------------------------------------
// 1. INITIALIZATION & SETUP
// ---------------------------------------------------------

// Dummy Web Server (Render को सोने से रोकने के लिए)
http.createServer((req, res) => {
  res.write('Advanced Master Bot is running smoothly!');
  res.end();
}).listen(process.env.PORT || 3000);

// Bot & Database Connection
const bot = new Telegraf(process.env.BOT_TOKEN || '');
const ADMIN_ID = process.env.ADMIN_ID || '';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Database Auto-Setup
const setupDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channels (
      chat_id BIGINT PRIMARY KEY,
      title TEXT,
      exam_pref TEXT DEFAULT 'UPPSC',
      is_active BOOLEAN DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      telegram_id BIGINT PRIMARY KEY,
      target_exam TEXT,
      preferred_subjects TEXT[]
    );
    CREATE TABLE IF NOT EXISTS asked_history (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT,
      question_id INT,
      asked_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'Moderate';
  `);
};
setupDatabase();


// ---------------------------------------------------------
// 2. LIVE TEST ENGINE (CORE LOGIC)
// ---------------------------------------------------------

// विषयों की लिस्ट (Zoho Notes के अनुसार)
const SCHEDULED_SUBJECTS = [
  "HISTORY", "GEOGRAPHY", "ECONOMY", "ENVIRONMENT", 
  "POLITY", "Current Affairs", "PHYSICS", "CHEMISTRY", 
  "MATHEMATICS", "MATH", "ENGLISH", "REASONING", "HINDI"
];

const getCurrentSubject = () => {
  const hour = new Date().getHours(); 
  const index = hour - 8; // 8 AM से शुरू
  if (index >= 0 && index < SCHEDULED_SUBJECTS.length) {
    return SCHEDULED_SUBJECTS[index];
  }
  return "MIXED TEST";
};

// 50 प्रश्नों को लगातार भेजने वाला फंक्शन
const startLiveTest = async (chatId: number, subject: string) => {
  let questionCount = 0;
  const maxQuestions = 50; 
  
  // हर 1 मिनट में चलेगा
  const testInterval = setInterval(async () => {
    questionCount++;
    
    if (questionCount > maxQuestions) {
      clearInterval(testInterval);
      bot.telegram.sendMessage(chatId, `🏁 **${subject} का लाइव टेस्ट समाप्त!**\n\nउम्मीद है आपने अच्छा प्रदर्शन किया होगा। अगले टेस्ट का अनाउंसमेंट 10 मिनट में होगा!`);
      return;
    }

    try {
      // डेटाबेस से नया सवाल निकालें जो इस ग्रुप में पहले न पूछा गया हो
      const res = await pool.query(`
        SELECT * FROM questions 
        WHERE subject ILIKE $1 
        AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $2)
        ORDER BY RANDOM() LIMIT 1
      `, [`%${subject}%`, chatId]);

      if (res.rows.length === 0) {
        clearInterval(testInterval);
        bot.telegram.sendMessage(chatId, `⚠️ **सिस्टम अलर्ट:** ${subject} के लिए डेटाबेस में कोई नया प्रश्न नहीं बचा है! एडमिन कृपया और प्रश्न जनरेट करें।`);
        return;
      }

      const q = res.rows[0];

      // प्रश्न को हिस्ट्री में डालें (No-Duplicate Rule)
      await pool.query('INSERT INTO asked_history (chat_id, question_id) VALUES ($1, $2)', [chatId, q.id]);

      const options = [
        q.option_a.substring(0, 95), 
        q.option_b.substring(0, 95), 
        q.option_c.substring(0, 95), 
        q.option_d.substring(0, 95)
      ];
      const correctIndex = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));

      await bot.telegram.sendQuiz(
        chatId,
        `[Q${questionCount}/${maxQuestions}] ${q.question_text.substring(0, 280)}`,
        options,
        {
          correct_option_id: correctIndex !== -1 ? correctIndex : 0,
          explanation: q.explanation ? q.explanation.substring(0, 190) : 'व्याख्या उपलब्ध नहीं है',
          open_period: 45 // 45 सेकंड टाइमर
        }
      );

    } catch (error) {
      console.error('Error sending live question:', error);
    }
  }, 60000); 
};


// ---------------------------------------------------------
// 3. MASTER SCHEDULING ENGINE (CRON JOBS)
// ---------------------------------------------------------

// 10 मिनट पहले रिमाइंडर (XX:50)
cron.schedule('50 8-22 * * *', async () => {
  const subject = getCurrentSubject();
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🚨 **अलर्ट!**\n\n📚 विषय: ${subject}\n⏳ टेस्ट ठीक 10 मिनट में शुरू होने वाला है। सभी छात्र तैयार हो जाएं!`);
  }
});

// 5 मिनट पहले रिमाइंडर (XX:55)
cron.schedule('55 8-22 * * *', async () => {
  const subject = getCurrentSubject();
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `⚠️ **अंतिम कॉल!**\n\n📚 विषय: ${subject}\n⏳ टेस्ट 5 मिनट में शुरू होगा। अपनी सीट बेल्ट बांध लें!`);
  }
});

// 1 मिनट पहले (XX:59)
cron.schedule('59 8-22 * * *', async () => {
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🔥 **GET READY!**\n\nटेस्ट 1 मिनट में शुरू हो रहा है...`);
  }
});

// टेस्ट शुरू करें (XX:00)
cron.schedule('0 9-23 * * *', async () => {
  const subject = getCurrentSubject();
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🚀 **${subject} का लाइव टेस्ट शुरू!**\n\nअब अगले 50 मिनट तक हर 1 मिनट में 1 नया प्रश्न आएगा। All the best!`);
    startLiveTest(channel.chat_id, subject);
  }
});


// ---------------------------------------------------------
// 4. BOT COMMANDS (ADMIN & USERS)
// ---------------------------------------------------------

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || 'student';
  try {
    await pool.query(
      'INSERT INTO users (telegram_id, username) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, username]
    );
    ctx.reply('नमस्ते! स्मार्ट AI क्विज़ प्लेटफॉर्म में आपका स्वागत है।\n\nयहाँ रोज़ाना लाइव टेस्ट होते हैं!');
  } catch (err) {
    console.error(err);
  }
});

bot.command('admin', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply('❌ आप एडमिन नहीं हैं।');
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const questions = await pool.query('SELECT COUNT(*) FROM questions');
    const channels = await pool.query('SELECT COUNT(*) FROM channels');

    ctx.replyWithMarkdown(`👑 **MASTER ADMIN PANEL** 👑\n\n👥 कुल यूज़र्स: ${users.rows[0].count}\n📚 कुल प्रश्न: ${questions.rows[0].count}\n📢 लिंक्ड ग्रुप्स: ${channels.rows[0].count}\n\nमैन्युअल ऑटो-पोस्ट के लिए /forcepost दबाएं।`);
  } catch (error) {
    ctx.reply('Admin panel error.');
  }
});

bot.command('setupgroup', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('❌ यह कमांड किसी ग्रुप में इस्तेमाल करें।');
  try {
    await pool.query('INSERT INTO channels (chat_id, title) VALUES ($1, $2) ON CONFLICT (chat_id) DO NOTHING', [ctx.chat.id, ctx.chat.title]);
    ctx.reply(`✅ "${ctx.chat.title}" Live Test के लिए रजिस्टर हो गया है।`);
  } catch (error) {
    ctx.reply('❌ ग्रुप सेट करने में एरर आई।');
  }
});

bot.command('forcepost', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  const subject = getCurrentSubject();
  ctx.reply(`🚀 सभी ग्रुप्स में ${subject} का लाइव टेस्ट अभी शुरू किया जा रहा है...`);
  
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🚀 **एडमिन ने ${subject} का टेस्ट शुरू कर दिया है!**`);
    startLiveTest(channel.chat_id, subject);
  }
});

// ---------------------------------------------------------
// 5. LAUNCH
// ---------------------------------------------------------

bot.launch({ dropPendingUpdates: true }).then(() => {
  console.log('Master Bot is running seamlessly!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
