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
});
