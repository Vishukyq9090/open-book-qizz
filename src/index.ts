import { Telegraf } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || 'student';

  try {
    await pool.query(
      'INSERT INTO users (telegram_id, username) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, username]
    );
    ctx.reply('नमस्ते! ऑल-एग्जाम्स एआई क्विज़ प्लेटफॉर्म में आपका स्वागत है। आपकी प्राथमिकताएं (Preferences) सेट करने के लिए /settings टाइप करें।');
  } catch (err) {
    console.error('Database error on start:', err);
    ctx.reply('स्वागत है! बॉट चालू है।');
  }
});

bot.command('settings', (ctx) => {
  ctx.reply('यहाँ आप अपनी परीक्षा, विषय (Subject) और भाषा चुन सकते हैं। (जल्द ही इंटरएक्टिव मेनू उपलब्ध होगा)');
});

bot.launch().then(() => {
  console.log('Bot is running successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
