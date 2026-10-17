import cron from 'node-cron';

// ---------------------------------------------------------
// MASTER SCHEDULING ENGINE (सुबह 8 बजे से रात 11 बजे तक)
// ---------------------------------------------------------

// विषयों की लिस्ट (आपके Zoho नोट्स के अनुसार)
const SCHEDULED_SUBJECTS = [
  "HISTORY", "GEOGRAPHY", "ECONOMY", "ENVIRONMENT", 
  "POLITY", "Current Affairs", "PHYSICS", "CHEMISTRY", 
  "MATHEMATICS", "MATH", "ENGLISH", "REASONING", "HINDI"
];

// वर्तमान घंटे के अनुसार विषय चुनने का फंक्शन (सुबह 8 = index 0)
const getCurrentSubject = () => {
  const hour = new Date().getHours(); 
  // मान लीजिए 8 AM से शुरू होता है
  const index = hour - 8; 
  if (index >= 0 && index < SCHEDULED_SUBJECTS.length) {
    return SCHEDULED_SUBJECTS[index];
  }
  return "MIXED TEST"; // अगर 13 विषय खत्म हो जाएं, तो मिक्स टेस्ट
};

// 1. रिमाइंडर: टेस्ट शुरू होने से 10 मिनट पहले (हर घंटे के 50वें मिनट पर)
cron.schedule('50 8-22 * * *', async () => {
  const subject = getCurrentSubject();
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🚨 **अलर्ट!**\n\n📚 विषय: ${subject}\n⏳ टेस्ट ठीक 10 मिनट में शुरू होने वाला है। सभी छात्र तैयार हो जाएं!`);
  }
});

// 2. रिमाइंडर: टेस्ट शुरू होने से 5 मिनट पहले (हर घंटे के 55वें मिनट पर)
cron.schedule('55 8-22 * * *', async () => {
  const subject = getCurrentSubject();
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `⚠️ **अंतिम कॉल!**\n\n📚 विषय: ${subject}\n⏳ टेस्ट 5 मिनट में शुरू होगा। अपनी सीट बेल्ट बांध लें!`);
  }
});

// 3. रिमाइंडर: टेस्ट शुरू होने से 1 मिनट पहले (हर घंटे के 59वें मिनट पर)
cron.schedule('59 8-22 * * *', async () => {
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🔥 **GET READY!**\n\nटेस्ट 1 मिनट में शुरू हो रहा है...`);
  }
});

// 4. टेस्ट की शुरुआत और 50 प्रश्नों की बौछार (हर घंटे के 00 मिनट पर)
// (नोट: अभी हम इसे सिर्फ ट्रिगर कर रहे हैं, प्रश्नों को लूप में भेजने का लॉजिक Part 3 में जोड़ेंगे)
cron.schedule('0 9-23 * * *', async () => {
  const subject = getCurrentSubject();
  const channels = await pool.query('SELECT chat_id FROM channels WHERE is_active = TRUE');
  for (const channel of channels.rows) {
    bot.telegram.sendMessage(channel.chat_id, `🚀 **${subject} का लाइव टेस्ट शुरू!**\n\nअब अगले 50 मिनट तक आपको बैक-टू-बैक प्रश्न मिलेंगे। All the best!`);
    
    // यहाँ हम डेटाबेस से उस विषय के 50 सवाल उठाएंगे और एक-एक करके भेजेंगे
    // startLiveTest(channel.chat_id, subject); // यह फंक्शन हम अगले स्टेप में बनाएंगे
  }
  // ---------------------------------------------------------
// 5. THE LIVE TEST ENGINE (50 Questions in 50 Minutes)
// ---------------------------------------------------------

const startLiveTest = async (chatId: number, subject: string) => {
  let questionCount = 0;
  const maxQuestions = 50; // एक घंटे में 50 प्रश्न
  
  // यह लूप हर 1 मिनट (60,000 milliseconds) में चलेगा
  const testInterval = setInterval(async () => {
    questionCount++;
    
    // जब 50 प्रश्न पूरे हो जाएं, तो टेस्ट रोक दें
    if (questionCount > maxQuestions) {
      clearInterval(testInterval);
      bot.telegram.sendMessage(chatId, `🏁 **${subject} का लाइव टेस्ट समाप्त!**\n\nउम्मीद है आपने अच्छा प्रदर्शन किया होगा। अपना स्कोर चेक करें। अगले टेस्ट का अनाउंसमेंट 10 मिनट में होगा!`);
      return;
    }

    try {
      // लॉजिक: डेटाबेस से वह प्रश्न निकालें जो इस विषय का हो और इस ग्रुप (chatId) में पहले कभी न पूछा गया हो
      const res = await pool.query(`
        SELECT * FROM questions 
        WHERE subject ILIKE $1 
        AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $2)
        ORDER BY RANDOM() LIMIT 1
      `, [`%${subject}%`, chatId]);

      // अगर डेटाबेस में उस विषय के नए प्रश्न खत्म हो जाएं
      if (res.rows.length === 0) {
        clearInterval(testInterval);
        bot.telegram.sendMessage(chatId, `⚠️ **सिस्टम अलर्ट:** ${subject} के लिए डेटाबेस में कोई नया प्रश्न नहीं बचा है! एडमिन कृपया और प्रश्न जनरेट करें।`);
        return;
      }

      const q = res.rows[0];

      // प्रश्न को asked_history टेबल में सेव कर दें ताकि वह इस ग्रुप में दोबारा कभी न आए
      await pool.query('INSERT INTO asked_history (chat_id, question_id) VALUES ($1, $2)', [chatId, q.id]);

      // Telegram Poll की लिमिट्स को सुरक्षित रखना
      const options = [
        q.option_a.substring(0, 95), 
        q.option_b.substring(0, 95), 
        q.option_c.substring(0, 95), 
        q.option_d.substring(0, 95)
      ];
      const correctIndex = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));

      // पोल भेजना (45 सेकंड का टाइमर) - 45 सेकंड आंसर के लिए, 15 सेकंड रेस्ट/व्याख्या पढ़ने के लिए
      await bot.telegram.sendQuiz(
        chatId,
        `[Q${questionCount}/${maxQuestions}] ${q.question_text.substring(0, 280)}`,
        options,
        {
          correct_option_id: correctIndex !== -1 ? correctIndex : 0,
          explanation: q.explanation ? q.explanation.substring(0, 190) : 'व्याख्या उपलब्ध नहीं है',
          open_period: 45 
        }
      );

    } catch (error) {
      console.error('Error sending live question:', error);
    }
  }, 60000); // 60000 ms = 1 मिनट
};
});
