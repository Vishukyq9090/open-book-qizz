import { Telegraf, Markup } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import http from 'http';
import cron from 'node-cron';

dotenv.config();

http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Professor AI Quiz Bot V4 Enterprise Running 24/7!');
}).listen(process.env.PORT || 3000);

process.on('uncaughtException', (e) => console.error('Uncaught Exception:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled Rejection:', e));

const bot = new Telegraf(process.env.BOT_TOKEN || '');
const ADMIN_ID = (process.env.ADMIN_ID || '').trim();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SCHEDULE_15H = [
  'HISTORY', 'GEOGRAPHY', 'ECONOMY', 'ENVIRONMENT', 'POLITY', 'CURRENT AFFAIRS',
  'PHYSICS', 'CHEMISTRY', 'GS MATHEMATICS', 'MATH', 'ENGLISH', 'REASONING', 'HINDI',
  'MIXED TEST 1', 'MIXED TEST 2'
];

const SYLLABUS_MAP: Record<string, string[]> = {
  'HISTORY': [
    'पाषाण काल एवं सिंधु घाटी सभ्यता', 'वैदिक संस्कृति एवं 16 महाजनपद', 'बौद्ध धर्म एवं जैन धर्म',
    'मौर्य साम्राज्य (चंद्रगुप्त एवं अशोक)', 'गुप्त साम्राज्य एवं दक्षिण भारतीय राजवंश', 'दिल्ली सल्तनत (गुलाम से लोदी वंश)',
    'भक्ति एवं सूफी आंदोलन', 'मुगल साम्राज्य एवं प्रशासन', 'मराठा साम्राज्य एवं सिख गुरु',
    'यूरोपीय कंपनियों का आगमन एवं ब्रिटिश विस्तार', '1857 की क्रांति एवं जनजातीय विद्रोह',
    'सामाजिक-धार्मिक सुधार आंदोलन', 'भारतीय राष्ट्रीय कांग्रेस एवं राष्ट्रीय आंदोलन',
    'गांधी युग एवं स्वतंत्रता संग्राम (1915-1947)', 'स्वतंत्रता के बाद भारत एवं प्रमुख ऐतिहासिक संधियां'
  ],
  'GEOGRAPHY': [
    'भारत का सामान्य परिचय एवं भौतिक विभाजन', 'हिमालय पर्वत श्रृंखला एवं प्रमुख दर्रे',
    'सिंधु, गंगा एवं ब्रह्मपुत्र नदी तंत्र', 'प्रायद्वीपीय भारत की नदियां एवं जलप्रपात',
    'भारतीय मानसून, जलवायु एवं वर्षा', 'भारत की मिट्टियां एवं प्राकृतिक वनस्पति',
    'भारत में कृषि, सिंचाई एवं बहुउद्देशीय परियोजनाएं', 'खनिज संसाधन, ऊर्जा एवं प्रमुख उद्योग',
    'भारत में परिवहन एवं जनगणना (2011)', 'सौरमंडल एवं पृथ्वी की गतियां',
    'पृथ्वी की आंतरिक संरचना, भूकंप एवं ज्वालामुखी', 'चट्टानें, महाद्वीप एवं पर्वत निर्माण',
    'वायुमंडल की परतें, पवनें एवं चक्रवात', 'महासागरीय जलधाराएं, ज्वार-भाटा एवं लवणता',
    'विश्व के प्रमुख मरुस्थल, घास के मैदान एवं जनजातियां'
  ],
  'ECONOMY': [
    'अर्थव्यवस्था का परिचय एवं राष्ट्रीय आय (GDP, GNP)', 'आर्थिक नियोजन, पंचवर्षीय योजनाएं एवं नीति आयोग',
    'मुद्रा एवं बैंकिंग प्रणाली (RBI एवं मौद्रिक नीति)', 'मुद्रास्फीति (Inflation) एवं नियंत्रण के उपाय',
    'भारतीय कर प्रणाली (GST, प्रत्यक्ष एवं अप्रत्यक्ष कर)', 'केंद्रीय बजट, राजकोषीय घाटा एवं वित्त आयोग',
    'गरीबी, बेरोजगारी एवं प्रमुख सामाजिक कल्याण योजनाएं', 'भारतीय कृषि, हरित क्रांति एवं MSP',
    'औद्योगिक नीति, MSME एवं महारत्न कंपनियां', 'भारतीय पूंजी बाजार (SEBI, शेयर बाजार)',
    'विदेशी व्यापार, भुगतान संतुलन एवं विदेशी मुद्रा भंडार', 'अंतरराष्ट्रीय आर्थिक संगठन (IMF, World Bank, WTO)'
  ],
  'ENVIRONMENT': [
    'पारिस्थितिकी (Ecology) एवं पारिस्थितिकी तंत्र के घटक', 'खाद्य श्रृंखला, खाद्य जाल एवं पारिस्थितिक पिरामिड',
    'जैव-भू-रासायनिक चक्र (कार्बन, नाइट्रोजन, जल चक्र)', 'जैव विविधता (Biodiversity), हॉटस्पॉट एवं संरक्षण',
    'भारत के राष्ट्रीय उद्यान एवं वन्यजीव अभयारण्य', 'टाइगर रिजर्व, हाथी परियोजना एवं बायोस्फीयर रिजर्व',
    'रामसर आर्द्रभूमि (Wetlands) एवं प्रवाल भित्तियां', 'वायु, जल, मृदा एवं ध्वनि प्रदूषण',
    'ग्रीनहाउस प्रभाव, ग्लोबल वार्मिंग एवं जलवायु परिवर्तन', 'ओजोन परत क्षरण एवं अम्लीय वर्षा',
    'पर्यावरण संरक्षण अधिनियम एवं प्रमुख आंदोलन', 'अंतरराष्ट्रीय पर्यावरण सम्मेलन (रियो, क्योटो, पेरिस, COP)'
  ],
  'POLITY': [
    'भारत का संवैधानिक विकास (1773 से 1947 तक)', 'संविधान सभा, संविधान के स्रोत एवं प्रस्तावना',
    'संघ एवं उसका राज्य क्षेत्र तथा नागरिकता', 'मूल अधिकार (Fundamental Rights - अनुच्छेद 12 से 35)',
    'राज्य के नीति निर्देशक तत्व (DPSP) एवं मूल कर्तव्य', 'राष्ट्रपति एवं उपराष्ट्रपति: निर्वाचन एवं शक्तियां',
    'प्रधानमंत्री, मंत्रिपरिषद एवं महान्यायवादी', 'संसद: लोकसभा, राज्यसभा एवं विधायी प्रक्रिया',
    'सर्वोच्च न्यायालय (Supreme Court) एवं न्यायिक पुनरावलोकन', 'राज्यपाल, मुख्यमंत्री एवं राज्य विधानमंडल',
    'उच्च न्यायालय (High Court) एवं अधीनस्थ न्यायालय', 'केंद्र-राज्य संबंध एवं आपातकालीन प्रावधान',
    'पंचायती राज व्यवस्था एवं नगरपालिकाएं', 'निर्वाचन आयोग, UPSC, CAG एवं संवैधानिक आयोग',
    'प्रमुख संविधान संशोधन एवं महत्वपूर्ण अनुच्छेद व अनुसूचियां'
  ],
  'CURRENT AFFAIRS': [
    'राष्ट्रीय समसामयिकी एवं केंद्र सरकार के प्रमुख निर्णय', 'अंतरराष्ट्रीय शिखर सम्मेलन एवं वैदेशिक संबंध',
    'केंद्र एवं राज्य सरकारों की नवीनतम कल्याणकारी योजनाएं', 'प्रमुख राष्ट्रीय एवं अंतरराष्ट्रीय पुरस्कार व सम्मान',
    'खेलकूद: क्रिकेट, ओलंपिक, एशियाई खेल एवं टूर्नामेंट', 'विज्ञान एवं प्रौद्योगिकी, रक्षा अभ्यास एवं मिसाइल परीक्षण',
    'ISRO के अंतरिक्ष मिशन एवं नई तकनीकी खोजें', 'आर्थिक समीक्षा, नवीनतम बजट एवं जीडीपी अनुमान',
    'प्रमुख वैश्विक सूचकांक (Global Indexes) में भारत की रैंकिंग', 'महत्वपूर्ण राष्ट्रीय एवं अंतरराष्ट्रीय नियुक्तियां',
    'चर्चित पुस्तकें, लेखक एवं महत्वपूर्ण दिवस', 'पर्यावरण, जीआई टैग (GI Tags) एवं चर्चित स्थल'
  ],
  'PHYSICS': [
    'मात्रक, मापन एवं सदिश-अदिश राशियां', 'गति के नियम, वेग, त्वरण एवं प्रक्षेप्य गति',
    'कार्य, ऊर्जा, शक्ति एवं घर्षण', 'गुरुत्वाकर्षण, ग्रहों की गति एवं पलायन वेग',
    'द्रवों के यांत्रिक गुण: दाब, प्लवन, पृष्ठ तनाव एवं श्यानता', 'ऊष्मा, तापमान एवं ऊष्मागतिकी के नियम',
    'तरंग गति एवं ध्वनि तरंगें (डॉपलर प्रभाव, प्रतिध्वनि)', 'प्रकाश: परावर्तन, अपवर्तन एवं पूर्ण आंतरिक परावर्तन',
    'लेंस, दर्पण, मानव नेत्र एवं प्रकाशिक यंत्र', 'विद्युत धारा, ओम का नियम, प्रतिरोध एवं विद्युत शक्ति',
    'चुंबकत्व एवं विद्युत-चुंबकीय प्रेरण', 'आधुनिक भौतिकी, परमाणु भौतिकी एवं आविष्कार'
  ],
  'CHEMISTRY': [
    'पदार्थ की अवस्थाएं, तत्व, यौगिक एवं मिश्रण', 'परमाणु संरचना, इलेक्ट्रॉनिक विन्यास एवं समस्थानिक',
    'रेडियोधर्मिता एवं नाभिकीय विखंडन व संलयन', 'रासायनिक बंधन एवं ऑक्सीकरण-अपचयन अभिक्रियाएं',
    'तत्वों का आवर्ती वर्गीकरण (Periodic Table)', 'अम्ल, क्षार, लवण एवं pH मान',
    'धातुएं, खनिज, अयस्क एवं धातुकर्म', 'अधातुएं, उनके यौगिक एवं प्रमुख गैसें',
    'मिश्रधातुएं (Alloys), उपधातु एवं उनके उपयोग', 'कार्बन एवं उसके यौगिक, हाइड्रोकार्बन एवं ईंधन',
    'बहुलक (Polymers), प्लास्टिक, रबर एवं रेशे', 'दैनिक जीवन में रसायन: साबुन, उर्वरक, कांच एवं औषधियां'
  ],
  'GS MATHEMATICS': [
    'जीव विज्ञान: कोशिका विज्ञान एवं आनुवंशिकी', 'मानव पाचन तंत्र, विटामिन एवं पोषण',
    'रक्त परिसंचरण तंत्र, हृदय एवं रक्त समूह', 'श्वसन तंत्र, उत्सर्जन तंत्र एवं कंकाल तंत्र',
    'तंत्रिका तंत्र, मानव मस्तिष्क एवं अंतःस्रावी ग्रंथियां', 'मानव रोग: जीवाणु, विषाणु एवं प्रोटोजोआ जनित रोग',
    'वनस्पति विज्ञान: प्रकाश संश्लेषण एवं पादप हार्मोन', 'प्रारंभिक अंकगणित: संख्याओं की समझ एवं भिन्न',
    'सामान्य प्रतिशत एवं औसत पर आधारित प्रश्न', 'समय, दूरी एवं कार्य की बुनियादी गणनाएं',
    'सांख्यिकी के मूल तत्व एवं ग्राफ विश्लेषण', 'तार्किक एवं वैज्ञानिक विश्लेषण क्षमता'
  ],
  'MATH': [
    'संख्या पद्धति (Number System) एवं विभाज्यता', 'लघुत्तम समापवर्त्य (LCM) एवं महत्तम समापवर्तक (HCF)',
    'सरलीकरण (Simplification), घातांक एवं करणी', 'औसत (Average) एवं आयु संबंधी प्रश्न',
    'अनुपात एवं समानुपात तथा साझेदारी', 'प्रतिशतता (Percentage) के अनुप्रयोग',
    'लाभ, हानि एवं बट्टा (Profit, Loss & Discount)', 'साधारण ब्याज (SI) एवं चक्रवृद्धि ब्याज (CI)',
    'समय और कार्य (Time & Work) तथा पाइप और टंकी', 'समय, चाल और दूरी तथा रेलगाड़ी व नाव',
    'मिश्रण और पृथ्थीकरण (Mixture & Alligation)', 'क्षेत्रमिति (Mensuration 2D & 3D)',
    'बीजगणित, त्रिकोणमिति एवं डेटा इंटरप्रिटेशन'
  ],
  'ENGLISH': [
    'Subject-Verb Agreement & Parts of Speech', 'Tenses, Conditional Sentences & Modals',
    'Articles, Prepositions & Conjunctions', 'Active and Passive Voice Transformation',
    'Direct and Indirect Speech (Narration)', 'Spotting Grammatical Errors in Sentences',
    'Sentence Improvement & Phrase Replacement', 'Fill in the Blanks (Grammar & Vocabulary)',
    'High-Frequency Synonyms & Antonyms', 'One Word Substitutions for Exams',
    'Idioms and Phrases with Meanings', 'Spelling Correction & Confusing Words',
    'Para Jumbles & Reading Comprehension'
  ],
  'REASONING': [
    'वर्णमाला परीक्षण एवं कोडिंग-डिकोडिंग', 'संख्या एवं अक्षर श्रृंखला (Series)',
    'सादृश्यता (Analogy) एवं विषम की पहचान', 'दिशा और दूरी परीक्षण (Direction & Distance)',
    'रक्त संबंध (Blood Relations) एवं पहेली', 'क्रम व्यवस्था (Order & Ranking) एवं बैठक व्यवस्था',
    'न्याय निगमन (Syllogism) एवं कथन-निष्कर्ष', 'वेन आरेख (Venn Diagrams) एवं तार्किक विश्लेषण',
    'लुप्त संख्या ज्ञात करना एवं गणितीय संक्रियाएं', 'कैलेंडर (Calendar) एवं घड़ी (Clock) के प्रश्न',
    'पासा (Dice), घन एवं घनाभ', 'दर्पण प्रतिबिंब एवं आकृति गणना'
  ],
  'HINDI': [
    'हिंदी वर्णमाला, स्वर एवं व्यंजनों का वर्गीकरण', 'संधि एवं संधि-विच्छेद (स्वर, व्यंजन, विसर्ग)',
    'समास एवं समास विग्रह के नियम', 'उपसर्ग एवं प्रत्यय की पहचान',
    'तत्सम, तद्भव, देशज एवं विदेशज शब्द', 'संज्ञा, सर्वनाम, विशेषण, क्रिया एवं अव्यय',
    'पर्यायवाची एवं समानार्थी शब्द', 'विलोम (विपरीतार्थक) शब्द',
    'वाक्यांश के लिए एक शब्द एवं समरूपी भिन्नार्थक', 'मुहावरे एवं लोकोक्तियां तथा उनके अर्थ',
    'वर्तनी शुद्धि एवं वाक्य अशुद्धि संशोधन', 'रस, छंद एवं अलंकार के भेद व उदाहरण',
    'हिंदी साहित्य की प्रमुख रचनाएं एवं कवि'
  ]
};

const APTITUDE_SUBS = ['MATH', 'ENGLISH', 'REASONING', 'GS MATHEMATICS'];
const DIFF_TIERS = ['Easy', 'Medium', 'Hard', 'Ultra Hard', 'Max Hard'];
const EXAMS = ['UPSC / UPPSC', 'SSC / Railway', 'Teaching / TET', 'All Competitive Exams'];

const getPollTimer = (subject: string, diff: string): number => {
  const isApt = APTITUDE_SUBS.includes(subject.toUpperCase());
  const map: Record<string, number> = isApt
    ? { 'Easy': 30, 'Medium': 35, 'Hard': 40, 'Ultra Hard': 45, 'Max Hard': 55 }
    : { 'Easy': 15, 'Medium': 20, 'Hard': 25, 'Ultra Hard': 30, 'Max Hard': 40 };
  return map[diff] || (isApt ? 35 : 20);
};

const activeTests = new Map<number, { timer: NodeJS.Timeout; subject: string; currentQ: number }>();
const reminderMsgIds = new Map<number, number[]>();
const userStates = new Map<number, { action: string; targetId?: number }>();

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const safeSend = async (chatId: number | string, text: string, extra: any = {}) => {
  try {
    return await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
  } catch {
    return await bot.telegram.sendMessage(chatId, text.replace(/[*_`]/g, ''), extra).catch(() => null);
  }
};

const safeEdit = async (ctx: any, text: string, extra: any = {}) => {
  try {
    return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...extra });
  } catch {
    return await ctx.editMessageText(text.replace(/[*_`]/g, ''), extra).catch(() => null);
  }
};

const isMaster = (uid: number) => Boolean(ADMIN_ID) && uid.toString() === ADMIN_ID;

const initDB = async () => {
  try {
    const queries = [
      "CREATE TABLE IF NOT EXISTS users (telegram_id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, is_banned BOOLEAN DEFAULT FALSE, target_exam TEXT DEFAULT 'UPSC / UPPSC', preferred_subjects TEXT[] DEFAULT ARRAY['HISTORY','POLITY','GEOGRAPHY','CURRENT AFFAIRS'], alerts_enabled BOOLEAN DEFAULT TRUE, referred_by BIGINT DEFAULT NULL, ref_credited BOOLEAN DEFAULT FALSE, wallet_balance INT DEFAULT 0, referral_count INT DEFAULT 0, last_cleared_at TEXT DEFAULT NULL, joined_at TIMESTAMP DEFAULT NOW())",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_credited BOOLEAN DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_cleared_at TEXT DEFAULT NULL",
      "CREATE TABLE IF NOT EXISTS channels (chat_id BIGINT PRIMARY KEY, title TEXT, chat_type TEXT DEFAULT 'supergroup', owner_id BIGINT, is_active BOOLEAN DEFAULT TRUE, approval_status TEXT DEFAULT 'APPROVED', custom_caption TEXT DEFAULT NULL, trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'), sub_ends_at TIMESTAMP DEFAULT NULL, checkpoints JSONB DEFAULT '{}'::jsonb)",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS chat_type TEXT DEFAULT 'supergroup'",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'APPROVED'",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS custom_caption TEXT DEFAULT NULL",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS sub_ends_at TIMESTAMP DEFAULT NULL",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS checkpoints JSONB DEFAULT '{}'::jsonb",
      "CREATE TABLE IF NOT EXISTS questions (id SERIAL PRIMARY KEY, subject TEXT, topic TEXT, question_text TEXT UNIQUE, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_option TEXT, explanation TEXT, difficulty TEXT DEFAULT 'Medium', is_pyq BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_pyq BOOLEAN DEFAULT FALSE",
      "CREATE TABLE IF NOT EXISTS syllabus_progress (subject TEXT PRIMARY KEY, topic_index INT DEFAULT 0, cycles_completed INT DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS asked_history (chat_id BIGINT, question_id INT, PRIMARY KEY (chat_id, question_id))",
      "CREATE TABLE IF NOT EXISTS poll_tracking (poll_id TEXT PRIMARY KEY, chat_id BIGINT, correct_index INT, created_at TIMESTAMP DEFAULT NOW())",
      "ALTER TABLE poll_tracking ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
      "CREATE TABLE IF NOT EXISTS test_scores (chat_id BIGINT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(7,2) DEFAULT 0.00, PRIMARY KEY (chat_id, user_id))",
      "CREATE TABLE IF NOT EXISTS monthly_scores (month_key TEXT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(8,2) DEFAULT 0.00, PRIMARY KEY (month_key, user_id))",
      "CREATE TABLE IF NOT EXISTS bot_settings (key TEXT PRIMARY KEY, value TEXT)",
      "INSERT INTO bot_settings (key, value) VALUES ('fsub1_id', ''), ('fsub1_link', ''), ('fsub2_id', ''), ('fsub2_link', ''), ('fsub_enabled', 'false'), ('gift_tagline', '🎁 *विशेष घोषणा: 1 नवंबर से जो छात्र इस टेस्ट सीरीज़ में टॉप पर आएगा, उसे ₹100 का Gift Card इनाम में दिया जाएगा!*'), ('promo_msg', '💡 *Professor Bot Tip:* आप इस स्मार्ट क्विज़ बॉट को अपने ग्रुप या चैनल में जोड़कर छात्रों को इकट्ठा कर सकते हैं और अपना एजुकेशनल नेटवर्क तेजी से बढ़ा सकते हैं! (30 दिन बिल्कुल मुफ्त ट्रायल)'), ('seo_tags', '#UPSC #UPPSC #SSC #RailwayExams #LiveQuiz #TestSeries #DailyGK #ProfessorBot'), ('factory_on', 'true') ON CONFLICT (key) DO NOTHING"
    ];
    for (const q of queries) {
      await pool.query(q).catch(() => {});
    }
    console.log('Professor V4 Enterprise Database Ready!');
  } catch (e) {
    console.error('DB Init Error:', e);
  }
};
initDB();

const getCfg = async (k: string) => (await pool.query('SELECT value FROM bot_settings WHERE key=$1', [k]).catch(() => ({ rows: [] }))).rows[0]?.value || '';
const setCfg = async (k: string, v: string) => pool.query('INSERT INTO bot_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [k, v]);

// 2 MANDATORY FSUB CHANNELS CHECKER
const checkTwoFSub = async (uid: number) => {
  if (isMaster(uid)) return { ok: true, missing: [] };
  if ((await getCfg('fsub_enabled')) !== 'true') return { ok: true, missing: [] };
  const missing: { title: string; link: string }[] = [];
  const pairs = [
    ['fsub1_id', 'fsub1_link', '📢 1. Join Main Official Channel'],
    ['fsub2_id', 'fsub2_link', '💬 2. Join Official Quiz Group / Channel']
  ];
  for (const [idKey, linkKey, label] of pairs) {
    const cid = await getCfg(idKey);
    const link = await getCfg(linkKey);
    if (cid && link) {
      try {
        const m = await bot.telegram.getChatMember(cid, uid);
        if (['left', 'kicked'].includes(m.status)) missing.push({ title: label, link });
      } catch {}
    }
  }
  return { ok: missing.length === 0, missing };
};

// CREDIT ₹5 REFERRAL REWARD ONCE NEW USER PASSES FSUB
const creditReferralIfEligible = async (uid: number) => {
  try {
    const res = await pool.query('SELECT referred_by, ref_credited, first_name FROM users WHERE telegram_id=$1', [uid]);
    if (res.rows.length === 0) return;
    const u = res.rows[0];
    if (u.referred_by && !u.ref_credited && Number(u.referred_by) !== uid) {
      await pool.query('UPDATE users SET ref_credited = TRUE WHERE telegram_id = $1', [uid]);
      await pool.query(
        'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + 5, referral_count = COALESCE(referral_count, 0) + 1 WHERE telegram_id = $1',
        [u.referred_by]
      );
      await safeSend(
        u.referred_by,
        '🎉 *बधाई हो! नया रेफ़रल सफल हुआ!*\n👤 छात्र: *' + (u.first_name || 'Student') + '* ने बॉट जॉइन कर लिया है।\n💰 आपके वॉलेट में *+₹5* जोड़ दिए गए हैं! (/refer दबाकर अपना बैलेंस चेक करें)'
      );
    }
  } catch {}
};

bot.use(async (ctx, next) => {
  if (ctx.from) {
    const r = await pool.query('SELECT is_banned FROM users WHERE telegram_id=$1', [ctx.from.id]).catch(() => ({ rows: [] }));
    if (r.rows[0]?.is_banned) {
      if (ctx.chat?.type === 'private') return ctx.reply('🚫 आपको एडमिन द्वारा इस बॉट से प्रतिबंधित किया गया है।');
      return;
    }
  }
  return next();
});

// GROUP / CHANNEL SUBSCRIPTION & APPROVAL CHECKER (30 DAYS TRIAL + 100 STARS/YEAR + ADMIN APPROVAL)
const isGroupAllowedToPost = (row: any): { ok: boolean; reason: string } => {
  if (row.owner_id && isMaster(Number(row.owner_id))) return { ok: true, reason: 'MASTER' };
  if (row.approval_status === 'REJECTED') return { ok: false, reason: 'REJECTED' };
  if (row.approval_status === 'PENDING') return { ok: false, reason: 'PENDING_APPROVAL' };
  const now = new Date();
  if (row.sub_ends_at && new Date(row.sub_ends_at) > now) return { ok: true, reason: 'SUB_ACTIVE' };
  if (row.trial_ends_at && new Date(row.trial_ends_at) > now) return { ok: true, reason: 'TRIAL_ACTIVE' };
  return { ok: false, reason: 'EXPIRED' };
};

const sendStarsInvoice = async (destChatId: number, targetGroupId: number) => {
  try {
    await bot.telegram.sendInvoice(destChatId, {
      title: 'Professor Quiz Bot - 1 Year Pro Activation',
      description: 'अपने ग्रुप/चैनल में 1 साल (365 दिन) के लिए ऑटोमैटिक लाइव क्विज़ और कस्टमाइज़ेशन तुरंत एक्टिवेट करें।',
      payload: 'sub_group_' + targetGroupId,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: '1 Year Channel/Group Activation', amount: 100 }]
    });
  } catch (e) {
    console.error('Stars Invoice Error:', e);
  }
};

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true).catch(() => {}));
bot.on('successful_payment', async (ctx) => {
  const payload = ctx.message.successful_payment.invoice_payload;
  if (payload.startsWith('sub_group_')) {
    const targetChatId = Number(payload.replace('sub_group_', ''));
    await pool.query(
      "UPDATE channels SET sub_ends_at = NOW() + INTERVAL '365 days', approval_status = 'APPROVED', is_active = TRUE WHERE chat_id = $1",
      [targetChatId]
    );
    await safeSend(
      ctx.chat.id,
      '🎉 *भुगतान सफल (100 Stars)!*\nआपका ग्रुप/चैनल (' + targetChatId + ') पूरे *1 साल (365 दिन)* के लिए ऑटो-एक्टिवेट कर दिया गया है!'
    );
    if (ADMIN_ID) {
      await safeSend(ADMIN_ID, '⭐ *100 Stars Payment Received!*\nGroup ID: ' + targetChatId + '\nPaid by User: ' + ctx.from.id);
    }
  }
});

// MAX FREE SPEED GEMINI QUESTION FACTORY (RUNS EVERY 1 MINUTE)
let seedCursor = 0;

const getNextSubjectAndTopic = async (forcedSubject?: string): Promise<{ subject: string; topic: string }> => {
  const coreSubjects = SCHEDULE_15H.slice(0, 13);
  let subject = forcedSubject || '';

  if (!subject) {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const hrIdx = ist.getUTCHours() - 8;
    if (hrIdx >= 0 && hrIdx < 13) {
      const currSub = coreSubjects[hrIdx];
      const cntRes = await pool.query('SELECT COUNT(*) FROM questions WHERE subject=$1', [currSub]).catch(() => ({ rows: [{ count: 100 }] }));
      if (Number(cntRes.rows[0]?.count || 0) < 60) {
        subject = currSub;
      }
    }
  }

  if (!subject) {
    subject = coreSubjects[seedCursor++ % coreSubjects.length];
  }

  const topics = SYLLABUS_MAP[subject] || ['संपूर्ण पाठ्यक्रम एवं महत्वपूर्ण प्रश्न'];
  const progRes = await pool.query('SELECT topic_index, cycles_completed FROM syllabus_progress WHERE subject=$1', [subject]).catch(() => ({ rows: [] }));

  let tIdx = Number(progRes.rows[0]?.topic_index || 0);
  let cycles = Number(progRes.rows[0]?.cycles_completed || 0);

  if (tIdx >= topics.length) {
    tIdx = 0;
    cycles++;
  }

  const topic = topics[tIdx];
  const nextIdx = (tIdx + 1) % topics.length;
  const nextCycles = tIdx + 1 >= topics.length ? cycles + 1 : cycles;

  await pool.query(
    'INSERT INTO syllabus_progress (subject, topic_index, cycles_completed) VALUES ($1, $2, $3) ON CONFLICT (subject) DO UPDATE SET topic_index = $2, cycles_completed = $3',
    [subject, nextIdx, nextCycles]
  ).catch(() => {});

  return { subject, topic };
};

const generateQuestionsBatch = async (forcedSub?: string) => {
  if ((await getCfg('factory_on')) === 'false' && !forcedSub) {
    return { ok: false, count: 0, sub: 'PAUSED', topic: '' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, count: 0, sub: 'NO_KEY', topic: '' };

  const { subject, topic } = await getNextSubjectAndTopic(forcedSub);

  const prompt = [
    'You are a senior Indian Competitive Exam Professor (UPSC, UPPSC, SSC CGL, Railway).',
    'Generate 10 100% fact-checked, error-free Multiple Choice Questions on:',
    'Subject: ' + subject,
    'Specific Syllabus Topic: ' + topic,
    'Language: Hindi (if subject is ENGLISH, write in English).',
    'MANDATORY DISTRIBUTION IN THESE 10 QUESTIONS:',
    '1. Difficulty tiers: Exactly 2 "Easy", 2 "Medium", 2 "Hard", 2 "Ultra Hard", and 2 "Max Hard" questions.',
    '2. Exam PYQs: At least 3 questions MUST be most-repeated Previous Year Questions (mention exam name & year in brackets at end of question_text, e.g. [UPPSC 2022]) and set "is_pyq": true.',
    'STRICT LIMITS:',
    '- "question_text": Max 215 characters.',
    '- "option_a", "option_b", "option_c", "option_d": Max 85 characters each.',
    '- "explanation": Max 155 characters (authoritative professor explanation).',
    '- "correct_option": Strictly "A", "B", "C", or "D".',
    '- "difficulty": Strictly "Easy", "Medium", "Hard", "Ultra Hard", or "Max Hard".',
    '- "is_pyq": Boolean (true or false).',
    'Return ONLY a raw JSON Array of 10 objects.'
  ].join('\n');

  for (const model of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.5 }
        })
      });
      const d = await r.json();
      let txt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!txt) continue;
      txt = txt.replace(/```json/g, '').replace(/```/g, '').trim();
      const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) continue;

      let saved = 0;
      for (const q of arr) {
        if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.correct_option) continue;
        const cOpt = q.correct_option.toString().trim().toUpperCase().charAt(0);
        if (!['A', 'B', 'C', 'D'].includes(cOpt)) continue;

        const res = await pool.query(
          'INSERT INTO questions (subject, topic, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, is_pyq) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (question_text) DO NOTHING RETURNING id',
          [
            subject,
            topic,
            q.question_text.substring(0, 235),
            q.option_a.substring(0, 95),
            q.option_b.substring(0, 95),
            q.option_c.substring(0, 95),
            q.option_d.substring(0, 95),
            cOpt,
            (q.explanation || 'प्रमाणित एवं सत्यापित उत्तर।').substring(0, 180),
            DIFF_TIERS.includes(q.difficulty) ? q.difficulty : 'Medium',
            Boolean(q.is_pyq)
          ]
        ).catch(() => ({ rowCount: 0 }));

        if (res && res.rowCount && res.rowCount > 0) saved++;
      }
      console.log('Max-Speed Auto-Seeded: [' + subject + ' -> ' + topic + '] (+' + saved + ' Qs)');
      return { ok: true, count: saved, sub: subject, topic };
    } catch {}
  }
  return { ok: false, count: 0, sub: subject, topic };
};

// Runs EVERY 1 MINUTE (Max Gemini Free Quota Speed)
cron.schedule('* * * * *', () => {
  generateQuestionsBatch();
});

const clearOldReminders = async (chatId: number) => {
  const ids = reminderMsgIds.get(chatId) || [];
  for (const mid of ids) {
    await bot.telegram.deleteMessage(chatId, mid).catch(() => {});
  }
  reminderMsgIds.delete(chatId);
};

// TOP 10 WINNER ANNOUNCEMENT & PIN (BEFORE NEXT SUBJECT STARTS)
const announceAndPinLeaderboard = async (chatId: number, subject: string) => {
  try {
    const giftTag = await getCfg('gift_tagline');
    const seoTags = await getCfg('seo_tags');
    const top = await pool.query(
      'SELECT user_id, username, right_count, wrong_count, net_marks FROM test_scores WHERE chat_id=$1 ORDER BY net_marks DESC, right_count DESC LIMIT 10',
      [chatId]
    );

    let msg = '🏛 *PROFESSOR LIVE TEST RESULT: ' + subject + '* 🏛\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '⚖️ *नियम:* सही (+1.00) | गलत (-0.25 / 1/4 नेगेटिव मार्किंग)\n\n';

    if (top.rows.length === 0) {
      msg += 'इस सत्र में किसी भी विद्यार्थी का व्यक्तिगत स्कोर दर्ज नहीं हुआ (चैनल मोड में पोल अनाम होते हैं, ग्रुप में जुड़कर नाम सहित रैंक पाएं!)।\n\n';
    } else {
      msg += '🏆 *TOP 10 WINNERS MERIT LIST:*\n\n';
      top.rows.forEach((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖 ' + (i + 1) + '.';
        const deducted = (Number(r.wrong_count) * 0.25).toFixed(2);
        msg += medal + ' [' + r.username + '](tg://user?id=' + r.user_id + ')\n';
        msg += '   ├ ✅ तुमने सही किए: *' + r.right_count + '* | ❌ गलत हुए: *' + r.wrong_count + '*\n';
        msg += '   ├ ✂️ नेगेटिव मार्किंग से कटे अंक: *-' + deducted + '*\n';
        msg += '   └ 🎯 *कुल प्राप्तांक: ' + Number(r.net_marks).toFixed(2) + ' / 50*\n\n';
      });
    }

    msg += '*' + giftTag + '*\n\n';
    msg += '📊 *मंथली मेरिट लिस्ट:* /monthlytop | 💰 *Refer & Earn ₹5:* /refer\n';
    msg += '⏳ *अगला लाइव टेस्ट ठीक 10 मिनट बाद नए विषय के साथ शुरू होगा!*\n' + seoTags;

    const sent = await safeSend(chatId, msg);
    if (sent && 'message_id' in sent) {
      await bot.telegram.pinChatMessage(chatId, sent.message_id, { disable_notification: false }).catch(() => {});
    }
  } catch (e) {
    console.error('Leaderboard Error:', e);
  }
};

const stopTestInGroup = async (chatId: number, saveCheckpoint: boolean = true) => {
  const running = activeTests.get(chatId);
  if (!running) return;
  clearInterval(running.timer);
  activeTests.delete(chatId);

  if (saveCheckpoint && running.currentQ < 50) {
    await pool.query(
      "UPDATE channels SET checkpoints = jsonb_set(COALESCE(checkpoints, '{}'::jsonb), ARRAY[$1], to_jsonb($2::int)) WHERE chat_id = $3",
      [running.subject, running.currentQ, chatId]
    ).catch(() => {});
    await safeSend(
      chatId,
      '⏸ *' + running.subject + ' का टेस्ट प्रश्न संख्या ' + running.currentQ + ' पर रोका गया है।*\n' +
      'इस राउंड में यह बंद रहेगा और अगले राउंड में ठीक *प्रश्न ' + (running.currentQ + 1) + '* से आगे शुरू होगा!'
    );
  }
};

// Works in both Groups (non-anonymous) and Channels (anonymous fallback)
const sendQuizSafe = async (chatId: number, questionText: string, opts: string[], finalIdx: number, explanation: string, pollDuration: number) => {
  try {
    return await bot.telegram.sendQuiz(chatId, questionText, opts, {
      correct_option_id: finalIdx,
      explanation,
      open_period: pollDuration,
      is_anonymous: false
    });
  } catch {
    return await bot.telegram.sendQuiz(chatId, questionText, opts, {
      correct_option_id: finalIdx,
      explanation,
      open_period: pollDuration,
      is_anonymous: true
    });
  }
};

const startHourlySubjectTest = async (chatId: number, subject: string, resumeFromMinuteOffset: number = 0) => {
  if (activeTests.has(chatId)) await stopTestInGroup(chatId, true);
  await clearOldReminders(chatId);

  const chRes = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]).catch(() => ({ rows: [] }));
  if (chRes.rows.length === 0) return;
  const ch = chRes.rows[0];

  const perm = isGroupAllowedToPost(ch);
  if (!perm.ok) {
    if (perm.reason === 'PENDING_APPROVAL') {
      return safeSend(chatId, '⏳ *यह ग्रुप/चैनल अभी मास्टर एडमिन के अप्रूवल की प्रतीक्षा में है।* या तुरंत एक्टिवेट करने के लिए ओनर 100 Stars पे कर सकते हैं।');
    }
    if (perm.reason === 'EXPIRED') {
      await safeSend(
        chatId,
        '⚠️ *आपका 30 दिनों का फ्री ट्रायल समाप्त हो चुका है!*\n' +
        'अपने ग्रुप/चैनल की ग्रोथ और ऑटोमैटिक लाइव क्विज़ को *1 साल (365 दिन)* के लिए जारी रखने हेतु केवल *100 Telegram Stars* से एक्टिवेट करें:'
      );
      return sendStarsInvoice(chatId, chatId);
    }
    return;
  }

  const savedQ = Number(ch.checkpoints?.[subject] || 0);
  let currentQ = savedQ > 0 && savedQ < 50 ? savedQ : resumeFromMinuteOffset;

  if (currentQ === 0) {
    await pool.query('DELETE FROM test_scores WHERE chat_id=$1', [chatId]).catch(() => {});
  }

  const seoTags = await getCfg('seo_tags');
  const customCap = ch.custom_caption ? '\n📢 *' + ch.custom_caption + '*\n' : '';

  await safeSend(
    chatId,
    '🏛 *PROFESSOR LIVE EXAMINATION: ' + subject + '* 🏛\n' +
    (currentQ > 0 ? '🔄 *(पिछले राउंड के प्रश्न संख्या ' + (currentQ + 1) + ' से पुनः प्रारंभ)*\n' : '') +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '📌 *कुल प्रश्न:* 50 (Easy ➔ Max Hard + 10 Most Repeated PYQs)\n' +
    '⏱ *समय:* प्रत्येक प्रश्न के स्तर अनुसार (15s से 55s)\n' +
    '⚖️ *माइनस मार्किंग:* 1/4 (4 गलत प्रश्नों पर 1 सही प्रश्न का अंक कटेगा)' +
    customCap + '\n' + seoTags,
    Markup.inlineKeyboard([[Markup.button.callback('🛑 Stop Test (Resume Next Round)', 'pause_test_' + chatId)]])
  );

  const sendNextQuestion = async () => {
    currentQ++;
    const state = activeTests.get(chatId);
    if (state) state.currentQ = currentQ;

    if (currentQ > 50) {
      await stopTestInGroup(chatId, false);
      await pool.query(
        "UPDATE channels SET checkpoints = jsonb_set(COALESCE(checkpoints, '{}'::jsonb), ARRAY[$1], '0'::jsonb) WHERE chat_id=$2",
        [subject, chatId]
      ).catch(() => {});
      await announceAndPinLeaderboard(chatId, subject);
      return;
    }

    const tierIndex = Math.min(4, Math.floor((currentQ - 1) / 10));
    const targetDiff = DIFF_TIERS[tierIndex];
    const isMixed = subject.startsWith('MIXED');
    const preferPyq = currentQ % 5 === 0;

    try {
      let qRes = await pool.query(
        'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) AND difficulty = $3 AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $4) ORDER BY (is_pyq = $5) DESC, RANDOM() LIMIT 1',
        [isMixed, '%' + subject + '%', targetDiff, chatId, preferPyq]
      );

      if (qRes.rows.length === 0) {
        qRes = await pool.query(
          'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $3) ORDER BY RANDOM() LIMIT 1',
          [isMixed, '%' + subject + '%', chatId]
        );
      }

      if (qRes.rows.length === 0) {
        await generateQuestionsBatch(isMixed ? undefined : subject);
        qRes = await pool.query(
          'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $3) ORDER BY RANDOM() LIMIT 1',
          [isMixed, '%' + subject + '%', chatId]
        );
      }

      if (qRes.rows.length === 0) {
        await stopTestInGroup(chatId, true);
        await safeSend(
          chatId,
          '✨ *सूचना:* ' + subject + ' के नए प्रमाणित प्रश्न जोड़े जा रहे हैं। नया सेट जुड़ते ही अगले राउंड में यहीं से पोस्टिंग शुरू होगी!'
        );
        return;
      }

      const q = qRes.rows[0];
      await pool.query('INSERT INTO asked_history(chat_id, question_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [chatId, q.id]);

      const pollDuration = getPollTimer(q.subject || subject, q.difficulty || targetDiff);
      const pyqTag = q.is_pyq ? '⭐ [Exam PYQ] ' : '';
      const topicTag = q.topic ? '(' + q.topic.substring(0, 26) + ')' : '';
      const qHeader = '[Q.' + currentQ + '/50 | ' + (q.difficulty || targetDiff) + ' | ⏱' + pollDuration + 's] ' + topicTag + '\n' + pyqTag;
      const questionText = (qHeader + q.question_text).substring(0, 298);

      const opts = [
        q.option_a.substring(0, 95),
        q.option_b.substring(0, 95),
        q.option_c.substring(0, 95),
        q.option_d.substring(0, 95)
      ];
      const cIdx = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
      const finalIdx = cIdx !== -1 ? cIdx : 0;

      const sentPoll = await sendQuizSafe(
        chatId,
        questionText,
        opts,
        finalIdx,
        '💡 व्याख्या: ' + (q.explanation || 'सही उत्तर सत्यापित है।').substring(0, 180),
        pollDuration
      );

      if (sentPoll?.poll?.id) {
        await pool.query(
          'INSERT INTO poll_tracking(poll_id, chat_id, correct_index) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [sentPoll.poll.id, chatId, finalIdx]
        );
      }
    } catch (e) {
      console.error('Live Q Error:', e);
    }
  };

  sendNextQuestion();
  const timer = setInterval(sendNextQuestion, 60000);
  activeTests.set(chatId, { timer, subject, currentQ });
};

bot.on('poll_answer', async (ctx) => {
  try {
    const ans = ctx.pollAnswer;
    if (!ans.option_ids || ans.option_ids.length === 0) return;
    const uid = ans.user.id;
    const uname = (ans.user.first_name || ans.user.username || 'Student').replace(/[*_`[\]]/g, '');
    const chosen = ans.option_ids[0];

    const pRes = await pool.query('SELECT chat_id, correct_index FROM poll_tracking WHERE poll_id=$1', [ans.poll_id]);
    if (pRes.rows.length === 0) return;
    const { chat_id, correct_index } = pRes.rows[0];

    const isRight = chosen === Number(correct_index);
    const rInc = isRight ? 1 : 0;
    const wInc = isRight ? 0 : 1;
    const markDelta = isRight ? 1.00 : -0.25;

    await pool.query(
      'INSERT INTO test_scores (chat_id, user_id, username, right_count, wrong_count, net_marks) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (chat_id, user_id) DO UPDATE SET username = $3, right_count = test_scores.right_count + $4, wrong_count = test_scores.wrong_count + $5, net_marks = test_scores.net_marks + $6',
      [chat_id, uid, uname, rInc, wInc, markDelta]
    );

    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const monthKey = ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0');
    await pool.query(
      'INSERT INTO monthly_scores (month_key, user_id, username, right_count, wrong_count, net_marks) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (month_key, user_id) DO UPDATE SET username = $3, right_count = monthly_scores.right_count + $4, wrong_count = monthly_scores.wrong_count + $5, net_marks = monthly_scores.net_marks + $6',
      [monthKey, uid, uname, rInc, wInc, markDelta]
    );
  } catch {}
});

const getSubjectForHour = (istHour: number): string => {
  const idx = istHour - 8;
  return (idx >= 0 && idx < SCHEDULE_15H.length) ? SCHEDULE_15H[idx] : SCHEDULE_15H[0];
};

const getNextISTHourSubject = (): string => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const nextHour = (ist.getUTCHours() + 1) % 24;
  return getSubjectForHour(nextHour);
};

const sendPreTestReminders = async (minsLeft: number) => {
  const nextSub = getNextISTHourSubject();
  const chs = await pool.query("SELECT * FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  const users = await pool.query(
    'SELECT telegram_id, first_name FROM users WHERE alerts_enabled=TRUE AND is_banned=FALSE AND ($1 = ANY(preferred_subjects) OR $2 = TRUE)',
    [nextSub, nextSub.startsWith('MIXED')]
  ).catch(() => ({ rows: [] }));

  const mentionList = users.rows
    .slice(0, 20)
    .map(u => '[' + (u.first_name || 'Student').replace(/[*_`[\]]/g, '') + '](tg://user?id=' + u.telegram_id + ')')
    .join(', ');

  for (const ch of chs.rows) {
    if (!isGroupAllowedToPost(ch).ok) continue;
    const cid = Number(ch.chat_id);
    if (minsLeft === 1) {
      const instructionText =
        '🚨 *अंतिम 1 मिनट शेष — लाइव टेस्ट निर्देश!* 🚨\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '📘 *विषय:* ' + nextSub + '\n' +
        '🔢 *कुल प्रश्न:* 50 प्रश्न (इस विषय के 50 अति-महत्वपूर्ण प्रश्न हैं)\n' +
        '⚖️ *माइनस मार्किंग (1/4):* प्रत्येक 4 गलत प्रश्नों पर 1 सही प्रश्न का अंक काट लिया जाएगा (-0.25 प्रति गलत उत्तर)\n' +
        '⏱ *समय सीमा:* प्रश्न के स्तर अनुसार (Easy से Max Hard)\n' +
        '🏆 *रिजल्ट:* टेस्ट समाप्त होते ही अगले विषय से पहले Top 10 विजेताओं की घोषणा और मेरिट लिस्ट पिन की जाएगी।\n\n' +
        '🔔 *तैयार हो जाएं:* ' + (mentionList || 'सभी अभ्यर्थी कृपया अपनी स्क्रीन ऑन रखें!');

      const sent = await safeSend(cid, instructionText);
      if (sent && 'message_id' in sent) {
        await bot.telegram.pinChatMessage(cid, sent.message_id, { disable_notification: false }).catch(() => {});
      }
    } else {
      const sent = await safeSend(
        cid,
        '⏰ *लाइव टेस्ट रिमाइंडर (' + minsLeft + ' मिनट शेष)!*\n' +
        '📚 अगला विषय: *' + nextSub + '* (50 प्रश्न | 1/4 माइनस मार्किंग)\n' +
        '🔔 *अभ्यर्थी ध्यान दें:* ' + (mentionList || 'सभी छात्र टेस्ट के लिए तैयार रहें!')
      );
      if (sent && 'message_id' in sent) {
        const list = reminderMsgIds.get(cid) || [];
        list.push(sent.message_id);
        reminderMsgIds.set(cid, list);
      }
    }
    await sleep(300);
  }

  if (minsLeft === 10) {
    for (const u of users.rows) {
      await safeSend(
        u.telegram_id,
        '🔔 *नमस्ते ' + (u.first_name || 'अभ्यर्थी') + '!*\n' +
        'आपके चुने हुए विषय *' + nextSub + '* का लाइव टेस्ट (50 प्रश्न, 1/4 नेगेटिव मार्किंग) ठीक *10 मिनट* में शुरू होने वाला है!'
      );
      await sleep(150);
    }
  }
};

cron.schedule('50 7-21 * * *', () => sendPreTestReminders(10), { timezone: 'Asia/Kolkata' });
cron.schedule('55 7-21 * * *', () => sendPreTestReminders(5), { timezone: 'Asia/Kolkata' });
cron.schedule('59 7-21 * * *', () => sendPreTestReminders(1), { timezone: 'Asia/Kolkata' });

cron.schedule('0 8-22 * * *', async () => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  for (const c of chs.rows) {
    startHourlySubjectTest(Number(c.chat_id), sub, 0);
    await sleep(350);
  }
}, { timezone: 'Asia/Kolkata' });

// Every 2 Days Customizable Promo Message
cron.schedule('0 14 */2 * *', async () => {
  const promo = await getCfg('promo_msg');
  const botUser = bot.botInfo?.username || '';
  const kb: any[][] = [
    [Markup.button.url('➕ Add to Group (1-Click)', 'https://t.me/' + botUser + '?startgroup=true&admin=post_messages+edit_messages+delete_messages+pin_messages+invite_users')],
    [Markup.button.url('📢 Add to Channel (1-Click)', 'https://t.me/' + botUser + '?startchannel=true&admin=post_messages+edit_messages+delete_messages+pin_messages+invite_users')]
  ];
  const chs = await pool.query('SELECT chat_id FROM channels WHERE is_active=TRUE').catch(() => ({ rows: [] }));
  for (const c of chs.rows) {
    await safeSend(c.chat_id, promo, Markup.inlineKeyboard(kb));
    await sleep(350);
  }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('0 2 * * *', async () => {
  await pool.query("DELETE FROM poll_tracking WHERE created_at < NOW() - INTERVAL '2 days'").catch(() => {});
}, { timezone: 'Asia/Kolkata' });

const autoResumeOnServerBoot = async () => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hr = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  if (hr >= 8 && hr <= 22 && min >= 1 && min <= 48) {
    const sub = getSubjectForHour(hr);
    const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
    for (const c of chs.rows) {
      const cid = Number(c.chat_id);
      if (!activeTests.has(cid)) {
        startHourlySubjectTest(cid, sub, min);
        await sleep(350);
      }
    }
  }
};

// USER MAIN MENU, 1-CLICK ADD TO GROUP/CHANNEL & REFER AND EARN (₹5/Refer, Min ₹99)
const renderMainMenu = async (ctx: any) => {
  const botUser = ctx.botInfo?.username || '';
  const giftTag = await getCfg('gift_tagline');
  const adminPerms = 'post_messages+edit_messages+delete_messages+pin_messages+invite_users';

  const text =
    '🎓 *प्रोफेसर स्मार्ट लाइव टेस्ट सीरीज़ में आपका स्वागत है!*\n\n' +
    'यहाँ प्रतिदिन सुबह *8:00 AM से रात 11:00 PM (15 घंटे)* तक 13 विषयों और मिक्स्ड मॉक टेस्ट का आयोजन होता है।\n\n' +
    '✨ *मुख्य विशेषताएं:*\n' +
    '• टॉपिक-वाइज संपूर्ण सिलेबस (1 साल रोटेशन) + Top Exam PYQs\n' +
    '• 1/4 नेगेटिव मार्किंग और लाइव Top 10 मेरिट लिस्ट\n' +
    '• 💰 *Refer & Earn:* प्रति रेफ़रल ₹5 कमाएं (न्यूनतम निकासी ₹99 UPI द्वारा)\n' +
    '• 🚀 अपने Group या Channel में जोड़ें (30 दिन Free Trial, फिर केवल 100 Stars/Year)!\n\n' +
    giftTag;

  const kb: any[][] = [
    [Markup.button.callback('🎯 Exam & Subject Preferences', 'u_prefs'), Markup.button.callback('📅 15-Hour Schedule', 'u_sched')],
    [Markup.button.callback('💰 Refer & Earn (₹5/Refer)', 'u_refer'), Markup.button.callback('🏆 Monthly Topper List', 'u_monthly')],
    [Markup.button.callback('⚙️ My Groups & Channels (Manage)', 'u_groups'), Markup.button.callback('⚡ Play Demo Quiz In Bot', 'u_demo')],
    [
      Markup.button.url('➕ Add to Group (1-Click)', 'https://t.me/' + botUser + '?startgroup=true&admin=' + adminPerms),
      Markup.button.url('📢 Add to Channel (1-Click)', 'https://t.me/' + botUser + '?startchannel=true&admin=' + adminPerms)
    ]
  ];
  // Strictly visible ONLY to Master Admin
  if (isMaster(ctx.from.id)) {
    kb.push([Markup.button.callback('👑 MASTER ADMIN PANEL (ONLY FOR ME) 👑', 'adm_home')]);
  }

  if (ctx.callbackQuery) return safeEdit(ctx, text, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, text, Markup.inlineKeyboard(kb));
};

bot.start(async (ctx) => {
  const uid = ctx.from.id;
  const payload = ctx.startPayload || '';
  let refBy: number | null = null;
  if (payload.startsWith('ref_')) {
    const parsed = Number(payload.replace('ref_', ''));
    if (!isNaN(parsed) && parsed !== uid) refBy = parsed;
  }

  const existing = await pool.query('SELECT telegram_id FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] }));
  if (existing.rows.length === 0) {
    await pool.query(
      'INSERT INTO users(telegram_id, username, first_name, referred_by, ref_credited) VALUES($1,$2,$3,$4,FALSE)',
      [uid, ctx.from.username || 'student', ctx.from.first_name || 'Student', refBy]
    ).catch(() => {});
  } else {
    await pool.query(
      'UPDATE users SET username=$2, first_name=$3 WHERE telegram_id=$1',
      [uid, ctx.from.username || 'student', ctx.from.first_name || 'Student']
    ).catch(() => {});
  }

  const fsub = await checkTwoFSub(uid);
  if (!fsub.ok) {
    const btns: any[][] = fsub.missing.map(m => [Markup.button.url(m.title, m.link)]);
    btns.push([Markup.button.callback('✅ मैंने जॉइन कर लिया (Verify & Start)', 'verify_fsub')]);
    return safeSend(
      ctx.chat.id,
      '🔒 *अनिवार्य सूचना (Compulsory):*\nप्रोफेसर बॉट के सभी फीचर्स, लाइव टेस्ट और ₹5 रेफ़रल बोनस अनलॉक करने के लिए कृपया नीचे दिए गए दोनों ऑफिशियल ग्रुप और चैनल को सब्सक्राइब करें:',
      Markup.inlineKeyboard(btns)
    );
  }

  await creditReferralIfEligible(uid);
  return renderMainMenu(ctx);
});

bot.action('verify_fsub', async (ctx) => {
  const fsub = await checkTwoFSub(ctx.from.id);
  if (!fsub.ok) return ctx.answerCbQuery('❌ आपने अभी तक दोनों चैनल/ग्रुप जॉइन नहीं किए हैं! कृपया पहले जॉइन करें।', { show_alert: true });
  await creditReferralIfEligible(ctx.from.id);
  await ctx.answerCbQuery('✅ सत्यापन सफल! स्वागत है!', { show_alert: true });
  return renderMainMenu(ctx);
});

bot.action('u_home', (ctx) => renderMainMenu(ctx));

// DEMO QUIZ IN BOT PRIVATE CHAT
bot.action('u_demo', async (ctx) => {
  await ctx.answerCbQuery('Loading Question...');
  const qRes = await pool.query('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1').catch(() => ({ rows: [] }));
  if (qRes.rows.length === 0) return safeSend(ctx.chat.id, '⏳ प्रश्न तैयार हो रहे हैं, कृपया 1 मिनट बाद प्रयास करें।');
  const q = qRes.rows[0];
  const dur = getPollTimer(q.subject || 'HISTORY', q.difficulty || 'Medium');
  const opts = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
  const cIdx = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
  await sendQuizSafe(
    ctx.chat.id,
    '[' + q.subject + ' | ' + q.difficulty + ' | ⏱' + dur + 's]\n' + q.question_text.substring(0, 250),
    opts,
    cIdx !== -1 ? cIdx : 0,
    '💡 व्याख्या: ' + (q.explanation || '').substring(0, 180),
    dur
  );
});

// REFER & EARN PANEL (₹5 PER REFER, MIN ₹99 WITHDRAWAL, AUTO CLEAN RESET)
const renderReferPanel = async (ctx: any) => {
  const uid = ctx.from.id;
  const botUser = ctx.botInfo?.username || '';
  const r = await pool.query('SELECT wallet_balance, referral_count, last_cleared_at FROM users WHERE telegram_id=$1', [uid]);
  const u = r.rows[0] || { wallet_balance: 0, referral_count: 0, last_cleared_at: null };
  const refLink = 'https://t.me/' + botUser + '?start=ref_' + uid;

  const msg =
    '💰 *PROFESSOR REFER & EARN PROGRAM* 💰\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '🎁 *प्रति रेफ़रल इनाम:* ₹5.00\n' +
    '🏦 *न्यूनतम निकासी (Min Withdrawal):* ₹99.00 (सीधे UPI में)\n\n' +
    '👥 *आपके वर्तमान रेफ़रल:* ' + (u.referral_count || 0) + ' छात्र\n' +
    '💳 *आपका वर्तमान बैलेंस:* *₹' + (u.wallet_balance || 0) + '.00*\n' +
    (u.last_cleared_at ? '🧹 *पिछला भुगतान एवं रीसेट दिनांक:* ' + u.last_cleared_at + '\n' : '') +
    '\n🔗 *आपका रेफ़रल लिंक (शेयर करें):*\n' + refLink + '\n\n' +
    '📌 *नियम:* जैसे ही आपके ₹99 पूरे होते हैं, नीचे बटन दबाकर अपनी UPI ID एडमिन को भेजें। भुगतान होते ही आपका पुराना रेफ़रल काउंट क्लीन होकर नए सिरे (0) से फिर शुरू हो जाएगा!';

  const kb: any[][] = [
    [Markup.button.url('📲 Share Referral Link on Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(refLink) + '&text=' + encodeURIComponent('🎓 रोज़ सुबह 8 बजे से रात 11 बजे तक फ्री लाइव टेस्ट दें और ₹100 Gift Card व रेफ़रल कैश जीतें! अभी जुड़ें:'))],
    [Markup.button.callback('💸 Withdraw ₹99+ (Submit UPI ID)', 'u_withdraw')],
    [Markup.button.callback('🔙 Back to Main Menu', 'u_home')]
  ];

  if (ctx.callbackQuery) return safeEdit(ctx, msg, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, msg, Markup.inlineKeyboard(kb));
};

bot.command('refer', (ctx) => renderReferPanel(ctx));
bot.action('u_refer', (ctx) => renderReferPanel(ctx));

bot.action('u_withdraw', async (ctx) => {
  const uid = ctx.from.id;
  const r = await pool.query('SELECT wallet_balance, referral_count FROM users WHERE telegram_id=$1', [uid]);
  const bal = Number(r.rows[0]?.wallet_balance || 0);
  if (bal < 99) {
    return ctx.answerCbQuery('❌ न्यूनतम निकासी ₹99 है! अभी आपका बैलेंस ₹' + bal + ' है। कृपया और शेयर करें।', { show_alert: true });
  }
  userStates.set(uid, { action: 'SUBMIT_UPI' });
  await ctx.answerCbQuery();
  return safeSend(
    ctx.chat.id,
    '🏦 *UPI Withdrawal (₹' + bal + '):*\nकृपया अपनी सही *UPI ID* और अपना नाम यहाँ लिखकर भेजें (उदाहरण: `9876543210@ybl - Rahul`):\n*(रद्द करने के लिए /cancel लिखें)*'
  );
});

const renderScheduleView = async (ctx: any) => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const currentHr = ist.getUTCHours();
  const currentSub = getSubjectForHour(currentHr);

  let msg = '📅 *PROFESSOR 15-HOUR DAILY TIME-TABLE* 📅\n';
  msg += '*(सुबह 8:00 AM से रात 11:00 PM IST)*\n\n';
  msg += '🟢 *वर्तमान में चल रहा टेस्ट:* *' + ((currentHr >= 8 && currentHr <= 22) ? currentSub : 'विश्राम अवधि (रात्रि 11 बजे से प्रातः 8 बजे)') + '*\n\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━\n';

  const timeSlots = [
    '08:00 AM — History (इतिहास)',
    '09:00 AM — Geography (भूगोल)',
    '10:00 AM — Economy (अर्थव्यवस्था)',
    '11:00 AM — Environment (पर्यावरण)',
    '12:00 PM — Polity (संविधान एवं राजव्यवस्था)',
    '01:00 PM — Current Affairs (समसामयिकी)',
    '02:00 PM — Physics (भौतिक विज्ञान)',
    '03:00 PM — Chemistry (रसायन विज्ञान)',
    '04:00 PM — GS Mathematics & Science',
    '05:00 PM — Math (गणित)',
    '06:00 PM — English (अंग्रेजी)',
    '07:00 PM — Reasoning (तार्किकता)',
    '08:00 PM — Hindi (सामान्य हिंदी)',
    '09:00 PM — Mixed Mock Test Part 1',
    '10:00 PM — Mixed Mock Test Part 2'
  ];

  timeSlots.forEach((slot, idx) => {
    const slotHr = 8 + idx;
    const isLive = slotHr === currentHr;
    msg += (isLive ? '👉 *' : '• ') + slot + (isLive ? ' (LIVE ⚡)*\n' : '\n');
  });

  const kb = Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'u_home')]]);
  if (ctx.callbackQuery) return safeEdit(ctx, msg, kb);
  return safeSend(ctx.chat.id, msg, kb);
};

bot.action('u_sched', (ctx) => renderScheduleView(ctx));
bot.command('schedule', (ctx) => renderScheduleView(ctx));

const renderMonthlyTopperList = async (ctx: any) => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const monthKey = ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0');

  const top = await pool.query(
    'SELECT user_id, username, right_count, wrong_count, net_marks FROM monthly_scores WHERE month_key=$1 ORDER BY net_marks DESC LIMIT 10',
    [monthKey]
  ).catch(() => ({ rows: [] }));

  let msg = '🏆 *MONTHLY TOPPER LEADERBOARD (' + monthKey + ')* 🏆\n';
  msg += '🎁 *1 नवंबर से ₹100 Gift Card जीतने वाले शीर्ष अभ्यर्थी:* \n';
  msg += '━━━━━━━━━━━━━━━━━━━━━\n\n';

  if (top.rows.length === 0) {
    msg += 'इस महीने अभी तक स्कोरबोर्ड खाली है। आज ही टेस्ट देना शुरू करें!\n';
  } else {
    top.rows.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖 ' + (i + 1) + '.';
      msg += medal + ' [' + r.username + '](tg://user?id=' + r.user_id + ') (ID: ' + r.user_id + ') — *' + Number(r.net_marks).toFixed(2) + ' Pts*\n';
    });
  }

  const kb = Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'u_home')]]);
  if (ctx.callbackQuery) return safeEdit(ctx, msg, kb);
  return safeSend(ctx.chat.id, msg, kb);
};

bot.action('u_monthly', (ctx) => renderMonthlyTopperList(ctx));
bot.command('monthlytop', (ctx) => renderMonthlyTopperList(ctx));

const renderPrefs = async (ctx: any) => {
  const r = await pool.query('SELECT target_exam, preferred_subjects, alerts_enabled FROM users WHERE telegram_id=$1', [ctx.from.id]);
  const u = r.rows[0] || { target_exam: EXAMS[0], preferred_subjects: [], alerts_enabled: true };
  const subs: string[] = u.preferred_subjects || [];

  const kb: any[][] = [
    EXAMS.slice(0, 2).map(e => Markup.button.callback((u.target_exam === e ? '✅ ' : '') + e, 'setex_' + e)),
    EXAMS.slice(2, 4).map(e => Markup.button.callback((u.target_exam === e ? '✅ ' : '') + e, 'setex_' + e))
  ];
  const coreSubs = SCHEDULE_15H.slice(0, 13);
  for (let i = 0; i < coreSubs.length; i += 2) {
    const row = [Markup.button.callback((subs.includes(coreSubs[i]) ? '✅ ' : '⬜ ') + coreSubs[i], 'setsub_' + coreSubs[i])];
    if (coreSubs[i + 1]) row.push(Markup.button.callback((subs.includes(coreSubs[i + 1]) ? '✅ ' : '⬜ ') + coreSubs[i + 1], 'setsub_' + coreSubs[i + 1]));
    kb.push(row);
  }
  kb.push([Markup.button.callback('🔔 Mention Alerts: ' + (u.alerts_enabled ? 'ON ✅' : 'OFF 🔕'), 'tog_alert')]);
  kb.push([Markup.button.callback('💾 Save & Back', 'u_home')]);

  return safeEdit(
    ctx,
    '🎯 *अपनी परीक्षा और विषय चुनें:*\n(टेस्ट शुरू होने से 10 मिनट, 5 मिनट और 1 मिनट पहले बॉट आपको मेंशन करके अलर्ट करेगा)',
    Markup.inlineKeyboard(kb)
  );
};

bot.action('u_prefs', (ctx) => renderPrefs(ctx));
bot.action(/^setex_(.+)$/, async (ctx) => {
  await pool.query('UPDATE users SET target_exam=$1 WHERE telegram_id=$2', [ctx.match[1], ctx.from.id]);
  return renderPrefs(ctx);
});
bot.action(/^setsub_(.+)$/, async (ctx) => {
  const s = ctx.match[1];
  const r = await pool.query('SELECT preferred_subjects FROM users WHERE telegram_id=$1', [ctx.from.id]);
  let arr: string[] = r.rows[0]?.preferred_subjects || [];
  arr = arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s];
  await pool.query('UPDATE users SET preferred_subjects=$1 WHERE telegram_id=$2', [arr, ctx.from.id]);
  return renderPrefs(ctx);
});
bot.action('tog_alert', async (ctx) => {
  await pool.query('UPDATE users SET alerts_enabled = NOT alerts_enabled WHERE telegram_id=$1', [ctx.from.id]);
  return renderPrefs(ctx);
});

// GROUP / CHANNEL ADDITION WITH MASTER ADMIN APPROVAL & 100 STARS/YEAR
bot.on('my_chat_member', async (ctx) => {
  try {
    const st = ctx.myChatMember.new_chat_member.status;
    const chat: any = ctx.myChatMember.chat;
    const adder = ctx.myChatMember.from;
    if (['group', 'supergroup', 'channel'].includes(chat.type) && ['administrator', 'member'].includes(st)) {
      const chatTitle = chat.title || 'Educational Chat';
      const approved = isMaster(adder.id) ? 'APPROVED' : 'PENDING';

      await pool.query(
        'INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status) VALUES($1,$2,$3,$4,TRUE,$5) ON CONFLICT(chat_id) DO UPDATE SET title=$2, chat_type=$3, is_active=TRUE',
        [chat.id, chatTitle, chat.type, adder.id, approved]
      );

      await safeSend(
        chat.id,
        '🎓 *धन्यवाद! Professor AI Quiz Bot अब "' + chatTitle + '" से जुड़ चुका है!*\n' +
        (approved === 'APPROVED'
          ? '✅ *Status: Active!* यहाँ प्रतिदिन सुबह 8 बजे से रात 11 बजे तक लाइव टेस्ट चलेंगे।'
          : '⏳ *30-Day Free Trial Request Sent!* मास्टर एडमिन के अप्रूवल के तुरंत बाद (या 100 Stars से 1 साल एक्टिवेट करने पर) यहाँ लाइव टेस्ट शुरू हो जाएंगे!'),
        Markup.inlineKeyboard([
          [Markup.button.callback('▶️ Start Live Quiz', 'gstart_' + chat.id), Markup.button.callback('🛑 Stop Quiz', 'pause_test_' + chat.id)]
        ])
      );

      if (ADMIN_ID && !isMaster(adder.id)) {
        await safeSend(
          ADMIN_ID,
          '🔔 *नया ग्रुप/चैनल अप्रूवल के लिए आया है!*\n' +
          '📌 नाम: *' + chatTitle + '* (' + chat.type + ')\n' +
          '🆔 Chat ID: ' + chat.id + '\n' +
          '👤 जोड़ने वाला यूज़र: ' + (adder.first_name || 'User') + ' (ID: ' + adder.id + ')',
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approve (30 Days Trial)', 'adm_app_' + chat.id), Markup.button.callback('⭐ Grant 1 Year Free', 'adm_yr_' + chat.id)],
            [Markup.button.callback('🚫 Reject / Block Group', 'adm_rej_' + chat.id)]
          ])
        );
      }
    }
  } catch {}
});

bot.action(/^adm_app_(-?\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const cid = Number(ctx.match[1]);
  await pool.query("UPDATE channels SET approval_status='APPROVED', trial_ends_at = NOW() + INTERVAL '30 days', is_active=TRUE WHERE chat_id=$1", [cid]);
  await ctx.answerCbQuery('Group Approved for 30 Days Trial!', { show_alert: true });
  await safeSend(cid, '🎉 *बधाई हो! मास्टर एडमिन ने आपके ग्रुप/चैनल का 30 दिनों का फ्री ट्रायल अप्रूव कर दिया है!*');
});

bot.action(/^adm_yr_(-?\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const cid = Number(ctx.match[1]);
  await pool.query("UPDATE channels SET approval_status='APPROVED', sub_ends_at = NOW() + INTERVAL '365 days', is_active=TRUE WHERE chat_id=$1", [cid]);
  await ctx.answerCbQuery('Granted 1 Year Subscription!', { show_alert: true });
  await safeSend(cid, '🎉 *बधाई हो! मास्टर एडमिन ने आपके ग्रुप/चैनल को पूरे 1 साल (365 दिन) के लिए एक्टिवेट कर दिया है!*');
});

bot.action(/^adm_rej_(-?\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const cid = Number(ctx.match[1]);
  await stopTestInGroup(cid, false);
  await pool.query("UPDATE channels SET approval_status='REJECTED', is_active=FALSE WHERE chat_id=$1", [cid]);
  await ctx.answerCbQuery('Group Rejected & Blocked!', { show_alert: true });
});

bot.command('setupgroup', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('यह कमांड अपने ग्रुप या चैनल के अंदर लिखें।');
  const gChat: any = ctx.chat;
  const gTitle = gChat.title || 'Group';
  const approved = isMaster(ctx.from.id) ? 'APPROVED' : 'PENDING';

  await pool.query(
    'INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status) VALUES($1,$2,$3,$4,TRUE,$5) ON CONFLICT(chat_id) DO UPDATE SET title=$2, owner_id=$4, is_active=TRUE',
    [ctx.chat.id, gTitle, ctx.chat.type, ctx.from.id, approved]
  );
  return safeSend(
    ctx.chat.id,
    '✅ *"' + gTitle + '" रजिस्टर हो गया है!*',
    Markup.inlineKeyboard([[Markup.button.callback('▶️ Start Test Now', 'gstart_' + ctx.chat.id), Markup.button.callback('🛑 Stop Test', 'pause_test_' + ctx.chat.id)]])
  );
});

bot.action('u_groups', async (ctx) => {
  const r = isMaster(ctx.from.id)
    ? await pool.query('SELECT * FROM channels ORDER BY title LIMIT 30')
    : await pool.query('SELECT * FROM channels WHERE owner_id=$1', [ctx.from.id]);

  if (r.rows.length === 0) {
    return safeEdit(
      ctx,
      '📢 आपका कोई ग्रुप/चैनल नहीं जुड़ा है। होम मेनू के 1-Click बटन से बॉट को अपने ग्रुप या चैनल में जोड़ें।',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'u_home')]])
    );
  }
  const kb: any[][] = r.rows.map(g => [
    Markup.button.callback((g.is_active ? '🟢 ' : '🔴 ') + g.title + ' [' + g.approval_status + ']', 'gpanel_' + g.chat_id)
  ]);
  kb.push([Markup.button.callback('🔙 Back', 'u_home')]);
  return safeEdit(ctx, '⚙️ *ग्रुप / चैनल चुनें जिसे आप मैनेज या कस्टमाइज़ करना चाहते हैं:*', Markup.inlineKeyboard(kb));
});

const renderGroupPanel = async (ctx: any, chatId: number) => {
  const r = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]);
  if (r.rows.length === 0) return;
  const g = r.rows[0];
  const perm = isGroupAllowedToPost(g);
  const trialDate = g.trial_ends_at ? new Date(g.trial_ends_at).toLocaleDateString('hi-IN') : 'N/A';
  const subDate = g.sub_ends_at ? new Date(g.sub_ends_at).toLocaleDateString('hi-IN') : 'Not Active';

  const txt =
    '⚙️ *Channel/Group Panel: ' + g.title + '*\n\n' +
    '🆔 Chat ID: ' + g.chat_id + ' | 👤 Owner ID: ' + (g.owner_id || 'N/A') + '\n' +
    '📡 Auto-Schedule: *' + (g.is_active ? 'ON 🟢' : 'OFF 🔴') + '*\n' +
    '🛡 Approval Status: *' + g.approval_status + '*\n' +
    '💳 Plan Status: *' + (perm.ok ? 'ACTIVE ✅ (' + perm.reason + ')' : 'LOCKED ❌ (' + perm.reason + ')') + '*\n' +
    '📅 30-Day Trial Ends: *' + trialDate + '*\n' +
    '⭐ 1-Year Plan Ends: *' + subDate + '*\n' +
    '✍️ Custom Header: *' + (g.custom_caption || 'Default') + '*';

  const kb: any[][] = [
    [Markup.button.callback('▶️ Start Current Hour Test', 'gstart_' + chatId), Markup.button.callback('🛑 Pause/Stop Test', 'pause_test_' + chatId)],
    [Markup.button.callback(g.is_active ? '🔕 Turn Schedule OFF' : '🔔 Turn Schedule ON', 'gtog_' + chatId), Markup.button.callback('✍️ Set Custom Caption', 'gcap_' + chatId)],
    [Markup.button.callback('⭐ Pay 100 Stars (Activate 1 Year Auto)', 'gpay_' + chatId)]
  ];

  if (isMaster(ctx.from.id)) {
    kb.push([
      Markup.button.callback('✅ Admin Approve 30d', 'adm_app_' + chatId),
      Markup.button.callback('⭐ Grant 1 Year', 'adm_yr_' + chatId),
      Markup.button.callback('🚫 Block', 'adm_rej_' + chatId)
    ]);
  }
  kb.push([Markup.button.callback('🔙 Back to List', 'u_groups')]);
  return safeEdit(ctx, txt, Markup.inlineKeyboard(kb));
};

bot.action(/^gpanel_(-?\d+)$/, (ctx) => renderGroupPanel(ctx, Number(ctx.match[1])));
bot.action(/^gtog_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  await pool.query('UPDATE channels SET is_active = NOT is_active WHERE chat_id=$1', [cid]);
  return renderGroupPanel(ctx, cid);
});
bot.action(/^gcap_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  userStates.set(ctx.from.id, { action: 'SET_GRP_CAP', targetId: cid });
  await ctx.answerCbQuery();
  return safeSend(ctx.chat.id, '✍️ *अपने ग्रुप/चैनल के टेस्ट के लिए कस्टम लाइन लिखें (जैसे: Welcome to Rahul PCS Classes):*\n*(रद्द करने के लिए /cancel लिखें)*');
});
bot.action(/^gpay_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  await ctx.answerCbQuery('Sending 100 Stars Invoice (1 Year)...');
  return sendStarsInvoice(ctx.chat?.id || ctx.from.id, cid);
});
bot.action(/^gstart_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  await ctx.answerCbQuery('Starting ' + sub + ' Test!');
  startHourlySubjectTest(cid, sub, 0);
});
bot.action(/^pause_test_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  await stopTestInGroup(cid, true);
  await ctx.answerCbQuery('Test Paused! Will resume from same question in next round.');
});

// MASTER ADMIN PANEL (STRICTLY VISIBLE ONLY TO ADMIN_ID)
const renderAdmin = async (ctx: any) => {
  if (!isMaster(ctx.from.id)) {
    return ctx.reply('🔒 यह मास्टर एडमिन पैनल केवल बॉट के मालिक के लिए सुरक्षित है। (आपकी ID: ' + ctx.from.id + ')');
  }
  const uCnt = (await pool.query('SELECT COUNT(*) FROM users')).rows[0].count;
  const gCnt = (await pool.query('SELECT COUNT(*) FROM channels WHERE is_active=TRUE')).rows[0].count;
  const pCnt = (await pool.query("SELECT COUNT(*) FROM channels WHERE approval_status='PENDING'")).rows[0].count;
  const qCnt = (await pool.query('SELECT COUNT(*) FROM questions')).rows[0].count;
  const fsubOn = await getCfg('fsub_enabled');
  const f1 = await getCfg('fsub1_id');
  const f2 = await getCfg('fsub2_id');
  const facOn = await getCfg('factory_on');

  const txt =
    '👑 *PROFESSOR MASTER ADMIN PANEL (OWNER ONLY)* 👑\n\n' +
    '👥 कुल छात्र: *' + uCnt + '* | 📢 एक्टिव ग्रुप्स/चैनल्स: *' + gCnt + '* (⏳ Pending: *' + pCnt + '*)\n' +
    '📚 कुल प्रमाणित प्रश्न: *' + qCnt + '* (Speed: 10 Qs/Min Auto)\n' +
    '🔐 Force Sub: *' + (fsubOn === 'true' ? 'ON 🟢' : 'OFF 🔴') + '*\n' +
    '   ├ 1. Main: ' + (f1 || 'Not Set') + '\n' +
    '   └ 2. Quiz: ' + (f2 || 'Not Set') + '\n' +
    '⚙️ Gemini Max-Speed Seeder: *' + (facOn === 'true' ? 'RUNNING 🟢' : 'PAUSED 🔴') + '*';

  const kb: any[][] = [
    [Markup.button.callback('📢 Broadcast All', 'adm_bc'), Markup.button.callback('📌 Broadcast & Auto-Pin', 'adm_bcpin')],
    [Markup.button.callback('🎁 Edit ₹100 Gift Card Tagline', 'adm_gift'), Markup.button.callback('💌 Message Winner for Gift Card', 'adm_msg_win')],
    [Markup.button.callback('🔐 Set FSub 1 (Forward/ID)', 'adm_fsub1'), Markup.button.callback('💬 Set FSub 2 (Forward/ID)', 'adm_fsub2')],
    [Markup.button.callback(fsubOn === 'true' ? '🔴 Turn Force Sub OFF' : '🟢 Turn Force Sub ON', 'adm_tog_fsub'), Markup.button.callback('📈 Edit 2-Day Promo Text', 'adm_promo')],
    [Markup.button.callback('🔍 Edit SEO Hashtags', 'adm_seo'), Markup.button.callback('⚡ Seed +10 PYQ/Questions Now', 'adm_gen10')],
    [Markup.button.callback(facOn === 'true' ? '⏸ Pause Gemini Seeder' : '▶️ Resume Gemini Seeder', 'adm_tog_fac'), Markup.button.callback('🚫 Ban / Unban User or Owner', 'adm_ban')],
    [Markup.button.callback('🚀 Start Test All Groups', 'adm_start_all'), Markup.button.callback('🛑 Stop All Running Tests', 'adm_stop_all')],
    [Markup.button.callback('⚙️ Manage All Groups, Channels & Owners', 'u_groups')],
    [Markup.button.callback('🔙 Back to User Menu', 'u_home')]
  ];
  if (ctx.callbackQuery) return safeEdit(ctx, txt, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, txt, Markup.inlineKeyboard(kb));
};

bot.command('admin', (ctx) => renderAdmin(ctx));
bot.action('adm_home', (ctx) => renderAdmin(ctx));

bot.action('adm_tog_fsub', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const c = await getCfg('fsub_enabled');
  await setCfg('fsub_enabled', c === 'true' ? 'false' : 'true');
  return renderAdmin(ctx);
});

bot.action('adm_tog_fac', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const c = await getCfg('factory_on');
  await setCfg('factory_on', c === 'true' ? 'false' : 'true');
  return renderAdmin(ctx);
});

bot.action('adm_gen10', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  await ctx.answerCbQuery('Generating 10 Topic-Wise Questions...');
  await safeSend(ctx.chat.id, '⏳ *प्रोफेसर AI द्वारा टॉपिक-वाइज 10 नए सवाल व PYQ बनाए जा रहे हैं...*');
  const r = await generateQuestionsBatch();
  await safeSend(ctx.chat.id, r.ok ? '✅ *[' + r.sub + ' -> ' + r.topic + ']* के ' + r.count + ' नए प्रश्न जुड़ गए!' : '❌ जनरेशन विफल। API Key चेक करें।');
  return renderAdmin(ctx);
});

bot.action('adm_start_all', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  for (const c of chs.rows) {
    startHourlySubjectTest(Number(c.chat_id), sub, 0);
    await sleep(350);
  }
  await ctx.answerCbQuery('Started ' + sub + ' in ' + chs.rows.length + ' groups!', { show_alert: true });
});

bot.action('adm_stop_all', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  for (const cid of Array.from(activeTests.keys())) await stopTestInGroup(cid, true);
  await ctx.answerCbQuery('All tests paused & checkpoints saved!', { show_alert: true });
});

// ADMIN PAYOUT CLEAR & RESET HANDLER (NO KACHRA IN DB)
bot.action(/^pay_ok_(\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const targetUid = Number(ctx.match[1]);
  const clearDate = new Date(Date.now() + 5.5 * 3600 * 1000).toLocaleDateString('hi-IN');
  await pool.query(
    'UPDATE users SET wallet_balance = 0, referral_count = 0, last_cleared_at = $1 WHERE telegram_id = $2',
    [clearDate, targetUid]
  );
  await pool.query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [targetUid]).catch(() => {});
  await ctx.answerCbQuery('Payout Marked Paid & User Referral Counter Reset Fresh!', { show_alert: true });
  await safeSend(
    targetUid,
    '✅ *भुगतान सफल एवं अकाउंट रीसेट!*\nएडमिन द्वारा आपका रेफ़रल पेआउट वेरीफाई कर दिया गया है। दिनांक *' + clearDate + '* को आपका काउंटर क्लीन कर दिया गया है ताकि आप आज से फिर नए सिरे से रेफ़र करके कमा सकें!'
  );
  await safeEdit(ctx, '✅ *User ' + targetUid + ' का पेमेंट क्लियर कर दिया गया और डेटाबेस से पुराना रेफ़रल कचरा साफ कर दिया गया है (' + clearDate + ')!*');
});

const promptAdminInput = async (ctx: any, action: string, promptText: string) => {
  if (!isMaster(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action });
  await safeSend(ctx.chat.id, promptText + '\n*(रद्द करने के लिए /cancel लिखें)*');
};

bot.action('adm_bc', (ctx) => promptAdminInput(ctx, 'BC_NORM', '📢 *Broadcast मैसेज भेजें:*'));
bot.action('adm_bcpin', (ctx) => promptAdminInput(ctx, 'BC_PIN', '📌 *Broadcast & Auto-Pin मैसेज भेजें:*'));
bot.action('adm_gift', (ctx) => promptAdminInput(ctx, 'SET_GIFT', '🎁 *नया Gift Card Announcement टेक्स्ट लिखें:*'));
bot.action('adm_promo', (ctx) => promptAdminInput(ctx, 'SET_PROMO', '📈 *हर 2 दिन में जाने वाला नया प्रमोशनल टेक्स्ट लिखें:*'));
bot.action('adm_seo', (ctx) => promptAdminInput(ctx, 'SET_SEO', '🔍 *नए SEO Hashtags लिखें:*'));
bot.action('adm_fsub1', (ctx) => promptAdminInput(ctx, 'SET_FSUB1', '🔐 *Main Channel (1) सेटअप:* बॉट को उस चैनल में Admin बनाएं और **चैनल से कोई भी एक पोस्ट यहाँ Forward कर दें** (या @username लिखें):'));
bot.action('adm_fsub2', (ctx) => promptAdminInput(ctx, 'SET_FSUB2', '💬 *Quiz Group/Channel (2) सेटअप:* बॉट को ग्रुप/चैनल में Admin बनाएं और **वहाँ से कोई पोस्ट यहाँ Forward कर दें** (या `@username` या `ID | Link` लिखें):'));
bot.action('adm_msg_win', (ctx) => promptAdminInput(ctx, 'MSG_WINNER', '💌 *Winner को Gift Card भेजने के लिए इस फॉरमेट में लिखें:*\nUSER_ID | बधाई हो! आपका ₹100 Gift Card कोड यहाँ है: XXXX'));
bot.action('adm_ban', (ctx) => promptAdminInput(ctx, 'BAN_TOGGLE', '🚫 *जिस यूज़र या ग्रुप ओनर को Ban / Unban करना है, उसकी Telegram User ID भेजें:*'));

bot.command('cancel', (ctx) => {
  userStates.delete(ctx.from.id);
  ctx.reply('✅ एक्शन रद्द किया गया।');
});

bot.on('message', async (ctx) => {
  const st = userStates.get(ctx.from.id);
  if (!st) return;

  // 1. User UPI Submission for ₹99+ Withdrawal (Auto Clean & Fresh Start)
  if (st.action === 'SUBMIT_UPI' && 'text' in ctx.message) {
    userStates.delete(ctx.from.id);
    const upiDetails = ctx.message.text.trim();
    const uid = ctx.from.id;
    const r = await pool.query('SELECT wallet_balance, referral_count, first_name, username FROM users WHERE telegram_id=$1', [uid]);
    const u = r.rows[0];
    const bal = Number(u?.wallet_balance || 0);
    const refs = Number(u?.referral_count || 0);
    if (bal < 99) return safeSend(ctx.chat.id, '❌ आपका बैलेंस ₹99 से कम है।');

    const clearDate = new Date(Date.now() + 5.5 * 3600 * 1000).toLocaleDateString('hi-IN');
    // Immediately reset user counter & clear old referral rows so zero kachra remains in DB
    await pool.query(
      'UPDATE users SET wallet_balance = 0, referral_count = 0, last_cleared_at = $1 WHERE telegram_id = $2',
      [clearDate, uid]
    );
    await pool.query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [uid]).catch(() => {});

    if (ADMIN_ID) {
      await safeSend(
        ADMIN_ID,
        '💸 *NEW REFERRAL PAYOUT REQUEST (₹' + bal + ')* 💸\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '👤 नाम: *' + (u.first_name || 'Student') + '* (@' + (u.username || 'N/A') + ')\n' +
        '🆔 User ID: ' + uid + '\n' +
        '👥 कुल रेफ़रल: ' + refs + ' (₹5 प्रति रेफ़रल)\n' +
        '💰 देय राशि: *₹' + bal + '.00*\n' +
        '🏦 UPI Details: *' + upiDetails + '*\n' +
        '📅 Clear Date: ' + clearDate,
        Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm Paid & Notify User', 'pay_ok_' + uid)]])
      );
    }

    return safeSend(
      ctx.chat.id,
      '✅ *आपकी UPI डिटेल्स (' + upiDetails + ') और ₹' + bal + ' की निकासी रिक्वेस्ट मास्टर एडमिन को भेज दी गई है!*\n' +
      '🧹 दिनांक *' + clearDate + '* को आपका रेफ़रल मीटर क्लीन कर दिया गया है ताकि आप बिना रुके नए सिरे (0) से फिर से रेफ़र कर सकें!'
    );
  }

  // 2. Group Owner Custom Caption
  if (st.action === 'SET_GRP_CAP' && st.targetId && 'text' in ctx.message) {
    userStates.delete(ctx.from.id);
    await pool.query('UPDATE channels SET custom_caption=$1 WHERE chat_id=$2', [ctx.message.text.trim().substring(0, 120), st.targetId]);
    await safeSend(ctx.chat.id, '✅ आपके ग्रुप/चैनल का कस्टम कैप्शन सेव हो गया!');
    return renderGroupPanel(ctx, st.targetId);
  }

  if (!isMaster(ctx.from.id)) return;
  userStates.delete(ctx.from.id);

  // 3. Master Admin Broadcast & Auto-Pin
  if (st.action === 'BC_NORM' || st.action === 'BC_PIN') {
    const pin = st.action === 'BC_PIN';
    const us = await pool.query('SELECT telegram_id FROM users').catch(() => ({ rows: [] }));
    const gs = await pool.query('SELECT chat_id FROM channels WHERE is_active=TRUE').catch(() => ({ rows: [] }));
    let uOk = 0;
    let gOk = 0;
    for (const u of us.rows) {
      try {
        await ctx.telegram.copyMessage(u.telegram_id, ctx.chat.id, ctx.message.message_id);
        uOk++;
        await sleep(80);
      } catch {}
    }
    for (const g of gs.rows) {
      try {
        const m = await ctx.telegram.copyMessage(g.chat_id, ctx.chat.id, ctx.message.message_id);
        gOk++;
        if (pin && m.message_id) await ctx.telegram.pinChatMessage(g.chat_id, m.message_id).catch(() => {});
        await sleep(120);
      } catch {}
    }
    return safeSend(ctx.chat.id, '✅ *Broadcast संपन्न!* (Users: ' + uOk + ', Groups/Channels: ' + gOk + ')');
  }

  // 4. Easy 1-Click Forward or @username Force-Sub Setup
  if (st.action === 'SET_FSUB1' || st.action === 'SET_FSUB2') {
    const msgAny: any = ctx.message;
    let cid = '';
    let link = '';

    if (msgAny.forward_from_chat) {
      const fChat = msgAny.forward_from_chat;
      cid = String(fChat.id);
      if (fChat.username) {
        link = 'https://t.me/' + fChat.username;
      } else {
        try {
          const chatInfo: any = await ctx.telegram.getChat(cid);
          link = chatInfo.invite_link || (await ctx.telegram.exportChatInviteLink(cid));
        } catch {}
      }
    } else if ('text' in ctx.message) {
      const txt = ctx.message.text.trim();
      if (txt.includes('|')) {
        const parts = txt.split('|').map(s => s.trim());
        cid = parts[0];
        link = parts[1];
      } else if (txt.startsWith('@')) {
        cid = txt;
        link = 'https://t.me/' + txt.replace('@', '');
      }
    }

    if (!cid || !link) {
      return safeSend(ctx.chat.id, '❌ कृपया चैनल में बॉट को Admin बनाकर वहाँ से कोई पोस्ट Forward करें या `@username | https://t.me/link` भेजें।');
    }
    const num = st.action === 'SET_FSUB1' ? '1' : '2';
    await setCfg('fsub' + num + '_id', cid);
    await setCfg('fsub' + num + '_link', link);
    await setCfg('fsub_enabled', 'true');
    await safeSend(ctx.chat.id, '✅ *Force Sub Channel ' + num + ' सफलतापूर्वक सेट हो गया!*\nID: ' + cid + '\nLink: ' + link);
    return renderAdmin(ctx);
  }

  if (!('text' in ctx.message)) return;
  const txt = ctx.message.text.trim();

  if (st.action === 'SET_GIFT') {
    await setCfg('gift_tagline', txt);
    await safeSend(ctx.chat.id, '✅ Gift Tagline अपडेट हो गई!');
    return renderAdmin(ctx);
  }
  if (st.action === 'SET_PROMO') {
    await setCfg('promo_msg', txt);
    await safeSend(ctx.chat.id, '✅ 2-Day Promo अपडेट हो गया!');
    return renderAdmin(ctx);
  }
  if (st.action === 'SET_SEO') {
    await setCfg('seo_tags', txt);
    await safeSend(ctx.chat.id, '✅ SEO Hashtags अपडेट हो गए!');
    return renderAdmin(ctx);
  }
  if (st.action === 'BAN_TOGGLE') {
    const targetUid = Number(txt);
    if (isNaN(targetUid)) return safeSend(ctx.chat.id, '❌ सही Numeric ID भेजें।');
    const r = await pool.query('SELECT is_banned FROM users WHERE telegram_id=$1', [targetUid]);
    const nextBan = !(r.rows[0]?.is_banned === true);
    await pool.query('UPDATE users SET is_banned=$1 WHERE telegram_id=$2', [nextBan, targetUid]);
    await safeSend(ctx.chat.id, nextBan ? '🚫 User ' + targetUid + ' को BAN कर दिया गया है!' : '✅ User ' + targetUid + ' को UNBAN कर दिया गया है!');
    return renderAdmin(ctx);
  }
  if (st.action === 'MSG_WINNER') {
    const parts = txt.split('|');
    const uid = parts[0]?.trim();
    const winMsg = parts.slice(1).join('|').trim();
    if (!uid || !winMsg) return safeSend(ctx.chat.id, '❌ सही फॉरमेट: 123456789 | आपका गिफ्ट कार्ड...');
    await safeSend(uid, '🏆 *PROFESSOR QUIZ WINNER REWARD* 🏆\n━━━━━━━━━━━━━━━━━━━━━\n' + winMsg);
    return safeSend(ctx.chat.id, '✅ टॉपर (' + uid + ') को इनाम का मैसेज भेज दिया गया!');
  }
});

bot.command('forcepost', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  for (const c of chs.rows) startHourlySubjectTest(Number(c.chat_id), sub, 0);
  ctx.reply('🚀 सभी ' + chs.rows.length + ' अप्रूव्ड ग्रुप्स/चैनल्स में ' + sub + ' का लाइव टेस्ट शुरू कर दिया गया है!');
});

const launchBot = async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    setTimeout(() => {
      autoResumeOnServerBoot();
      generateQuestionsBatch();
    }, 4000);
    await bot.launch({ dropPendingUpdates: true });
    console.log('Professor AI Quiz Bot V4 Enterprise Successfully Launched!');
  } catch (e: any) {
    console.error('Telegram Polling Conflict/Error (Auto-Retrying in 6s):', e?.message || e);
    setTimeout(launchBot, 6000);
  }
};

setTimeout(launchBot, 3000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
