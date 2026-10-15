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
    ctx.reply('नमस्ते! स्मार्ट AI क्विज़ प्लेटफॉर्म में आपका स्वागत है।\n\nनए प्रश्न बनाने के लिए /generate दबाएं।\nक्विज़ शुरू करने के लिए /quiz दबाएं।\nउपलब्ध मॉडल्स चेक करने के लिए /checkmodels दबाएं।');
  } catch (err) {
    console.error('Database error on start:', err);
    ctx.reply('स्वागत है! बॉट चालू है।');
  }
});

// Check Available Models Command
bot.command('checkmodels', async (ctx) => {
  ctx.reply('Google Gemini के उपलब्ध मॉडल्स की लिस्ट चेक की जा रही है... ⏳');
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return ctx.reply('❌ GEMINI_API_KEY सेट नहीं है।');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.models) {
      const supportedModels = data.models
        .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      
      ctx.reply(`✅ आपके API Key पर उपलब्ध मॉडल्स:\n\n${supportedModels.join('\n')}\n\nहमारा बॉट इनमें से बेस्ट मॉडल खुद चुन लेगा!`);
    } else {
      ctx.reply('❌ मॉडल्स की लिस्ट नहीं मिल पाई।');
    }
  } catch (error) {
    console.error('Check Models Error:', error);
    ctx.reply('❌ मॉडल्स चेक करने में एरर आ गई।');
  }
});

// AI Question Generation with FALLBACK Mechanism
bot.command('generate', async (ctx) => {
  ctx.reply('Google Gemini AI से प्रश्न बनाया जा रहा है... कृपया प्रतीक्षा करें ⏳');
  
  try {
    const prompt = `Generate 1 multiple choice question for UPPSC or UPSC exam in Hindi. 
    Return ONLY a raw JSON object (no markdown, no formatting, no backticks) with these exact keys: 
    exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option (A, B, C, or D), explanation, difficulty.`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return ctx.reply('❌ GEMINI_API_KEY सेट नहीं है। कृपया Render में इसे ऐड करें।');
    }

    // UPDATED FALLBACK LIST: आपके API में मौजूद नए मॉडल्स
    const modelsToTry = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-pro'];
    let successData = null;
    let usedModel = '';

    for (const model of modelsToTry) {
      try {
        console.log(`Trying model: ${model}...`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0]) {
          successData = data;
          usedModel = model;
          break; 
        }
      } catch (err) {
        console.log(`Model ${model} failed, trying next...`);
      }
    }

    if (!successData) {
      return ctx.reply('❌ सभी Gemini मॉडल्स फेल हो गए। यह संभवतः API Quota खत्म होने (डेली लिमिट) के कारण है। कृपया कल प्रयास करें या नई API Key इस्तेमाल करें।');
    }

    let jsonString = successData.candidates[0].content.parts[0].text.trim();
    
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const q = JSON.parse(jsonString);

    await pool.query(
      `INSERT INTO questions (exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, language) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Hindi')`,
      [q.exam_type, q.subject, q.chapter || 'Misc', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.charAt(0), q.explanation, q.difficulty]
    );

    ctx.reply(`✅ नया प्रश्न सफलतापूर्वक सेव हो गया! (Model: ${usedModel})\n\nविषय: ${q.subject}\nप्रश्न: ${q.question_text}\n\nअब इसे पोल के रूप में देखने के लिए /quiz टाइप करें।`);
  } catch (error) {
    console.error('AI Generation Error:', error);
    ctx.reply('❌ प्रश्न बनाने में तकनीकी त्रुटि हुई।');
  }
});

// Live Telegram Quiz Engine
bot.command('quiz', async (ctx) => {
  try {
    const res = await pool.query('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1');
    if (res.rows.length === 0) {
      return ctx.reply('डेटाबेस में अभी कोई प्रश्न नहीं है। पहले /generate कमांड से प्रश्न बनाएँ।');
    }

    const q = res.rows[0];
    const options = [q.option_a, q.option_b, q.option_c, q.option_d];
    
    const correctOptionLetter = (q.correct_option || 'A').toString().toUpperCase().trim().charAt(0);
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctOptionLetter);

    await ctx.replyWithQuiz(
      q.question_text,
      options,
      {
        correct_option_id: correctIndex !== -1 ? correctIndex : 0,
        explanation: q.explanation,
        open_period: 15
      }
    );
  } catch (error) {
    console.error('Quiz Error:', error);
    ctx.reply('क्विज़ भेजने में कोई तकनीकी समस्या आई।');
  }
});

bot.launch({ dropPendingUpdates: true }).then(() => {
  console.log('Bot is running successfully with Smart Fallback AI!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
