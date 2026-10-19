// 15. GROUP ADDITION & START/STOP MANAGEMENT
bot.on('my_chat_member', async (ctx) => {
  try {
    const st = ctx.myChatMember.new_chat_member.status;
    const chat: any = ctx.myChatMember.chat;
    const adder = ctx.myChatMember.from;
    if (['group', 'supergroup', 'channel'].includes(chat.type) && ['administrator', 'member'].includes(st)) {
      const chatTitle = chat.title || 'Educational Group';
      await pool.query(
        'INSERT INTO channels(chat_id, title, owner_id, is_active) VALUES($1,$2,$3,TRUE) ON CONFLICT(chat_id) DO UPDATE SET title=$2, is_active=TRUE',
        [chat.id, chatTitle, adder.id]
      );
      await safeSend(
        chat.id,
        '🎓 *धन्यवाद! Professor AI Quiz Bot अब "' + chatTitle + '" में सक्रिय है!*\n' +
        '🎁 *1 Month Free Trial Activated!* यहाँ प्रतिदिन सुबह 8 बजे से रात 11 बजे तक विषयवार लाइव टेस्ट चलेंगे।\n' +
        'नीचे दिए गए बटन से अभी टेस्ट शुरू या बंद करें:',
        Markup.inlineKeyboard([
          [Markup.button.callback('▶️ Start Live Quiz', 'gstart_' + chat.id), Markup.button.callback('🛑 Stop Quiz', 'pause_test_' + chat.id)]
        ])
      );
    }
  } catch {}
});

bot.command('setupgroup', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('यह कमांड अपने ग्रुप के अंदर लिखें।');
  const chatObj: any = ctx.chat;
  const chatTitle = chatObj.title || 'Group';
  await pool.query(
    'INSERT INTO channels(chat_id, title, owner_id, is_active) VALUES($1,$2,$3,TRUE) ON CONFLICT(chat_id) DO UPDATE SET title=$2, owner_id=$3, is_active=TRUE',
    [ctx.chat.id, chatTitle, ctx.from.id]
  );
  return safeSend(
    ctx.chat.id,
    '✅ *"' + chatTitle + '" लाइव टेस्ट सीरीज़ के लिए जुड़ गया है!* (30 Days Free Trial Active)',
    Markup.inlineKeyboard([[Markup.button.callback('▶️ Start Test Now', 'gstart_' + ctx.chat.id), Markup.button.callback('🛑 Stop Test', 'pause_test_' + ctx.chat.id)]])
  );
});
