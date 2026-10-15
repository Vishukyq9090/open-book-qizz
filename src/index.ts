import { Telegraf } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Start Command
bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || 'student';

  try {
    await pool.query(
      'INSERT INTO users (telegram_id, username) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, username]
    );
    ctx.reply('नमस्ते! ऑल-एग्जाम्स एआई क्विज़ प्लेटफॉर्म में आपका स्वागत है।\n\nनए प्रश्न बनाने के लिए /generate दबाएं।\nक्विज़ शुरू करने के लिए /quiz दबाएं।');
  } catch (err) {
    console.error('Database error on start:', err);
    ctx.reply('स्वागत है! बॉट चालू है।');
  }
});

// AI Question Generation (DeepSeek)
bot.command('generate', async (ctx) => {
  ctx.reply('DeepSeek AI से UPPSC स्तर का नया प्रश्न बनाया जा रहा है... कृपया 5-10 सेकंड प्रतीक्षा करें ⏳');
  
  try {
    const prompt = `Generate 1 multiple choice question for UPPSC or UPSC exam in Hindi. 
    Return ONLY a raw JSON object (no markdown, no formatting, no backticks) with these exact keys: 
    exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option (A/B/C/or D), explanation, difficulty.`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    const data = await response.json();
    
    // नया चेक: अगर API ने choices नहीं भेजा (यानी कोई API एरर है)
    if (!data.choices || !data.choices[0]) {
      console.error('DeepSeek API Error Details:', data);
      return ctx.reply('❌ DeepSeek API ने प्रश्न नहीं भेजा। कृपया Render के लॉग्स चेक करें। (कारण: गलत API Key या 0 बैलेंस हो सकता है)');
    }

    let jsonString = data.choices[0].message.content.trim();
    
    // Clean up if AI adds markdown backticks
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
    }

    const q = JSON.parse(jsonString);

    // Save to Supabase Database
    await pool.query(
      `INSERT INTO questions (exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, language) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Hindi')`,
      [q.exam_type, q.subject, q.chapter || 'Misc', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.difficulty]
    );

    ctx.reply(`✅ नया प्रश्न डेटाबेस में सफलतापूर्वक सेव हो गया!\n\nविषय: ${q.subject}\nप्रश्न: ${q.question_text}\n\nअब इसे पोल के रूप में देखने के लिए /quiz टाइप करें।`);
  } catch (error) {
    console.error('AI Generation Error:', error);
    ctx.reply('❌ प्रश्न बनाने में कोई त्रुटि हुई।');
  }
});

// Live Telegram Quiz Engine
bot.command('quiz', async (ctx) => {
  try {
    // Get a random question from database
    const res = await pool.query('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1');
    if (res.rows.length === 0) {
      return ctx.reply('डेटाबेस में अभी कोई प्रश्न नहीं है। पहले /generate कमांड से प्रश्न बनाएँ।');
    }

    const q = res.rows[0];
    const options = [q.option_a, q.option_b, q.option_c, q.option_d];
    
    // Map A, B, C, D to 0, 1, 2, 3
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.correct_option.toUpperCase().trim());

    // Send Telegram Poll (Quiz Mode)
    await ctx.replyWithQuiz(
      q.question_text,
      options,
      {
        correct_option_id: correctIndex !== -1 ? correctIndex : 0,
        explanation: q.explanation,
        open_period: 15 // 15 seconds timer
      }
    );
  } catch (error) {
    console.error('Quiz Error:', error);
    ctx.reply('क्विज़ भेजने में कोई तकनीकी समस्या आई।');
  }
});

bot.launch().then(() => {
  console.log('Bot is running successfully with AI features!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
