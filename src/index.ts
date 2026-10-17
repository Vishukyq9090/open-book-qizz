import { Telegraf, Markup } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import http from 'http';
import cron from 'node-cron';

dotenv.config();

// ---------------------------------------------------------
// 1. KEEP-ALIVE SERVER & GLOBAL ERROR HANDLERS
// ---------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ultimate Smart AI Quiz SaaS Bot is Running 24/7!');
}).listen(process.env.PORT || 3000);

process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled Rejection:', err));

const bot = new Telegraf(process.env.BOT_TOKEN || '');
const ADMIN_ID = (process.env.ADMIN_ID || '').trim();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------------------------------------------------------
// 2. CONSTANTS & IN-MEMORY STATE TRACKERS
// ---------------------------------------------------------
const SUBJECTS = [
  "HISTORY", "GEOGRAPHY", "ECONOMY", "ENVIRONMENT", 
  "POLITY", "Current Affairs", "PHYSICS", "CHEMISTRY", 
  "BIOLOGY", "MATHEMATICS", "ENGLISH", "REASONING", "HINDI"
];

const EXAMS = ["UPSC / UPPSC", "SSC / Railway", "Teaching / TET", "All Exams Mixed"];

const activeTests = new Map<number, NodeJS.Timeout>();
const userStates = new Map<number, { action: string; targetChatId?: number }>();

// Safe Reply Helper (अगर Markdown में कोई स्पेशल कैरेक्टर एरर दे, तो बिना क्रैश हुए नॉर्मल मैसेज भेजेगा)
const safeSendMessage = async (chatId: number | string, text: string, extra: any = {}) => {
  try {
    return await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
  } catch (err) {
    const cleanText = text.replace(/[*_`]/g, '');
    return await bot.telegram.sendMessage(chatId, cleanText, extra).catch((e) => console.error('Send Error:', e));
  }
};

const safeEditMessage = async (ctx: any, text: string, extra: any = {}) => {
  try {
    return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...extra });
  } catch (err) {
    const cleanText = text.replace(/[*_`]/g, '');
    return await ctx.editMessageText(cleanText, extra).catch(() => {});
  }
};

// ---------------------------------------------------------
// 3. AUTO-MIGRATING DATABASE SCHEMA (SUPABASE)
// ---------------------------------------------------------
const setupDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        is_banned BOOLEAN DEFAULT FALSE,
        target_exam TEXT DEFAULT 'UPSC / UPPSC',
        preferred_subjects TEXT[] DEFAULT ARRAY['HISTORY', 'POLITY', 'GEOGRAPHY', 'Current Affairs'],
        alerts_enabled BOOLEAN DEFAULT TRUE,
        total_score INT DEFAULT 0,
        joined_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS target_exam TEXT DEFAULT 'UPSC / UPPSC';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_subjects TEXT[] DEFAULT ARRAY['HISTORY', 'POLITY', 'GEOGRAPHY', 'Current Affairs'];
      ALTER TABLE users ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS total_score INT DEFAULT 0;

      CREATE TABLE IF NOT EXISTS channels (
        chat_id BIGINT PRIMARY KEY,
        title TEXT,
        owner_id BIGINT,
        exam_pref TEXT DEFAULT 'UPSC / UPPSC',
        selected_subjects TEXT[] DEFAULT ARRAY['HISTORY', 'GEOGRAPHY', 'ECONOMY', 'ENVIRONMENT', 'POLITY', 'Current Affairs', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'MATHEMATICS', 'ENGLISH', 'REASONING', 'HINDI'],
        difficulty_mode TEXT DEFAULT 'Progressive',
        force_sub_id TEXT DEFAULT NULL,
        force_sub_link TEXT DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        is_blacklisted BOOLEAN DEFAULT FALSE
      );
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS owner_id BIGINT;
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS exam_pref TEXT DEFAULT 'UPSC / UPPSC';
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS selected_subjects TEXT[] DEFAULT ARRAY['HISTORY', 'GEOGRAPHY', 'ECONOMY', 'ENVIRONMENT', 'POLITY', 'Current Affairs', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'MATHEMATICS', 'ENGLISH', 'REASONING', 'HINDI'];
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS difficulty_mode TEXT DEFAULT 'Progressive';
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS force_sub_id TEXT DEFAULT NULL;
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS force_sub_link TEXT DEFAULT NULL;
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        exam_type TEXT,
        subject TEXT,
        chapter TEXT,
        question_text TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_option TEXT,
        explanation TEXT,
        difficulty TEXT DEFAULT 'Moderate',
        language TEXT DEFAULT 'Hindi'
      );

      CREATE TABLE IF NOT EXISTS asked_history (
        id SERIAL PRIMARY KEY,
        chat_id BIGINT,
        question_id INT,
        asked_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS poll_tracking (
        poll_id TEXT PRIMARY KEY,
        chat_id BIGINT,
        correct_index INT
      );

      CREATE TABLE IF NOT EXISTS scores (
        chat_id BIGINT,
        user_id BIGINT,
        username TEXT,
        score INT DEFAULT 0,
        PRIMARY KEY (chat_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      INSERT INTO bot_settings (key, value) VALUES 
        ('master_fsub_id', ''),
        ('master_fsub_link', ''),
        ('master_fsub_on', 'false'),
        ('branding_text', '🎯 Powered by Smart AI Quiz'),
        ('branding_link', 'https://t.me/telegram'),
        ('factory_on', 'true')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✅ Enterprise Database Schema Ready!');
  } catch (err) {
    console.error('Database Init Error:', err);
  }
};
setupDatabase();

const getSetting = async (key: string): Promise<string> => {
  try {
    const res = await pool.query('SELECT value FROM bot_settings WHERE key = $1', [key]);
    return res.rows[0]?.value || '';
  } catch { return ''; }
};

const setSetting = async (key: string, value: string) => {
  await pool.query('INSERT INTO bot_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
};

// Check if User is Master Admin (अगर ADMIN_ID खाली है तो भी ब्लॉक नहीं करेगा)
const isMasterAdmin = (userId: number): boolean => {
  if (!ADMIN_ID) return true;
  return userId.toString() === ADMIN_ID;
};

// ---------------------------------------------------------
// 4. DUAL-LAYER FORCE SUBSCRIBE & BAN CHECKER
// ---------------------------------------------------------
const isUserBanned = async (userId: number): Promise<boolean> => {
  try {
    const res = await pool.query('SELECT is_banned FROM users WHERE telegram_id = $1', [userId]);
    return res.rows[0]?.is_banned === true;
  } catch { return false; }
};

const checkUserSubscription = async (userId: number, chatId?: number): Promise<{ joined: boolean; missing: { title: string; link: string }[] }> => {
  if (isMasterAdmin(userId)) return { joined: true, missing: [] };
  const missing: { title: string; link: string }[] = [];

  const masterOn = await getSetting('master_fsub_on');
  const masterId = await getSetting('master_fsub_id');
  const masterLink = await getSetting('master_fsub_link');

  if (masterOn === 'true' && masterId && masterLink) {
    try {
      const member = await bot.telegram.getChatMember(masterId, userId);
      if (['left', 'kicked'].includes(member.status)) {
        missing.push({ title: '📢 Join Main Official Channel', link: masterLink });
      }
    } catch (err) {}
  }

  if (chatId && chatId < 0) {
    try {
      const chRes = await pool.query('SELECT force_sub_id, force_sub_link FROM channels WHERE chat_id = $1', [chatId]);
      const localId = chRes.rows[0]?.force_sub_id;
      const localLink = chRes.rows[0]?.force_sub_link;
      if (localId && localLink) {
        const member = await bot.telegram.getChatMember(localId, userId);
        if (['left', 'kicked'].includes(member.status)) {
          missing.push({ title: '📢 Join Group Official Channel', link: localLink });
        }
      }
    } catch (err) {}
  }

  return { joined: missing.length === 0, missing };
};

const sendForceSubPrompt = async (ctx: any, missing: { title: string; link: string }[]) => {
  const buttons: any[][] = missing.map(m => [Markup.button.url(m.title, m.link)]);
  buttons.push([Markup.button.callback('✅ मैंने जॉइन कर लिया (Verify)', 'verify_fsub')]);
  return safeSendMessage(
    ctx.chat.id,
    `🔒 *एक्सेस लॉक्ड!*\n\nक्विज़ खेलने, अपना स्कोर सेव करने और सभी फीचर्स अनलॉक करने के लिए कृपया नीचे दिए गए ऑफिशियल चैनल जॉइन करें:`,
    Markup.inlineKeyboard(buttons)
  );
};

bot.use(async (ctx, next) => {
  if (ctx.from && await isUserBanned(ctx.from.id)) {
    if (ctx.chat?.type === 'private') {
      return ctx.reply('🚫 आपको एडमिन द्वारा इस बॉट से प्रतिबंधित (Ban) कर दिया गया है।');
    }
    return;
  }
  return next();
});

// ---------------------------------------------------------
// 5. ENGINE 1: 24/7 AI QUESTION FACTORY (GEMINI BATCHING)
// ---------------------------------------------------------
let subjectCounter = 0;

const generateBatchQuestions = async (forcedSubject?: string) => {
  const factoryStatus = await getSetting('factory_on');
  if (factoryStatus === 'false' && !forcedSubject) return { success: false, count: 0, subject: 'PAUSED' };

  const subject = forcedSubject || SUBJECTS[subjectCounter % SUBJECTS.length];
  if (!forcedSubject) subjectCounter++;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, count: 0, subject };

  const prompt = `Generate 10 high-quality, 100% fact-checked multiple choice questions for UPSC, UPPSC, and SSC exams on the subject "${subject}" in Hindi (if subject is ENGLISH, write in English).
  Include 3 Easy, 4 Moderate, and 3 Hard questions.
  
  STRICT TELEGRAM POLL CHARACTER LIMITS:
  - "question_text": Max 210 characters.
  - "option_a", "option_b", "option_c", "option_d": Max 85 characters each.
  - "explanation": Max 140 characters.
  - "correct_option": Strictly "A", "B", "C", or "D".
  - "difficulty": Strictly "Easy", "Moderate", or "Hard".

  Return ONLY a raw valid JSON Array of 10 objects. No markdown, no backticks.`;

  const modelsToTry = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
  let rawText = '';

  for (const model of modelsToTry) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        rawText = data.candidates[0].content.parts[0].text.trim();
        break;
      }
    } catch (err) {}
  }

  if (!rawText) return { success: false, count: 0, subject };

  try {
    rawText = rawText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
    const questionsArray = JSON.parse(rawText);
    if (!Array.isArray(questionsArray)) return { success: false, count: 0, subject };

    let savedCount = 0;
    for (const q of questionsArray) {
      if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.correct_option) continue;
      const dup = await pool.query('SELECT id FROM questions WHERE question_text = $1 LIMIT 1', [q.question_text]);
      if (dup.rows.length === 0) {
        await pool.query(
          `INSERT INTO questions (exam_type, subject, chapter, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, language) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Hindi')`,
          [
            'ALL_EXAMS', subject, q.chapter || subject,
            q.question_text.substring(0, 220),
            q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95),
            q.correct_option.toString().trim().toUpperCase().charAt(0),
            (q.explanation || 'सही उत्तर प्रमाणित है।').substring(0, 150),
            ['Easy', 'Moderate', 'Hard'].includes(q.difficulty) ? q.difficulty : 'Moderate'
          ]
        );
        savedCount++;
      }
    }
    console.log(`✅ Factory saved ${savedCount} questions for ${subject}`);
    return { success: true, count: savedCount, subject };
  } catch (err) {
    return { success: false, count: 0, subject };
  }
};

cron.schedule('*/10 * * * *', () => { generateBatchQuestions(); });

// ---------------------------------------------------------
// 6. ENGINE 2: 10-SEC LIVE TEST ENGINE (PROGRESSIVE & BRANDED)
// ---------------------------------------------------------
const stopQuizInChat = async (chatId: number, notify: boolean = true) => {
  const timer = activeTests.get(chatId);
  if (timer) {
    clearInterval(timer);
    activeTests.delete(chatId);
    if (notify) {
      await sendLeaderboard(chatId, '🛑 *लाइव टेस्ट समाप्त कर दिया गया है!*');
    }
  }
};

const sendLeaderboard = async (chatId: number, headerText: string) => {
  try {
    const brandText = await getSetting('branding_text');
    const brandLink = await getSetting('branding_link');
    const botUsername = bot.botInfo?.username || '';

    const topRes = await pool.query('SELECT username, score FROM scores WHERE chat_id = $1 ORDER BY score DESC LIMIT 10', [chatId]);
    let board = `${headerText}\n\n🏆 *TOP 10 LEADERBOARD* 🏆\n\n`;
    if (topRes.rows.length === 0) {
      board += `अभी तक किसी का स्कोर दर्ज नहीं हुआ है।\n`;
    } else {
      topRes.rows.forEach((r, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        board += `${medal} ${r.username} — ${r.score} Pts\n`;
      });
    }
    board += `\n${brandText}`;

    const safeLink = brandLink.startsWith('http') ? brandLink : '[https://t.me/telegram](https://t.me/telegram)';
    const kb: any[][] = [
      [Markup.button.url('🔥 Join Official Channel', safeLink)],
      [Markup.button.url('➕ Add Bot to Your Group', `[https://t.me/$](https://t.me/$){botUsername}?startgroup=true`)]
    ];

    await safeSendMessage(chatId, board, Markup.inlineKeyboard(kb));
  } catch (err) {}
};

const startFastQuiz = async (chatId: number, subject: string, totalQuestions: number = 50) => {
  if (activeTests.has(chatId)) return;

  try {
    const chCheck = await pool.query('SELECT is_blacklisted, difficulty_mode FROM channels WHERE chat_id = $1', [chatId]);
    if (chCheck.rows[0]?.is_blacklisted) return;
    const diffMode = chCheck.rows[0]?.difficulty_mode || 'Progressive';

    const brandText = await getSetting('branding_text');
    const brandLink = await getSetting('branding_link');
    const safeLink = brandLink.startsWith('http') ? brandLink : '[https://t.me/telegram](https://t.me/telegram)';

    const startKb: any[][] = [
      [
        Markup.button.url('📢 Official Channel', safeLink),
        Markup.button.callback('🛑 Stop Test', `stop_quiz_${chatId}`)
      ]
    ];

    await safeSendMessage(
      chatId,
      `🚀 *${subject} का लाइव टेस्ट शुरू हो गया है!* 🚀\n\n` +
      `📊 कुल प्रश्न: *${totalQuestions}* (Easy ➔ Moderate ➔ Hard)\n` +
      `⏱ समय: *10 सेकंड प्रति प्रश्न* (Auto-Answer)\n` +
      `📌 नोट: लीडरबोर्ड में नाम आने के लिए चैनल से जुड़ा होना अनिवार्य है।\n\n` +
      `${brandText}`,
      Markup.inlineKeyboard(startKb)
    );

    let currentQ = 0;
    const timer = setInterval(async () => {
      currentQ++;
      if (currentQ > totalQuestions) {
        await stopQuizInChat(chatId, false);
        await sendLeaderboard(chatId, `🏁 *${subject} का लाइव टेस्ट पूरा हुआ!* 🎉`);
        return;
      }

      let targetDiff = diffMode;
      if (diffMode === 'Progressive') {
        const ratio = currentQ / totalQuestions;
        if (ratio <= 0.3) targetDiff = 'Easy';
        else if (ratio <= 0.7) targetDiff = 'Moderate';
        else targetDiff = 'Hard';
      }

      try {
        let res = await pool.query(`
          SELECT * FROM questions 
          WHERE subject ILIKE $1 AND difficulty = $2
          AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $3)
          ORDER BY RANDOM() LIMIT 1
        `, [`%${subject}%`, targetDiff, chatId]);

        if (res.rows.length === 0) {
          res = await pool.query(`
            SELECT * FROM questions 
            WHERE subject ILIKE $1
            AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $2)
            ORDER BY RANDOM() LIMIT 1
          `, [`%${subject}%`, chatId]);
        }

        if (res.rows.length === 0) {
          await pool.query(`DELETE FROM asked_history WHERE chat_id = $1 AND question_id IN (SELECT id FROM questions WHERE subject ILIKE $2)`, [chatId, `%${subject}%`]);
          res = await pool.query(`SELECT * FROM questions WHERE subject ILIKE $1 ORDER BY RANDOM() LIMIT 1`, [`%${subject}%`]);
        }

        if (res.rows.length === 0) {
          res = await pool.query(`SELECT * FROM questions ORDER BY RANDOM() LIMIT 1`);
        }

        if (res.rows.length === 0) {
          await stopQuizInChat(chatId, false);
          return safeSendMessage(chatId, '⚠️ डेटाबेस में अभी प्रश्न तैयार हो रहे हैं। कृपया एडमिन पैनल से +10 सवाल जनरेट करें।');
        }

        const q = res.rows[0];
        await pool.query('INSERT INTO asked_history (chat_id, question_id) VALUES ($1, $2)', [chatId, q.id]);

        const options = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
        const correctIndex = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
        const finalCorrect = correctIndex !== -1 ? correctIndex : 0;

        const qHeader = `[Q.${currentQ}/${totalQuestions} | ${q.difficulty || targetDiff}]\n`;
        const maxQText = 295 - qHeader.length - (brandText.length + 2);
        const finalQuestion = `${qHeader}${q.question_text.substring(0, maxQText)}\n${brandText}`.substring(0, 298);
        const finalExplanation = `${(q.explanation || 'सही उत्तर प्रमाणित है।').substring(0, 150)}\n${brandText}`.substring(0, 198);

        const sentPoll = await bot.telegram.sendQuiz(
          chatId,
          finalQuestion,
          options,
          {
            correct_option_id: finalCorrect,
            explanation: finalExplanation,
            open_period: 10,
            is_anonymous: false
          }
        );

        if (sentPoll.poll?.id) {
          await pool.query('INSERT INTO poll_tracking (poll_id, chat_id, correct_index) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [sentPoll.poll.id, chatId, finalCorrect]);
        }
      } catch (err) {
        console.error('Quiz Send Error:', err);
      }
    }, 15000);

    activeTests.set(chatId, timer);
  } catch (err) {}
};

bot.on('poll_answer', async (ctx) => {
  try {
    const answer = ctx.pollAnswer;
    const userId = answer.user.id;
    const username = answer.user.first_name || answer.user.username || 'Student';
    const selectedOption = answer.option_ids[0];

    const pollRes = await pool.query('SELECT chat_id, correct_index FROM poll_tracking WHERE poll_id = $1', [answer.poll_id]);
    if (pollRes.rows.length === 0) return;

    const { chat_id, correct_index } = pollRes.rows[0];
    if (selectedOption === correct_index) {
      const subCheck = await checkUserSubscription(userId, Number(chat_id));
      if (!subCheck.joined) {
        try {
          const buttons: any[][] = subCheck.missing.map(m => [Markup.button.url(m.title, m.link)]);
          const warnMsg = await safeSendMessage(
            chat_id,
            `⚠️ ${username}, आपका उत्तर सही था! लेकिन आपने ऑफिशियल चैनल जॉइन नहीं किया है इसलिए आपका पॉइंट लीडरबोर्ड में नहीं जुड़ा।`,
            Markup.inlineKeyboard(buttons)
          );
          if (warnMsg && 'message_id' in warnMsg) {
            setTimeout(() => {
              bot.telegram.deleteMessage(chat_id, warnMsg.message_id).catch(() => {});
            }, 12000);
          }
        } catch {}
        return;
      }

      await pool.query(`
        INSERT INTO scores (chat_id, user_id, username, score) VALUES ($1, $2, $3, 1)
        ON CONFLICT (chat_id, user_id) DO UPDATE SET score = scores.score + 1, username = $3
      `, [chat_id, userId, username]);

      await pool.query('UPDATE users SET total_score = total_score + 1 WHERE telegram_id = $1', [userId]);
    }
  } catch (err) {}
});

// ---------------------------------------------------------
// 7. 15-HOUR SCHEDULER & USER MENTION ALERTS (8 AM - 11 PM IST)
// ---------------------------------------------------------
const getHourlySubject = (): string => {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();
  const index = hour - 8;
  if (index >= 0 && index < SUBJECTS.length) return SUBJECTS[index];
  return SUBJECTS[hour % SUBJECTS.length];
};

const notifyUsersAndGroups = async (minutesLeft: number) => {
  const subject = getHourlySubject();
  try {
    const channels = await pool.query('SELECT chat_id, selected_subjects FROM channels WHERE is_active = TRUE AND is_blacklisted = FALSE');
    for (const ch of channels.rows) {
      const allowed: string[] = ch.selected_subjects || SUBJECTS;
      const activeSub = allowed.includes(subject) ? subject : allowed[0] || 'GENERAL KNOWLEDGE';
      await safeSendMessage(
        ch.chat_id,
        `⏰ *रिमाइंडर (${minutesLeft} Min Left)!*\n\n📚 विषय: *${activeSub}*\n🔥 50 प्रश्नों का सुपरफास्ट लाइव टेस्ट ठीक *${minutesLeft} मिनट* में शुरू होने जा रहा है! तैयार हो जाइए!`
      );
    }

    if (minutesLeft === 10) {
      const users = await pool.query('SELECT telegram_id, first_name FROM users WHERE alerts_enabled = TRUE AND is_banned = FALSE AND $1 = ANY(preferred_subjects)', [subject]);
      for (const u of users.rows) {
        await safeSendMessage(
          u.telegram_id,
          `🔔 *नमस्ते ${u.first_name || 'Student'}!*\nआपके पसंदीदा विषय *${subject}* का लाइव टेस्ट ठीक 10 मिनट में ग्रुप में शुरू होने वाला है। तुरंत ग्रुप में आ जाएं!`
        );
      }
    }
  } catch (err) {}
};

cron.schedule('50 7-22 * * *', () => notifyUsersAndGroups(10), { timezone: "Asia/Kolkata" });
cron.schedule('55 7-22 * * *', () => notifyUsersAndGroups(5), { timezone: "Asia/Kolkata" });
cron.schedule('59 7-22 * * *', () => notifyUsersAndGroups(1), { timezone: "Asia/Kolkata" });

cron.schedule('0 8-22 * * *', async () => {
  const subject = getHourlySubject();
  try {
    const channels = await pool.query('SELECT chat_id, selected_subjects FROM channels WHERE is_active = TRUE AND is_blacklisted = FALSE');
    for (const ch of channels.rows) {
      const allowed: string[] = ch.selected_subjects || SUBJECTS;
      const activeSub = allowed.includes(subject) ? subject : allowed[0] || subject;
      startFastQuiz(Number(ch.chat_id), activeSub, 50);
    }
  } catch (err) {}
}, { timezone: "Asia/Kolkata" });

// ---------------------------------------------------------
// 8. AUTO-DETECT WHEN BOT IS ADDED TO ANY GROUP OR CHANNEL
// ---------------------------------------------------------
bot.on('my_chat_member', async (ctx) => {
  try {
    const status = ctx.myChatMember.new_chat_member.status;
    const chat = ctx.myChatMember.chat;
    const adder = ctx.myChatMember.from;
    const botUsername = ctx.botInfo?.username || '';

    if ((chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') && ['administrator', 'member'].includes(status)) {
      await pool.query(`
        INSERT INTO channels (chat_id, title, owner_id, is_active) 
        VALUES ($1, $2, $3, TRUE) 
        ON CONFLICT (chat_id) DO UPDATE SET title = $2, is_active = TRUE
      `, [chat.id, chat.title || 'Untitled Chat', adder.id]);

      const welcomeKb: any[][] = [
        [Markup.button.callback('▶️ Start Demo Test Now', `start_quiz_${chat.id}`)],
        [Markup.button.url('⚙️ Configure Group Settings', `[https://t.me/$](https://t.me/$){botUsername}?start=settings`)]
      ];

      await safeSendMessage(
        chat.id,
        `🎉 *धन्यवाद! Smart AI Quiz Bot अब "${chat.title}" से जुड़ चुका है!*\n\n` +
        `👑 *Group Owner (${adder.first_name}):* आप मेरे प्राइवेट चैट (DM) में जाकर */mygroups* टाइप करके इस ग्रुप के लिए अपना *Force Subscribe Channel*, *Exam Category* और *Subjects* सेट कर सकते हैं!`,
        Markup.inlineKeyboard(welcomeKb)
      );

      if (ADMIN_ID) {
        await safeSendMessage(
          ADMIN_ID,
          `🔔 *New Group Added!*\n📌 Title: ${chat.title}\n🆔 Chat ID: ${chat.id}\n👤 Added By: ${adder.first_name} (${adder.id})`
        );
      }
    } else if (['left', 'kicked'].includes(status)) {
      await pool.query('UPDATE channels SET is_active = FALSE WHERE chat_id = $1', [chat.id]);
      await stopQuizInChat(chat.id, false);
    }
  } catch (err) {}
});

// ---------------------------------------------------------
// 9. USER PANEL, PREFERENCES & GROUP OWNER PANEL (/mygroups)
// ---------------------------------------------------------
const sendUserMainMenu = async (ctx: any) => {
  const brandText = await getSetting('branding_text');
  const botUsername = ctx.botInfo?.username || '';
  const text = `🎓 *स्मार्ट AI लाइव क्विज़ प्लेटफॉर्म में आपका स्वागत है!*\n\n` +
               `यहाँ रोज़ सुबह *8:00 AM से रात 11:00 PM* तक हर घंटे अलग-अलग विषयों के 100% फैक्ट-चेक्ड लाइव टेस्ट होते हैं।\n\n` +
               `नीचे दिए गए बटन्स से अपनी परीक्षा और विषय चुनें ताकि टेस्ट शुरू होने से पहले आपको अलर्ट मिल सके:\n\n${brandText}`;

  const buttons: any[][] = [
    [Markup.button.callback('🎯 My Exam & Subject Preferences', 'user_prefs'), Markup.button.callback('⚡ Play Demo Quiz', 'play_demo')],
    [Markup.button.callback('⚙️ Manage My Groups (Group Owners)', 'owner_groups')],
    [Markup.button.callback('🏆 My Profile & Score', 'user_profile'), Markup.button.url('➕ Add Bot to Your Group', `[https://t.me/$](https://t.me/$){botUsername}?startgroup=true`)]
  ];

  if (isMasterAdmin(ctx.from.id)) {
    buttons.push([Markup.button.callback('👑 MASTER ADMIN PANEL 👑', 'admin_home')]);
  }

  if (ctx.callbackQuery) {
    return safeEditMessage(ctx, text, Markup.inlineKeyboard(buttons));
  }
  return safeSendMessage(ctx.chat.id, text, Markup.inlineKeyboard(buttons));
};

bot.start(async (ctx) => {
  try {
    await pool.query(
      'INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3',
      [ctx.from.id, ctx.from.username || 'student', ctx.from.first_name || 'Student']
    );

    const subCheck = await checkUserSubscription(ctx.from.id, ctx.chat.id);
    if (!subCheck.joined) return sendForceSubPrompt(ctx, subCheck.missing);

    return await sendUserMainMenu(ctx);
  } catch (err) {
    console.error('Start Command Error:', err);
    return ctx.reply('नमस्ते! बॉट चालू है। मेनू खोलने के लिए /admin या /mygroups दबाएं।');
  }
});

bot.action('verify_fsub', async (ctx) => {
  const subCheck = await checkUserSubscription(ctx.from.id, ctx.chat?.id);
  if (!subCheck.joined) {
    return ctx.answerCbQuery('❌ आपने अभी तक सभी चैनल जॉइन नहीं किए हैं! कृपया पहले जॉइन करें।', { show_alert: true });
  }
  await ctx.answerCbQuery('✅ वेरिफिकेशन सफल! स्वागत है!', { show_alert: true });
  return sendUserMainMenu(ctx);
});

bot.action('user_home', (ctx) => sendUserMainMenu(ctx));

bot.action('user_profile', async (ctx) => {
  const res = await pool.query('SELECT target_exam, preferred_subjects, alerts_enabled, total_score FROM users WHERE telegram_id = $1', [ctx.from.id]);
  const u = res.rows[0] || {};
  const msg = `👤 *आपकी प्रोफाइल:*\n\n` +
              `🏅 कुल स्कोर: *${u.total_score || 0} Points*\n` +
              `🎯 टारगेट एग्जाम: *${u.target_exam || 'UPSC / UPPSC'}*\n` +
              `📚 चुने गए विषय: *${(u.preferred_subjects || []).join(', ')}*\n` +
              `🔔 टेस्ट रिमाइंडर अलर्ट: *${u.alerts_enabled ? 'ON ✅' : 'OFF 🔕'}*`;
  await safeEditMessage(ctx, msg, Markup.inlineKeyboard([
    [Markup.button.callback('🎯 Change Exam / Subjects', 'user_prefs')],
    [Markup.button.callback('🔙 Back to Main Menu', 'user_home')]
  ]));
});

const renderUserPrefs = async (ctx: any) => {
  const res = await pool.query('SELECT target_exam, preferred_subjects, alerts_enabled FROM users WHERE telegram_id = $1', [ctx.from.id]);
  const u = res.rows[0] || { target_exam: 'UPSC / UPPSC', preferred_subjects: SUBJECTS, alerts_enabled: true };
  const subs: string[] = u.preferred_subjects || [];

  const examBtns = EXAMS.map(ex => Markup.button.callback(`${u.target_exam === ex ? '✅ ' : ''}${ex}`, `uexam_${ex}`));
  const subBtns: any[][] = [];
  for (let i = 0; i < SUBJECTS.length; i += 2) {
    const row = [Markup.button.callback(`${subs.includes(SUBJECTS[i]) ? '✅ ' : '⬜ '}${SUBJECTS[i]}`, `usub_${SUBJECTS[i]}`)];
    if (SUBJECTS[i + 1]) {
      row.push(Markup.button.callback(`${subs.includes(SUBJECTS[i + 1]) ? '✅ ' : '⬜ '}${SUBJECTS[i + 1]}`, `usub_${SUBJECTS[i + 1]}`));
    }
    subBtns.push(row);
  }

  subBtns.push([Markup.button.callback(`🔔 Test Alerts: ${u.alerts_enabled ? 'ON ✅' : 'OFF 🔕'}`, 'utoggle_alerts')]);
  subBtns.push([Markup.button.callback('💾 Save & Back', 'user_home')]);

  await safeEditMessage(
    ctx,
    `🎯 *अपना एग्जाम और पसंदीदा विषय चुनें:*\n(जब आपके चुने हुए विषय का टेस्ट शुरू होने वाला होगा, तो बॉट आपको 10 मिनट पहले अलर्ट भेजेगा)`,
    Markup.inlineKeyboard([
      [examBtns[0], examBtns[1]],
      [examBtns[2], examBtns[3]],
      ...subBtns
    ])
  );
};

bot.action('user_prefs', (ctx) => renderUserPrefs(ctx));

bot.action(/^uexam_(.+)$/, async (ctx) => {
  const exam = ctx.match[1];
  await pool.query('UPDATE users SET target_exam = $1 WHERE telegram_id = $2', [exam, ctx.from.id]);
  await ctx.answerCbQuery(`Exam set to ${exam}`);
  return renderUserPrefs(ctx);
});

bot.action(/^usub_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  const res = await pool.query('SELECT preferred_subjects FROM users WHERE telegram_id = $1', [ctx.from.id]);
  let subs: string[] = res.rows[0]?.preferred_subjects || [];
  if (subs.includes(sub)) subs = subs.filter(s => s !== sub);
  else subs.push(sub);
  await pool.query('UPDATE users SET preferred_subjects = $1 WHERE telegram_id = $2', [subs, ctx.from.id]);
  return renderUserPrefs(ctx);
});

bot.action('utoggle_alerts', async (ctx) => {
  await pool.query('UPDATE users SET alerts_enabled = NOT alerts_enabled WHERE telegram_id = $1', [ctx.from.id]);
  return renderUserPrefs(ctx);
});

const sendSingleDemoQuiz = async (ctx: any) => {
  try {
    const res = await pool.query('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1');
    if (res.rows.length === 0) return ctx.reply('⚠️ डेटाबेस में अभी प्रश्न तैयार हो रहे हैं। एडमिन पैनल से +10 सवाल जनरेट करें।');
    const q = res.rows[0];
    const options = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
    await ctx.replyWithQuiz(q.question_text.substring(0, 280), options, {
      correct_option_id: correctIndex !== -1 ? correctIndex : 0,
      explanation: q.explanation ? q.explanation.substring(0, 190) : '',
      open_period: 10
    });
  } catch (err) {
    ctx.reply('क्विज़ भेजने में त्रुटि।');
  }
};

bot.action('play_demo', async (ctx) => {
  await ctx.answerCbQuery('Sending Quiz...');
  return sendSingleDemoQuiz(ctx);
});

bot.command('quiz', (ctx) => sendSingleDemoQuiz(ctx));

// ---------------------------------------------------------
// 10. GROUP OWNER MANAGEMENT PANEL (/mygroups & /setupgroup)
// ---------------------------------------------------------
bot.command('setupgroup', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('❌ यह कमांड अपने ग्रुप या चैनल के अंदर चलाएं।');
  try {
    const admins = await ctx.getChatAdministrators();
    const isAdmin = admins.some(a => a.user.id === ctx.from.id);
    if (!isAdmin && !isMasterAdmin(ctx.from.id)) {
      return ctx.reply('❌ केवल ग्रुप के एडमिन ही यह कमांड चला सकते हैं।');
    }

    await pool.query(`
      INSERT INTO channels (chat_id, title, owner_id, is_active) 
      VALUES ($1, $2, $3, TRUE) 
      ON CONFLICT (chat_id) DO UPDATE SET title = $2, owner_id = $3, is_active = TRUE
    `, [ctx.chat.id, ctx.chat.title || 'Group', ctx.from.id]);

    const botUsername = ctx.botInfo?.username || '';
    const setupKb: any[][] = [
      [Markup.button.callback('▶️ Start Live Test', `start_quiz_${ctx.chat.id}`), Markup.button.callback('🛑 Stop Test', `stop_quiz_${ctx.chat.id}`)],
      [Markup.button.url('⚙️ Customize Group & Force Sub', `[https://t.me/$](https://t.me/$){botUsername}?start=settings`)]
    ];

    await safeSendMessage(
      ctx.chat.id,
      `✅ *"${ctx.chat.title}" सफलतापूर्वक रजिस्टर हो गया है!*\n\n` +
      `इस ग्रुप में अपना Force Subscribe चैनल, विषय या टेस्ट कंट्रोल करने के लिए बॉट के प्राइवेट चैट में */mygroups* लिखें या नीचे बटन दबाएं:`,
      Markup.inlineKeyboard(setupKb)
    );
  } catch (err) {
    ctx.reply('❌ कृपया पहले बॉट को इस ग्रुप में Admin बनाएं।');
  }
});

const renderOwnerGroups = async (ctx: any) => {
  const isMaster = isMasterAdmin(ctx.from.id);
  const res = isMaster
    ? await pool.query('SELECT chat_id, title, is_active FROM channels ORDER BY title LIMIT 20')
    : await pool.query('SELECT chat_id, title, is_active FROM channels WHERE owner_id = $1', [ctx.from.id]);

  if (res.rows.length === 0) {
    return safeEditMessage(
      ctx,
      `📢 *आपका कोई ग्रुप लिंक नहीं है!*\n\n1. बॉट को अपने ग्रुप में *Admin* बनाकर जोड़ें।\n2. ग्रुप में जाकर */setupgroup* टाइप करें।`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'user_home')]])
    );
  }

  const btns: any[][] = res.rows.map(g => [
    Markup.button.callback(`${g.is_active ? '🟢' : '🔴'} ${g.title}`, `manage_grp_${g.chat_id}`)
  ]);
  btns.push([Markup.button.callback('🔙 Back to Home', 'user_home')]);

  await safeEditMessage(
    ctx,
    `⚙️ *अपने ग्रुप का चयन करें जिसे आप कस्टमाइज़ करना चाहते हैं:*`,
    Markup.inlineKeyboard(btns)
  );
};

bot.command(['mygroups', 'settings'], async (ctx) => {
  if (ctx.chat.type !== 'private') return ctx.reply('कृपया बॉट के प्राइवेट चैट (DM) में /mygroups भेजें।');
  const isMaster = isMasterAdmin(ctx.from.id);
  const res = isMaster
    ? await pool.query('SELECT chat_id, title, is_active FROM channels ORDER BY title LIMIT 20')
    : await pool.query('SELECT chat_id, title, is_active FROM channels WHERE owner_id = $1', [ctx.from.id]);

  if (res.rows.length === 0) {
    return ctx.reply('आपका कोई ग्रुप रजिस्टर नहीं है। बॉट को अपने ग्रुप में Admin बनाएं और वहां /setupgroup लिखें।');
  }
  const btns: any[][] = res.rows.map(g => [Markup.button.callback(`${g.is_active ? '🟢' : '🔴'} ${g.title}`, `manage_grp_${g.chat_id}`)]);
  btns.push([Markup.button.callback('🔙 Main Menu', 'user_home')]);
  await safeSendMessage(ctx.chat.id, '⚙️ *अपने ग्रुप को मैनेज करने के लिए उस पर क्लिक करें:*', Markup.inlineKeyboard(btns));
});

bot.action('owner_groups', (ctx) => renderOwnerGroups(ctx));

const renderSingleGroupControl = async (ctx: any, chatId: number) => {
  const res = await pool.query('SELECT * FROM channels WHERE chat_id = $1', [chatId]);
  if (res.rows.length === 0) return;
  const g = res.rows[0];
  const isRunning = activeTests.has(Number(chatId));

  const text = `⚙️ *Group Control Panel: ${g.title}*\n\n` +
               `🆔 Chat ID: ${g.chat_id}\n` +
               `📡 Auto-Schedule (8AM-11PM): *${g.is_active ? 'ACTIVE 🟢' : 'PAUSED 🔴'}*\n` +
               `🔥 Live Quiz right now: *${isRunning ? 'RUNNING ⚡' : 'IDLE 💤'}*\n` +
               `🎯 Exam Focus: *${g.exam_pref}*\n` +
               `🎚 Difficulty Mode: *${g.difficulty_mode}*\n` +
               `🔐 Group Force Sub: *${g.force_sub_id ? `${g.force_sub_id} ✅` : 'Not Set ❌'}*\n` +
               `📚 Active Subjects: *${(g.selected_subjects || []).length}/13 Selected*`;

  const btns: any[][] = [
    [
      Markup.button.callback('▶️ Start Live Test Now', `start_quiz_${chatId}`),
      Markup.button.callback('🛑 Stop Running Test', `stop_quiz_${chatId}`)
    ],
    [
      Markup.button.callback(g.is_active ? '⏸ Pause Hourly Auto-Post' : '▶️ Resume Hourly Auto-Post', `gtoggle_act_${chatId}`),
      Markup.button.callback(`🎚 Mode: ${g.difficulty_mode}`, `gdiff_${chatId}`)
    ],
    [
      Markup.button.callback('🔐 Set Group Force Subscribe', `gfsub_set_${chatId}`),
      Markup.button.callback('🗑 Clear Force Sub', `gfsub_clr_${chatId}`)
    ],
    [Markup.button.callback('📚 Customize Group Subjects', `gsub_menu_${chatId}`)],
    [Markup.button.callback('🔙 Back to My Groups', 'owner_groups')]
  ];

  await safeEditMessage(ctx, text, Markup.inlineKeyboard(btns));
};

bot.action(/^manage_grp_(-?\d+)$/, (ctx) => renderSingleGroupControl(ctx, Number(ctx.match[1])));

bot.action(/^gtoggle_act_(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  await pool.query('UPDATE channels SET is_active = NOT is_active WHERE chat_id = $1', [chatId]);
  await ctx.answerCbQuery('Group Auto-Schedule Updated!');
  return renderSingleGroupControl(ctx, chatId);
});

bot.action(/^gdiff_(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  const modes = ['Progressive', 'Easy', 'Moderate', 'Hard'];
  const res = await pool.query('SELECT difficulty_mode FROM channels WHERE chat_id = $1', [chatId]);
  const curr = res.rows[0]?.difficulty_mode || 'Progressive';
  const next = modes[(modes.indexOf(curr) + 1) % modes.length];
  await pool.query('UPDATE channels SET difficulty_mode = $1 WHERE chat_id = $2', [next, chatId]);
  await ctx.answerCbQuery(`Difficulty Mode set to ${next}`);
  return renderSingleGroupControl(ctx, chatId);
});

bot.action(/^start_quiz_(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  const subject = getHourlySubject();
  await ctx.answerCbQuery('🚀 Starting Live Test in Group!');
  startFastQuiz(chatId, subject, 50);
  if (ctx.chat?.type === 'private') return renderSingleGroupControl(ctx, chatId);
});

bot.action(/^stop_quiz_(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  await stopQuizInChat(chatId, true);
  await ctx.answerCbQuery('🛑 Live Test Stopped!');
  if (ctx.chat?.type === 'private') return renderSingleGroupControl(ctx, chatId);
});

const renderGroupSubjects = async (ctx: any, chatId: number) => {
  const res = await pool.query('SELECT title, selected_subjects FROM channels WHERE chat_id = $1', [chatId]);
  const subs: string[] = res.rows[0]?.selected_subjects || SUBJECTS;
  const subBtns: any[][] = [];
  for (let i = 0; i < SUBJECTS.length; i += 2) {
    const row = [Markup.button.callback(`${subs.includes(SUBJECTS[i]) ? '✅ ' : '⬜ '}${SUBJECTS[i]}`, `gtogsub_${chatId}_${SUBJECTS[i]}`)];
    if (SUBJECTS[i + 1]) {
      row.push(Markup.button.callback(`${subs.includes(SUBJECTS[i + 1]) ? '✅ ' : '⬜ '}${SUBJECTS[i + 1]}`, `gtogsub_${chatId}_${SUBJECTS[i + 1]}`));
    }
    subBtns.push(row);
  }
  subBtns.push([Markup.button.callback('💾 Save & Back', `manage_grp_${chatId}`)]);
  await safeEditMessage(ctx, `📚 *${res.rows[0]?.title} के लिए विषय चुनें:*`, Markup.inlineKeyboard(subBtns));
};

bot.action(/^gsub_menu_(-?\d+)$/, (ctx) => renderGroupSubjects(ctx, Number(ctx.match[1])));

bot.action(/^gtogsub_(-?\d+)_(.+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  const sub = ctx.match[2];
  const res = await pool.query('SELECT selected_subjects FROM channels WHERE chat_id = $1', [chatId]);
  let subs: string[] = res.rows[0]?.selected_subjects || [];
  if (subs.includes(sub)) subs = subs.filter(s => s !== sub);
  else subs.push(sub);
  await pool.query('UPDATE channels SET selected_subjects = $1 WHERE chat_id = $2', [subs, chatId]);
  return renderGroupSubjects(ctx, chatId);
});

bot.action(/^gfsub_set_(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  userStates.set(ctx.from.id, { action: 'SET_GROUP_FSUB', targetChatId: chatId });
  await safeSendMessage(
    ctx.chat.id,
    `🔐 *Easy Force Subscribe Setup:*\n\n` +
    `1. सबसे पहले इस बॉट को अपने उस चैनल/ग्रुप में *Admin* बनाएं जिसे आप सब्सक्राइब करवाना चाहते हैं।\n` +
    `2. अब यहाँ अपने चैनल का *@username* लिखकर भेजें (जैसे: @MyOfficialChannel) *या* अपने चैनल की कोई भी एक पोस्ट यहाँ *Forward* कर दें!\n\n` +
    `(कैंसिल करने के लिए /cancel लिखें)`
  );
});

bot.action(/^gfsub_clr_(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  await pool.query('UPDATE channels SET force_sub_id = NULL, force_sub_link = NULL WHERE chat_id = $1', [chatId]);
  await ctx.answerCbQuery('✅ Force Subscribe Removed!');
  return renderSingleGroupControl(ctx, chatId);
});

// ---------------------------------------------------------
// 11. MASTER ADMIN PANEL (/admin) - FULL CONTROL
// ---------------------------------------------------------
const renderMasterAdmin = async (ctx: any) => {
  if (!isMasterAdmin(ctx.from.id)) {
    return ctx.reply(`❌ एक्सेस डिनाइड! आपकी Telegram ID ${ctx.from.id} है। कृपया Render के Environment में ADMIN_ID में यही नंबर सेट करें।`);
  }

  const uCount = await pool.query('SELECT COUNT(*) FROM users');
  const bCount = await pool.query('SELECT COUNT(*) FROM users WHERE is_banned = TRUE');
  const cCount = await pool.query('SELECT COUNT(*) FROM channels WHERE is_active = TRUE');
  const qCount = await pool.query('SELECT COUNT(*) FROM questions');

  const fsubOn = await getSetting('master_fsub_on');
  const fsubId = await getSetting('master_fsub_id');
  const factoryOn = await getSetting('factory_on');
  const brandText = await getSetting('branding_text');

  const dashboard = `👑 *SUPER ADMIN MASTER PANEL* 👑\n\n` +
                    `👥 *Total Users:* ${uCount.rows[0].count} (🚫 Banned: ${bCount.rows[0].count})\n` +
                    `📢 *Active Groups/Channels:* ${cCount.rows[0].count}\n` +
                    `📚 *Total Verified Questions:* ${qCount.rows[0].count}\n` +
                    `⚙️ *AI Question Factory:* ${factoryOn === 'true' ? 'RUNNING 🟢' : 'PAUSED 🔴'}\n` +
                    `🔐 *Master Force Sub:* ${fsubOn === 'true' ? `ON 🟢 (${fsubId || 'Not Set'})` : 'OFF 🔴'}\n` +
                    `🏷 *Smart Branding:* ${brandText}`;

  const buttons: any[][] = [
    [Markup.button.callback('📢 Broadcast (No Pin)', 'adm_bc_normal'), Markup.button.callback('📌 Broadcast & Auto-Pin', 'adm_bc_pin')],
    [Markup.button.callback('🚀 Start Test in All Groups', 'adm_force_all'), Markup.button.callback('🛑 Stop All Running Tests', 'adm_stop_all')],
    [Markup.button.callback('⚡ Generate +10 AI Questions Now', 'adm_gen_now'), Markup.button.callback(factoryOn === 'true' ? '⏸ Pause AI Factory' : '▶️ Resume AI Factory', 'adm_toggle_factory')],
    [Markup.button.callback('🔐 Set Master Force Sub', 'adm_set_fsub'), Markup.button.callback(fsubOn === 'true' ? '🔴 Turn Master FSub OFF' : '🟢 Turn Master FSub ON', 'adm_toggle_fsub')],
    [Markup.button.callback('🏷 Edit Smart Branding', 'adm_set_brand'), Markup.button.callback('📊 Subject-wise DB Stats', 'adm_sub_stats')],
    [Markup.button.callback('🚫 Ban / Unban User', 'adm_ban_user'), Markup.button.callback('⚙️ Manage All Connected Groups', 'owner_groups')]
  ];

  if (ctx.callbackQuery) {
    return safeEditMessage(ctx, dashboard, Markup.inlineKeyboard(buttons));
  }
  return safeSendMessage(ctx.chat.id, dashboard, Markup.inlineKeyboard(buttons));
};

bot.command('admin', (ctx) => renderMasterAdmin(ctx));
bot.action('admin_home', (ctx) => renderMasterAdmin(ctx));

bot.action('adm_toggle_factory', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  const curr = await getSetting('factory_on');
  await setSetting('factory_on', curr === 'true' ? 'false' : 'true');
  await ctx.answerCbQuery('AI Factory Status Updated!');
  return renderMasterAdmin(ctx);
});

bot.action('adm_toggle_fsub', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  const curr = await getSetting('master_fsub_on');
  await setSetting('master_fsub_on', curr === 'true' ? 'false' : 'true');
  await ctx.answerCbQuery('Master Force Sub Status Updated!');
  return renderMasterAdmin(ctx);
});

bot.action('adm_gen_now', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery('Generating 10 Questions with Gemini...');
  await safeSendMessage(ctx.chat.id, '⚙️ *Gemini AI से 10 नए सवाल बनाए जा रहे हैं... कृपया 10 सेकंड प्रतीक्षा करें ⏳*');
  const res = await generateBatchQuestions();
  if (res.success) {
    await safeSendMessage(ctx.chat.id, `✅ *सफलता!* विषय *${res.subject}* के *${res.count}* नए प्रश्न डेटाबेस में जुड़ गए!`);
  } else {
    await safeSendMessage(ctx.chat.id, `❌ सवाल जनरेट नहीं हो पाए। कृपया अपनी GEMINI_API_KEY चेक करें।`);
  }
  return renderMasterAdmin(ctx);
});

bot.action('adm_force_all', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  const subject = getHourlySubject();
  const chs = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE AND is_blacklisted = FALSE');
  for (const ch of chs.rows) {
    startFastQuiz(Number(ch.chat_id), subject, 50);
  }
  await ctx.answerCbQuery(`🚀 Started ${subject} Test in ${chs.rows.length} groups!`, { show_alert: true });
});

bot.action('adm_stop_all', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  for (const chatId of Array.from(activeTests.keys())) {
    await stopQuizInChat(chatId, true);
  }
  await ctx.answerCbQuery('🛑 All Running Tests Stopped!', { show_alert: true });
});

bot.action('adm_sub_stats', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  const res = await pool.query('SELECT subject, COUNT(*) as cnt FROM questions GROUP BY subject ORDER BY cnt DESC');
  const lines = res.rows.map(r => `• *${r.subject}:* ${r.cnt} Qs`).join('\n');
  await safeEditMessage(
    ctx,
    `📊 *Subject-wise Question Bank:*\n\n${lines || 'अभी कोई सवाल नहीं है।'}`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Admin', 'admin_home')]])
  );
});

bot.action('adm_bc_normal', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADM_BC_NORMAL' });
  await ctx.reply('📢 Broadcast Mode (Without Pin):\nअब आप जो भी मैसेज, फोटो, वीडियो या पोल भेजेंगे, वह सभी यूज़र्स और ग्रुप्स में चला जाएगा।\n(कैंसिल करने के लिए /cancel लिखें)');
});

bot.action('adm_bc_pin', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADM_BC_PIN' });
  await ctx.reply('📌 Broadcast & Auto-Pin Mode:\nअब आप जो भी मैसेज या पोस्ट भेजेंगे, वह सभी यूज़र्स और ग्रुप्स में जाएगा और सभी ग्रुप्स में ऊपर Pin भी हो जाएगा!\n(कैंसिल करने के लिए /cancel लिखें)');
});

bot.action('adm_set_fsub', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADM_SET_FSUB' });
  await ctx.reply('🔐 Master Force Subscribe Setup:\nअपने मुख्य चैनल में बॉट को Admin बनाएं और यहाँ चैनल का @username भेजें या चैनल से कोई भी एक पोस्ट यहाँ Forward करें:\n(कैंसिल करने के लिए /cancel लिखें)');
});

bot.action('adm_set_brand', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADM_SET_BRAND' });
  await ctx.reply('🏷 Smart Branding Setup:\nअपना ब्रांडिंग टेक्स्ट और लिंक | लगाकर इस तरह भेजें:\n\nउदाहरण:\n🎯 Join @MyChannel | [https://t.me/MyChannel](https://t.me/MyChannel)\n\n(कैंसिल करने के लिए /cancel लिखें)');
});

bot.action('adm_ban_user', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADM_BAN_TOGGLE' });
  await ctx.reply('🚫 Ban / Unban User:\nजिस यूज़र को Ban या Unban करना है, उसकी Telegram User ID भेजें:\n(कैंसिल करने के लिए /cancel लिखें)');
});

bot.command('cancel', (ctx) => {
  userStates.delete(ctx.from.id);
  ctx.reply('✅ एक्शन कैंसिल कर दिया गया है।');
});

// ---------------------------------------------------------
// 12. STATE HANDLER FOR BROADCAST, PIN, FSUB & BRANDING
// ---------------------------------------------------------
bot.on('message', async (ctx) => {
  const state = userStates.get(ctx.from.id);
  if (!state) return;

  if (state.action === 'ADM_BC_NORMAL' || state.action === 'ADM_BC_PIN') {
    const shouldPin = state.action === 'ADM_BC_PIN';
    userStates.delete(ctx.from.id);

    await ctx.reply('🚀 ब्रॉडकास्ट शुरू हो गया है...');
    const users = await pool.query('SELECT telegram_id FROM users WHERE is_banned = FALSE');
    const groups = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE AND is_blacklisted = FALSE');

    let uSent = 0, gSent = 0, pinned = 0;

    for (const u of users.rows) {
      try {
        await ctx.telegram.copyMessage(u.telegram_id, ctx.chat.id, ctx.message.message_id);
        uSent++;
      } catch {}
    }

    for (const g of groups.rows) {
      try {
        const copied = await ctx.telegram.copyMessage(g.chat_id, ctx.chat.id, ctx.message.message_id);
        gSent++;
        if (shouldPin && copied.message_id) {
          await ctx.telegram.pinChatMessage(g.chat_id, copied.message_id, { disable_notification: false }).catch(() => {});
          pinned++;
        }
      } catch {}
    }

    return ctx.reply(`✅ Broadcast Complete!\n\n👤 Users Reached: ${uSent}\n📢 Groups Reached: ${gSent}\n📌 Pinned in Groups: ${pinned}`);
  }

  if (state.action === 'ADM_SET_FSUB' || state.action === 'SET_GROUP_FSUB') {
    let targetChannelId = '';
    let targetInviteLink = '';

    const msg: any = ctx.message;
    if (msg.forward_from_chat && (msg.forward_from_chat.type === 'channel' || msg.forward_from_chat.type === 'supergroup')) {
      targetChannelId = msg.forward_from_chat.id.toString();
      if (msg.forward_from_chat.username) {
        targetInviteLink = `[https://t.me/$](https://t.me/$){msg.forward_from_chat.username}`;
      }
    } else if (msg.text && msg.text.trim().startsWith('@')) {
      targetChannelId = msg.text.trim();
      targetInviteLink = `[https://t.me/$](https://t.me/$){targetChannelId.replace('@', '')}`;
    } else {
      return ctx.reply('❌ कृपया चैनल का @username भेजें या चैनल से कोई पोस्ट यहाँ Forward करें (या /cancel लिखें)।');
    }

    try {
      const botMember = await ctx.telegram.getChatMember(targetChannelId, ctx.botInfo.id);
      if (botMember.status !== 'administrator') {
        return ctx.reply('⚠️ बॉट उस चैनल में Admin नहीं है! कृपया पहले बॉट को अपने चैनल में Admin बनाएं और फिर दोबारा कोशिश करें।');
      }
      if (!targetInviteLink) {
        const chatInfo: any = await ctx.telegram.getChat(targetChannelId);
        targetInviteLink = chatInfo.invite_link || (await ctx.telegram.exportChatInviteLink(targetChannelId));
      }
    } catch (err) {
      return ctx.reply('❌ बॉट उस चैनल को एक्सेस नहीं कर पा रहा है! कृपया पहले बॉट को चैनल में Admin बनाएं।');
    }

    if (state.action === 'ADM_SET_FSUB') {
      await setSetting('master_fsub_id', targetChannelId);
      await setSetting('master_fsub_link', targetInviteLink);
      await setSetting('master_fsub_on', 'true');
      userStates.delete(ctx.from.id);
      await ctx.reply(`✅ Master Force Subscribe सफलतापूर्वक सेट हो गया!\nChannel: ${targetChannelId}\nLink: ${targetInviteLink}`);
      return renderMasterAdmin(ctx);
    } else if (state.action === 'SET_GROUP_FSUB' && state.targetChatId) {
      await pool.query('UPDATE channels SET force_sub_id = $1, force_sub_link = $2 WHERE chat_id = $3', [targetChannelId, targetInviteLink, state.targetChatId]);
      userStates.delete(ctx.from.id);
      await ctx.reply(`✅ आपके ग्रुप के लिए Force Subscribe सेट हो गया!\nChannel: ${targetChannelId}\nLink: ${targetInviteLink}`);
      return renderSingleGroupControl(ctx, state.targetChatId);
    }
  }

  if (state.action === 'ADM_SET_BRAND' && 'text' in ctx.message) {
    const parts = ctx.message.text.split('|');
    const bText = parts[0]?.trim() || '🎯 Powered by Smart AI Quiz';
    const bLink = parts[1]?.trim() || '[https://t.me/telegram](https://t.me/telegram)';
    await setSetting('branding_text', bText);
    await setSetting('branding_link', bLink);
    userStates.delete(ctx.from.id);
    await ctx.reply(`✅ Smart Branding Updated!\nText: ${bText}\nLink: ${bLink}`);
    return renderMasterAdmin(ctx);
  }

  if (state.action === 'ADM_BAN_TOGGLE' && 'text' in ctx.message) {
    const targetId = Number(ctx.message.text.trim());
    if (isNaN(targetId)) return ctx.reply('❌ कृपया सही Numeric User ID डालें।');
    const check = await pool.query('SELECT is_banned FROM users WHERE telegram_id = $1', [targetId]);
    if (check.rows.length === 0) {
      await pool.query('INSERT INTO users (telegram_id, username, is_banned) VALUES ($1, $2, TRUE)', [targetId, 'BannedUser']);
      userStates.delete(ctx.from.id);
      return ctx.reply(`🚫 User ${targetId} को BAN कर दिया गया है!`);
    }
    const newBanState = !check.rows[0].is_banned;
    await pool.query('UPDATE users SET is_banned = $1 WHERE telegram_id = $2', [newBanState, targetId]);
    userStates.delete(ctx.from.id);
    return ctx.reply(newBanState ? `🚫 User ${targetId} को BAN कर दिया गया है!` : `✅ User ${targetId} को UNBAN कर दिया गया है!`);
  }
});

bot.command('forcepost', async (ctx) => {
  if (!isMasterAdmin(ctx.from.id)) return;
  const subject = getHourlySubject();
  const chs = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE AND is_blacklisted = FALSE');
  for (const ch of chs.rows) startFastQuiz(Number(ch.chat_id), subject, 50);
  ctx.reply(`🚀 ${chs.rows.length} ग्रुप्स में ${subject} का लाइव टेस्ट शुरू हो गया!`);
});

bot.command('leaderboard', async (ctx) => {
  await sendLeaderboard(ctx.chat.id, '📊 *CURRENT GROUP LEADERBOARD*');
});

// ---------------------------------------------------------
// 13. SELF-HEALING BOT LAUNCHER (PREVENTS 409 CONFLICT FREEZE)
// ---------------------------------------------------------
const startBotWithRetry = async () => {
  try {
    console.log('🔄 Connecting to Telegram Polling...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    // Telegraf v4 में bot.launch() पोलिंग के दौरान चालू रहता है, इसलिए AI जनरेशन पहले ट्रिगर करें
    setTimeout(() => { generateBatchQuestions(); }, 5000);
    await bot.launch({ dropPendingUpdates: true });
  } catch (err: any) {
    console.error('⚠️ Telegram Polling Conflict/Error (Auto-Retrying in 6s):', err?.message || err);
    setTimeout(startBotWithRetry, 6000);
  }
};

// डिप्लॉयमेंट के दौरान पुराने कंटेनर को बंद होने के लिए 4 सेकंड का समय दें
setTimeout(startBotWithRetry, 4000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
