import { Telegraf, Markup } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import http from 'http';
import crypto from 'crypto';
import cron from 'node-cron';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Professor AI Quiz Bot V9.1 Pro (Groq GPT-OSS Strict Seeder + Interactive Test Engine) Running 24/7!');
}).listen(PORT);

process.on('uncaughtException', (e) => console.error('Uncaught Exception:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled Rejection:', e));

const cleanEnv = (v?: string) => (v || '').replace(/^['"\s]+|['"\s]+$/g, '').trim();

const bot = new Telegraf(cleanEnv(process.env.BOT_TOKEN));
const ADMIN_ID = cleanEnv(process.env.ADMIN_ID) || '7412791600';
const MASTER_IDS = new Set(['7412791600', ADMIN_ID].filter(Boolean));
const isMaster = (uid?: number | string) => Boolean(uid) && MASTER_IDS.has(String(uid).trim());

// =========================================================
// POSTGRESQL POOL WITH AUTO-RECONNECT & KEEP-ALIVE
// =========================================================
const DATABASE_URL = cleanEnv(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 15,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => console.error('PostgreSQL Pool Warning:', err.message));

let dbStatusText = '⏳ Connecting to PostgreSQL...';

const SCHEDULE_15H = [
  'HISTORY', 'GEOGRAPHY', 'ECONOMY', 'ENVIRONMENT', 'POLITY', 'CURRENT AFFAIRS',
  'PHYSICS', 'CHEMISTRY', 'GS MATHEMATICS', 'MATH', 'ENGLISH', 'REASONING', 'HINDI',
  'MIXED TEST 1', 'MIXED TEST 2'
];

const CORE_SUBJECTS = SCHEDULE_15H.slice(0, 13);

const EXAM_TARGET_MAP: Record<string, string> = {
  'HISTORY': 'UPSC | State PSC | RO/ARO | SSC | Railway | TET',
  'GEOGRAPHY': 'UPSC | UPPSC | SSC CGL | Railway | Police | TET',
  'ECONOMY': 'UPSC | PSC | SSC | Banking | Railway | PET',
  'ENVIRONMENT': 'UPSC | UPPSC | CTET/UPTET | SSC | Railway',
  'POLITY': 'UPSC | State PSC | SI/Police | SSC | Railway',
  'CURRENT AFFAIRS': 'All Exams (UPSC, PSC, SSC, Railway, Banking, Police)',
  'PHYSICS': 'SSC | Railway ALP/NTPC | NDA/CDS | State PSC',
  'CHEMISTRY': 'SSC | Railway Group-D/NTPC | PSC | Teaching',
  'GS MATHEMATICS': 'SSC | Railway | CSAT | UPPSC | SuperTET',
  'MATH': 'SSC CGL/CHSL/MTS | Railway | Banking | Police | TET',
  'ENGLISH': 'SSC CGL/CHSL/CPO | Banking | CDS/NDA | Teaching',
  'REASONING': 'SSC | Railway | Banking | Police | CSAT | B.Ed',
  'HINDI': 'UPPSC RO/ARO | UP Police/SI | Lekhpal | CTET/UPTET',
  'MIXED TEST 1': 'All Competitive Exams Full Mock (Paper-1)',
  'MIXED TEST 2': 'All Competitive Exams Full Mock (Paper-2)'
};

const SYLLABUS_MAP: Record<string, string[]> = {
  'HISTORY': ['पाषाण काल एवं सिंधु सभ्यता', 'वैदिक संस्कृति एवं महाजनपद', 'बौद्ध एवं जैन धर्म', 'मौर्य साम्राज्य एवं अशोक', 'मौर्योत्तर एवं गुप्त साम्राज्य', 'दक्षिण भारतीय राजवंश (चोल, चालुक्य, पल्लव)', 'अरब व तुर्क आक्रमण एवं दिल्ली सल्तनत', 'विजयनगर, बहमनी एवं भक्ति-सूफी आंदोलन', 'मुगल साम्राज्य एवं प्रशासनिक व्यवस्था', 'मराठा साम्राज्य एवं सिख गुरु', 'यूरोपीय कंपनियों का आगमन एवं ब्रिटिश विस्तार', '1857 की क्रांति एवं प्रमुख जन-विद्रोह', 'सामाजिक-धार्मिक सुधार एवं पुनर्जागरण', 'कांग्रेस की स्थापना एवं उदारवादी/उग्रवादी चरण', 'गांधी युग, क्रांतिकारी आंदोलन एवं स्वतंत्रता (1915-1947)'],
  'GEOGRAPHY': ['भारत का भौतिक विभाजन एवं सीमाएं', 'हिमालय पर्वत तंत्र एवं प्रमुख दर्रे', 'गंगा, सिंधु एवं ब्रह्मपुत्र नदी तंत्र', 'प्रायद्वीपीय नदियां, झीलें एवं जलप्रपात', 'भारतीय मानसून, जलवायु एवं वर्षा वितरण', 'भारत की मिट्टियां एवं प्राकृतिक वनस्पति', 'कृषि, फसलें, सिंचाई एवं बहुउद्देशीय परियोजनाएं', 'खनिज संसाधन, ऊर्जा एवं प्रमुख उद्योग', 'भारत में परिवहन, बंदरगाह एवं जनगणना 2011', 'ब्रह्मांड, सौरमंडल एवं पृथ्वी की गतियां', 'पृथ्वी की आंतरिक संरचना, भूकंप एवं ज्वालामुखी', 'चट्टानें, महाद्वीप एवं पर्वत/पठार', 'वायुमंडल की परतें, पवनें एवं चक्रवात', 'महासागरीय जलधाराएं, ज्वार-भाटा एवं लवणता', 'विश्व के मरुस्थल, घास के मैदान एवं जनजातियां'],
  'ECONOMY': ['अर्थव्यवस्था के क्षेत्र एवं राष्ट्रीय आय (GDP, GNP)', 'आर्थिक नियोजन, पंचवर्षीय योजनाएं एवं नीति आयोग', 'मुद्रा एवं बैंकिंग (RBI, मौद्रिक नीति, रेपो रेट)', 'मुद्रास्फीति (Inflation) के प्रकार एवं नियंत्रण', 'भारतीय कर प्रणाली (प्रत्यक्ष कर, अप्रत्यक्ष कर, GST)', 'केंद्रीय बजट, राजकोषीय घाटा एवं वित्त आयोग', 'गरीबी, बेरोजगारी के प्रकार एवं सरकारी योजनाएं', 'भारतीय कृषि, हरित क्रांति, MSP एवं खाद्य सुरक्षा', 'औद्योगिक नीति, MSME एवं महारत्न/नवरत्न कंपनियां', 'पूंजी बाजार, शेयर बाजार एवं SEBI', 'विदेशी व्यापार, भुगतान संतुलन एवं FDI', 'अंतरराष्ट्रीय संगठन (IMF, World Bank, WTO, BRICS)'],
  'ENVIRONMENT': ['पारिस्थितिकी (Ecology) एवं इकोसिस्टम के घटक', 'खाद्य श्रृंखला, खाद्य जाल एवं ऊर्जा पिरामिड', 'जैव-भू-रासायनिक चक्र (कार्बन, नाइट्रोजन, जल)', 'जैव विविधता (Biodiversity), हॉटस्पॉट एवं संरक्षण', 'राष्ट्रीय उद्यान (National Parks) एवं वन्यजीव अभयारण्य', 'प्रोजेक्ट टाइगर, प्रोजेक्ट एलीफेंट एवं बायोस्फीयर रिजर्व', 'रामसर आर्द्रभूमि (Wetlands), मैंग्रोव एवं प्रवाल भित्ति', 'वायु, जल, मृदा, ध्वनि एवं ई-कचरा प्रदूषण', 'ग्रीनहाउस गैसें, ग्लोबल वार्मिंग एवं जलवायु परिवर्तन', 'ओजोन परत क्षरण एवं अम्लीय वर्षा', 'पर्यावरण संरक्षण कानून, NGT एवं चिपको/एपिको आंदोलन', 'अंतरराष्ट्रीय सम्मेलन (स्टॉकहोम, रियो, क्योटो, पेरिस, COP)'],
  'POLITY': ['संवैधानिक विकास (1773 रेगुलेटिंग एक्ट से 1947 तक)', 'संविधान सभा, प्रमुख समितियां, स्रोत एवं प्रस्तावना', 'संघ एवं उसका राज्य क्षेत्र तथा नागरिकता (भाग 1-2)', 'मूल अधिकार (अनुच्छेद 12-35) एवं संवैधानिक उपचार', 'नीति निर्देशक तत्व (DPSP) एवं मूल कर्तव्य', 'राष्ट्रपति एवं उपराष्ट्रपति: निर्वाचन, शक्तियां व महाभियोग', 'प्रधानमंत्री, केंद्रीय मंत्रिपरिषद एवं महान्यायवादी', 'संसद: राज्यसभा, लोकसभा, विधेयक एवं संसदीय समितियां', 'सर्वोच्च न्यायालय (Supreme Court), न्यायाधीश एवं न्यायिक पुनरावलोकन', 'राज्यपाल, मुख्यमंत्री एवं राज्य विधानमंडल', 'उच्च न्यायालय (High Court) एवं अधीनस्थ न्यायालय', 'केंद्र-राज्य संबंध, अंतरराज्यीय परिषद एवं आपातकाल', 'पंचायती राज एवं नगरपालिकाएं (73वां व 74वां संशोधन)', 'निर्वाचन आयोग, UPSC, वित्त आयोग, CAG एवं SC/ST आयोग', 'प्रमुख संविधान संशोधन, अनुसूचियां एवं महत्वपूर्ण अनुच्छेद'],
  'CURRENT AFFAIRS': ['राष्ट्रीय समसामयिकी एवं केंद्र सरकार के प्रमुख निर्णय', 'अंतरराष्ट्रीय शिखर सम्मेलन (G20, BRICS, SCO) व विदेश नीति', 'केंद्र एवं राज्य सरकारों की नवीनतम कल्याणकारी योजनाएं', 'राष्ट्रीय एवं अंतरराष्ट्रीय पुरस्कार (पद्म, नोबेल, खेल रत्न)', 'खेलकूद: क्रिकेट, ओलंपिक, एशियाई खेल एवं ग्रैंड स्लैम', 'रक्षा प्रौद्योगिकी, सैन्य अभ्यास एवं मिसाइल परीक्षण', 'ISRO के अंतरिक्ष मिशन, उपग्रह एवं विज्ञान-प्रौद्योगिकी', 'आर्थिक समीक्षा, केंद्रीय बजट एवं नवीनतम GDP अनुमान', 'प्रमुख वैश्विक सूचकांक (Global Indexes) में भारत की रैंक', 'प्रमुख राष्ट्रीय-अंतरराष्ट्रीय नियुक्तियां एवं निधन', 'चर्चित पुस्तकें, लेखक, ब्रांड एंबेसडर एवं महत्वपूर्ण दिवस', 'नवीनतम GI Tags, पर्यावरण रिपोर्ट एवं चर्चित स्थल'],
  'PHYSICS': ['भौतिक राशियां, SI मात्रक, विमाएं एवं मापक यंत्र', 'गति के नियम, वेग, त्वरण, वृत्तीय एवं प्रक्षेप्य गति', 'कार्य, ऊर्जा, शक्ति, संघट्ट एवं घर्षण', 'गुरुत्वाकर्षण, केप्लर के नियम, उपग्रह एवं पलायन वेग', 'द्रवों के गुण: दाब, पास्कल नियम, प्लवन, पृष्ठ तनाव व श्यानता', 'ऊष्मा, तापमिति, ऊष्मा संचरण एवं ऊष्मागतिकी के नियम', 'सरल आवर्त गति, तरंगें एवं ध्वनि (डॉपलर प्रभाव, सोनार)', 'प्रकाश: परावर्तन, समतल व गोलीय दर्पण', 'प्रकाश का अपवर्तन, पूर्ण आंतरिक परावर्तन, लेंस व प्रिज्म', 'मानव नेत्र, दृष्टि दोष एवं प्रकाशिक यंत्र (सूक्ष्मदर्शी, दूरदर्शी)', 'स्थिर वैद्युतिकी, विद्युत धारा, ओम का नियम एवं प्रतिरोध', 'विद्युत शक्ति, चुंबकत्व एवं विद्युत-चुंबकीय प्रेरण', 'आधुनिक भौतिकी, अर्धचालक, नाभिकीय ऊर्जा एवं प्रमुख आविष्कार'],
  'CHEMISTRY': ['पदार्थ की अवस्थाएं, तत्व, यौगिक, मिश्रण एवं पृथक्करण', 'परमाणु संरचना, मॉडल, क्वांटम संख्याएं एवं समस्थानिक', 'रेडियोधर्मिता, अल्फा-बीटा-गामा किरणें, नाभिकीय विखंडन व संलयन', 'रासायनिक बंधन (आयनिक, सहसंयोजक) एवं ऑक्सीकरण-अपचयन', 'तत्वों का आवर्ती वर्गीकरण (Periodic Table) एवं गुणधर्म', 'अम्ल, क्षार, लवण, संकेतक एवं pH मान', 'रासायनिक अभिक्रियाएं, उत्प्रेरक एवं रासायनिक साम्य', 'धातुएं, खनिज, अयस्क, धातुकर्म एवं संक्षारण', 'मिश्रधातुएं (Alloys), अमलगम एवं उनके उपयोग', 'अधातुएं (हाइड्रोजन, ऑक्सीजन, नाइट्रोजन, हैलोजन, अक्रिय गैसें)', 'कार्बन एवं उसके अपररूप, हाइड्रोकार्बन, एल्कोहल एवं ईंधन', 'बहुलक (Polymers), प्लास्टिक, कृत्रिम रेशे, रबर एवं विस्फोटक', 'दैनिक जीवन में रसायन: साबुन, अपमार्जक, उर्वरक, सीमेंट, कांच व औषधियां'],
  'GS MATHEMATICS': ['जीव विज्ञान: कोशिका (Cell) संरचना, विभाजन एवं आनुवंशिकी', 'जंतु एवं पादप वर्गीकरण तथा जैव विकास', 'मानव पाचन तंत्र, कार्बोहाइड्रेट, प्रोटीन, विटामिन एवं पोषण', 'रक्त परिसंचरण तंत्र, रक्त समूह (Blood Group) एवं मानव हृदय', 'श्वसन तंत्र, उत्सर्जन तंत्र (वृक्क) एवं कंकाल व पेशीय तंत्र', 'तंत्रिका तंत्र, मानव मस्तिष्क, आंख-कान एवं अंतःस्रावी ग्रंथियां/हार्मोन', 'मानव रोग: जीवाणु, विषाणु, प्रोटोजोआ, कवक एवं हीनताजन्य रोग', 'वनस्पति विज्ञान: प्रकाश संश्लेषण, पादप हार्मोन, ऊतक एवं पादप रोग', 'प्रारंभिक अंकगणित: संख्याओं की समझ, विभाज्यता एवं भिन्न', 'व्यावहारिक प्रतिशतता, अनुपात एवं औसत की त्वरित गणना', 'समय, दूरी एवं कार्य पर आधारित सामान्य मानसिक योग्यता', 'सांख्यिकी के मूल तत्व (माध्य, माध्यिका, बहुलक) एवं डेटा विश्लेषण'],
  'MATH': ['संख्या पद्धति (Number System), इकाई अंक, शेषफल एवं विभाज्यता', 'लघुत्तम समापवर्त्य (LCM) एवं महत्तम समापवर्तक (HCF)', 'सरलीकरण (Simplification), BODMAS, भिन्न, घातांक एवं करणी', 'औसत (Average) एवं आयु (Ages) पर आधारित प्रश्न', 'अनुपात एवं समानुपात (Ratio & Proportion) तथा साझेदारी (Partnership)', 'प्रतिशतता (Percentage): चुनाव, जनसंख्या एवं आय-व्यय प्रश्न', 'लाभ, हानि एवं बट्टा (Profit, Loss & Discount)', 'साधारण ब्याज (Simple Interest) एवं किस्तें', 'चक्रवृद्धि ब्याज (Compound Interest) एवं SI-CI अंतर', 'समय और कार्य (Time & Work), क्षमता एवं पाइप-टंकी', 'समय, चाल और दूरी, सापेक्ष चाल, रेलगाड़ी एवं नाव-धारा', 'मिश्रण और पृथ्थीकरण (Mixture & Alligation)', 'क्षेत्रमिति 2D (त्रिभुज, चतुर्भुज, वृत्त का क्षेत्रफल व परिमाप)', 'क्षेत्रमिति 3D (घन, घनाभ, बेलन, शंकु, गोला का आयतन व पृष्ठ)', 'बीजगणित (Algebra), त्रिकोणमिति, ज्यामिति एवं डेटा इंटरप्रिटेशन (DI)'],
  'ENGLISH': ['Parts of Speech & Subject-Verb Agreement Rules', 'Tenses, Sequence of Tenses & Conditional Sentences', 'Modals, Auxiliaries, Infinitives, Gerund & Participles', 'Articles (A, An, The) & Determiners Usage', 'Prepositions & Fixed Prepositional Phrases', 'Conjunctions, Question Tags & Inversion', 'Active and Passive Voice Transformation', 'Direct and Indirect Speech (Narration)', 'Spotting Grammatical Errors in Complex Sentences', 'Sentence Improvement & Phrase Replacement', 'Fill in the Blanks (Grammar & Contextual Vocabulary)', 'High-Frequency Synonyms & Antonyms from PYQs', 'One Word Substitutions for Competitive Exams', 'Idioms and Phrases with Origins & Usage', 'Spelling Correction, Homonyms & Para Jumbles (PQRS)'],
  'REASONING': ['वर्णमाला परीक्षण (Alphabet Test) एवं शब्द निर्माण', 'कोडिंग-डिकोडिंग (Letter, Number & Mixed Coding)', 'संख्या श्रृंखला (Number Series) एवं अक्षर श्रृंखला', 'सादृश्यता (Analogy) एवं वर्गीकरण/विषम की पहचान (Odd One Out)', 'दिशा और दूरी परीक्षण (Direction & Distance)', 'रक्त संबंध (Blood Relations) एवं कोडेड रिलेशन', 'क्रम व्यवस्था (Order & Ranking) एवं पंक्ति में स्थान', 'बैठक व्यवस्था (Circular & Linear Sitting Arrangement) व पहेली', 'न्याय निगमन (Syllogism) एवं वेन आरेख (Venn Diagrams)', 'कथन एवं निष्कर्ष, पूर्वधारणाएं, तर्क एवं कार्यवाही (Logical Reasoning)', 'लुप्त संख्या ज्ञात करना (Missing Number in Matrix) व गणितीय संक्रियाएं', 'कैलेंडर (Calendar) एवं घड़ी (Clock: कोण व समय)', 'पासा (Open & Closed Dice), घन एवं घनाभ', 'दर्पण व जल प्रतिबिंब, कागज मोड़ना एवं आकृति गणना (Figure Counting)'],
  'HINDI': ['हिंदी भाषा का विकास, बोलियां एवं देवनागरी लिपि', 'वर्णमाला: स्वर, व्यंजन, उच्चारण स्थान, अल्पप्राण-महाप्राण, घोष-अघोष', 'संधि एवं संधि-विच्छेद (स्वर, व्यंजन एवं विसर्ग संधि)', 'समास एवं समास-विग्रह (अव्ययीभाव से बहुव्रीहि तक)', 'उपसर्ग एवं प्रत्यय तथा शब्द रचना', 'तत्सम, तद्भव, देशज, विदेशज एवं संकर शब्द', 'संज्ञा, सर्वनाम, विशेषण, क्रिया, काल, वाच्य एवं अव्यय', 'लिंग, वचन एवं कारक चिन्ह (विभक्तियां)', 'पर्यायवाची एवं समानार्थी शब्द भंडार', 'विलोम (विपरीतार्थक) शब्द एवं अनेकार्थी/समश्रुत भिन्नार्थक शब्द', 'वाक्यांश के लिए एक शब्द (अनेक शब्दों के एक शब्द)', 'मुहावरे एवं लोकोक्तियां तथा उनका वाक्य प्रयोग', 'वर्तनी शुद्धि एवं वाक्यगत अशुद्धि संशोधन', 'रस, छंद (चौपाई, दोहा, सोरठा, कुंडलिया) एवं अलंकार', 'हिंदी साहित्य का इतिहास, प्रमुख रचनाएं, कवि, लेखक एवं पुरस्कार']
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

// =========================================================
// RUNTIME STATE & CACHES
// =========================================================
interface SoloSession {
  chatId: number;
  subject: string;
  mode: 'SOLO' | 'MISTAKES';
  questions: any[];
  index: number;
  right: number;
  wrong: number;
  skipped: number;
  currentPollId?: string;
  nextTimer?: NodeJS.Timeout;
  active: boolean;
}

const activeTests = new Map<number, { timer: NodeJS.Timeout; subject: string; currentQ: number }>();
const soloSessions = new Map<number, SoloSession>();
const quizLobbies = new Map<number, { users: Map<number, string>; subject: string; updatedAt: number }>();
const tempChatMsgs = new Map<number, number[]>();
const userStates = new Map<number, { action: string; targetId?: number; meta?: string }>();
const cfgCache = new Map<string, { val: string; ts: number }>();
const banCache = new Map<number, { banned: boolean; ts: number }>();
const knownChannels = new Map<number, number>();
const rateLimitMap = new Map<number, number>();

// Groq-only Model Management
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_PRIORITY_MODELS = [
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant'
];
const deadModels = new Set<string>([
  'gemma2-9b-it', 'gemma-7b-it', 'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768'
]);
const modelCooldownUntil = new Map<string, number>();
let cachedGroqModels: { list: string[]; ts: number } | null = null;

let isSeedingNow = false;
let seedingStartedAt = 0;
let lastSeedReport = '🟢 Groq V9.1 Seeder Active (Every 8m)';
let modelRotationCursor = 0;
let seedCursor = 0;
let todaySeededCount = 0;
let todaySeedDayKey = '';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const escMd = (s: string) => String(s || '').replace(/[*_`[\]]/g, '').trim();

// =========================================================
// NORMALIZED QUESTION FINGERPRINT (100% DUPLICATE BLOCKER)
// =========================================================
const makeQuestionHash = (rawText: string): string => {
  const cleaned = String(rawText || '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
  return crypto.createHash('md5').update(cleaned || rawText).digest('hex');
};

const trackTempMessage = (chatId: number, msgId?: number) => {
  if (!msgId) return;
  const arr = tempChatMsgs.get(chatId) || [];
  arr.push(msgId);
  tempChatMsgs.set(chatId, arr.slice(-15));
};

const clearTempGroupMessages = async (chatId: number) => {
  const ids = tempChatMsgs.get(chatId) || [];
  tempChatMsgs.delete(chatId);
  for (const mid of ids) {
    await bot.telegram.deleteMessage(chatId, mid).catch(() => {});
  }
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = 35000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

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

const getTodayKey = (): string => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' + String(ist.getUTCDate()).padStart(2, '0');
};

const getMonthKey = (): string => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0');
};

// =========================================================
// DATABASE INITIALIZATION, SEQUENCE SYNC & AUTO-CLEANER
// =========================================================
const syncQuestionsSequence = async () => {
  try {
    const seqRes = await pool.query("SELECT pg_get_serial_sequence('questions', 'id') AS seq");
    const seqName = seqRes.rows[0]?.seq;
    if (seqName) {
      await pool.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM questions), 1), true)`, [seqName]);
    }
  } catch (e: any) {
    console.error('[DB SEQ SYNC WARN]', e?.message);
  }
};

const initDB = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    const queries = [
      "CREATE TABLE IF NOT EXISTS users (telegram_id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, is_banned BOOLEAN DEFAULT FALSE, target_exam TEXT DEFAULT 'UPSC / UPPSC', preferred_subjects TEXT[] DEFAULT ARRAY['HISTORY','POLITY','GEOGRAPHY','CURRENT AFFAIRS'], alerts_enabled BOOLEAN DEFAULT TRUE, referred_by BIGINT DEFAULT NULL, ref_credited BOOLEAN DEFAULT FALSE, wallet_balance INT DEFAULT 0, referral_count INT DEFAULT 0, free_pdf_used BOOLEAN DEFAULT FALSE, last_cleared_at TEXT DEFAULT NULL, joined_at TIMESTAMP DEFAULT NOW())",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_credited BOOLEAN DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS free_pdf_used BOOLEAN DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_cleared_at TEXT DEFAULT NULL",
      "CREATE TABLE IF NOT EXISTS channels (chat_id BIGINT PRIMARY KEY, title TEXT, chat_type TEXT DEFAULT 'supergroup', owner_id BIGINT, is_active BOOLEAN DEFAULT TRUE, approval_status TEXT DEFAULT 'APPROVED', custom_caption TEXT DEFAULT NULL, trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'), sub_ends_at TIMESTAMP DEFAULT NULL, checkpoints JSONB DEFAULT '{}'::jsonb)",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS chat_type TEXT DEFAULT 'supergroup'",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'APPROVED'",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS custom_caption TEXT DEFAULT NULL",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS sub_ends_at TIMESTAMP DEFAULT NULL",
      "ALTER TABLE channels ADD COLUMN IF NOT EXISTS checkpoints JSONB DEFAULT '{}'::jsonb",
      "CREATE TABLE IF NOT EXISTS questions (id SERIAL PRIMARY KEY, subject TEXT, topic TEXT, question_text TEXT UNIQUE, q_hash TEXT UNIQUE, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_option TEXT, explanation TEXT, difficulty TEXT DEFAULT 'Medium', is_pyq BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS q_hash TEXT",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'Medium'",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_pyq BOOLEAN DEFAULT FALSE",
      "ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_q_hash ON questions(q_hash) WHERE q_hash IS NOT NULL",
      "CREATE INDEX IF NOT EXISTS idx_questions_sub_diff ON questions(subject, difficulty)",
      "CREATE TABLE IF NOT EXISTS syllabus_progress (subject TEXT PRIMARY KEY, topic_index INT DEFAULT 0, cycles_completed INT DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS asked_history (chat_id BIGINT, question_id INT, asked_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (chat_id, question_id))",
      "ALTER TABLE asked_history ADD COLUMN IF NOT EXISTS asked_at TIMESTAMP DEFAULT NOW()",
      "CREATE INDEX IF NOT EXISTS idx_asked_history_chat ON asked_history(chat_id)",
      "CREATE TABLE IF NOT EXISTS poll_tracking (poll_id TEXT PRIMARY KEY, chat_id BIGINT, question_id INT DEFAULT 0, correct_index INT, created_at TIMESTAMP DEFAULT NOW())",
      "ALTER TABLE poll_tracking ADD COLUMN IF NOT EXISTS question_id INT DEFAULT 0",
      "ALTER TABLE poll_tracking ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
      "CREATE TABLE IF NOT EXISTS user_mistakes (user_id BIGINT, question_id INT, wrong_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, question_id))",
      "CREATE INDEX IF NOT EXISTS idx_user_mistakes_uid ON user_mistakes(user_id)",
      "CREATE TABLE IF NOT EXISTS test_scores (chat_id BIGINT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(7,2) DEFAULT 0.00, PRIMARY KEY (chat_id, user_id))",
      "CREATE TABLE IF NOT EXISTS daily_scores (day_key TEXT, chat_id BIGINT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(8,2) DEFAULT 0.00, PRIMARY KEY (day_key, chat_id, user_id))",
      "CREATE TABLE IF NOT EXISTS monthly_scores (month_key TEXT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(8,2) DEFAULT 0.00, PRIMARY KEY (month_key, user_id))",
      "CREATE TABLE IF NOT EXISTS bot_settings (key TEXT PRIMARY KEY, value TEXT)",
      "INSERT INTO bot_settings (key, value) VALUES ('fsub1_id', ''), ('fsub1_link', ''), ('fsub2_id', ''), ('fsub2_link', ''), ('fsub_enabled', 'false'), ('min_participants_enabled', 'true'), ('service_clean_enabled', 'true'), ('gift_tagline', '🎁 *विशेष घोषणा: 1 नवंबर से जो छात्र इस टेस्ट सीरीज़ में टॉप पर आएगा, उसे ₹100 का Gift Card इनाम में दिया जाएगा!*'), ('promo_msg', '💡 *Professor Bot Tip:* आप इस स्मार्ट क्विज़ बॉट को अपने ग्रुप या चैनल में जोड़कर छात्रों को इकट्ठा कर सकते हैं और अपना एजुकेशनल नेटवर्क तेजी से बढ़ा सकते हैं! (30 दिन बिल्कुल मुफ्त ट्रायल)'), ('seo_tags', '#UPSC #UPPSC #SSC #RailwayExams #LiveQuiz #TestSeries #DailyGK #ProfessorBot'), ('factory_on', 'true'), ('extra_ai_keys', '') ON CONFLICT (key) DO NOTHING"
    ];
    for (const q of queries) await pool.query(q).catch(() => {});
    await syncQuestionsSequence();
    dbStatusText = '🟢 PostgreSQL Connected & Active';
    console.log('Professor V9.1 Pro PostgreSQL Database Ready & Sequence Synced!');
    return true;
  } catch (e: any) {
    dbStatusText = '🔴 DB Connection Error: ' + escMd(String(e?.message || 'Check DATABASE URL')).substring(0, 45);
    console.error(dbStatusText);
    return false;
  }
};

const runDatabaseAutoCleaner = async () => {
  try {
    await pool.query("DELETE FROM poll_tracking WHERE created_at < NOW() - INTERVAL '2 hours'").catch(() => {});
    await pool.query("DELETE FROM asked_history WHERE asked_at < NOW() - INTERVAL '15 days'").catch(() => {});
    await pool.query("DELETE FROM user_mistakes WHERE wrong_at < NOW() - INTERVAL '30 days'").catch(() => {});
    const missing = await pool.query('SELECT id, question_text FROM questions WHERE q_hash IS NULL LIMIT 200').catch(() => ({ rows: [] }));
    for (const row of missing.rows) {
      const h = makeQuestionHash(row.question_text);
      await pool.query('UPDATE questions SET q_hash = $1 WHERE id = $2', [h, row.id]).catch(async () => {
        await pool.query('DELETE FROM questions WHERE id = $1', [row.id]).catch(() => {});
      });
    }
    await syncQuestionsSequence();
    console.log('[AUTO-CLEANER] Old polls, expired history & duplicates cleaned!');
  } catch {}
};

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    dbStatusText = '🟢 PostgreSQL Connected & Active';
  } catch (e: any) {
    dbStatusText = '🔴 DB Disconnected (' + escMd(String(e?.message || '')).substring(0, 35) + ')';
  }
}, 240000);

setInterval(runDatabaseAutoCleaner, 7200000);

const getCfg = async (k: string): Promise<string> => {
  const cached = cfgCache.get(k);
  if (cached && Date.now() - cached.ts < 90000) return cached.val;
  const val = (await pool.query('SELECT value FROM bot_settings WHERE key=$1', [k]).catch(() => ({ rows: [] }))).rows[0]?.value || '';
  cfgCache.set(k, { val, ts: Date.now() });
  return val;
};

const setCfg = async (k: string, v: string) => {
  cfgCache.set(k, { val: v, ts: Date.now() });
  return pool.query('INSERT INTO bot_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [k, v]).catch(() => {});
};

// =========================================================
// SECURITY SHIELD: ANTI-SPAM, CACHED GROUP SYNC & SERVICE CLEANER
// =========================================================
const isGroupAdminOrMaster = async (ctx: any, chatId: number, uid: number): Promise<boolean> => {
  if (isMaster(uid)) return true;
  try {
    const member = await ctx.telegram.getChatMember(chatId, uid);
    return ['creator', 'administrator'].includes(member.status);
  } catch {
    return false;
  }
};

bot.use(async (ctx, next) => {
  if (ctx.chat && ['group', 'supergroup', 'channel'].includes(ctx.chat.type)) {
    const lastSync = knownChannels.get(ctx.chat.id) || 0;
    if (Date.now() - lastSync > 600000) {
      knownChannels.set(ctx.chat.id, Date.now());
      const gChat: any = ctx.chat;
      pool.query(
        "INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status, trial_ends_at) VALUES($1,$2,$3,$4,TRUE,'APPROVED', NOW() + INTERVAL '30 days') ON CONFLICT(chat_id) DO UPDATE SET title=$2",
        [ctx.chat.id, gChat.title || 'Quiz Group', ctx.chat.type, ctx.from?.id || Number(ADMIN_ID)]
      ).catch(() => {});
    }
  }

  const msgAny: any = ctx.message || ctx.channelPost;
  if (msgAny && ctx.chat && ctx.chat.type !== 'private') {
    if (
      msgAny.new_chat_members ||
      msgAny.left_chat_member ||
      msgAny.pinned_message ||
      msgAny.new_chat_title ||
      msgAny.new_chat_photo ||
      msgAny.delete_chat_photo ||
      msgAny.group_chat_created
    ) {
      await ctx.deleteMessage().catch(() => {});
      return;
    }
  }

  if (ctx.from) {
    if (isMaster(ctx.from.id)) return next();
    const uid = ctx.from.id;

    if (ctx.message || ctx.callbackQuery) {
      const lastTs = rateLimitMap.get(uid) || 0;
      if (Date.now() - lastTs < 900) {
        if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ कृपया धीरे क्लिक करें...').catch(() => {});
        return;
      }
      rateLimitMap.set(uid, Date.now());
    }

    let bState = banCache.get(uid);
    if (!bState || Date.now() - bState.ts > 300000) {
      const r = await pool.query('SELECT is_banned FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] }));
      bState = { banned: Boolean(r.rows[0]?.is_banned), ts: Date.now() };
      banCache.set(uid, bState);
    }
    if (bState.banned) {
      if (ctx.chat?.type === 'private') return ctx.reply('🚫 आपको एडमिन द्वारा इस बॉट से प्रतिबंधित किया गया है।');
      return;
    }
  }
  return next();
});

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

const creditReferralIfEligible = async (uid: number) => {
  try {
    const res = await pool.query('SELECT referred_by, ref_credited, first_name FROM users WHERE telegram_id=$1', [uid]);
    if (res.rows.length === 0) return;
    const u = res.rows[0];
    if (u.referred_by && !u.ref_credited && Number(u.referred_by) !== uid) {
      await pool.query('UPDATE users SET ref_credited = TRUE WHERE telegram_id = $1', [uid]);
      await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + 5, referral_count = COALESCE(referral_count, 0) + 1 WHERE telegram_id = $1', [u.referred_by]);
      await safeSend(u.referred_by, '🎉 *बधाई हो! नया रेफ़रल सफल हुआ!*\n👤 छात्र: *' + escMd(u.first_name || 'Student') + '* ने बॉट जॉइन कर लिया है।\n💰 आपके वॉलेट में *+₹5* जोड़ दिए गए हैं!');
    }
  } catch {}
};

// =========================================================
// FREEMIUM SUBSCRIPTION CHECK (30 DAYS FREE TRIAL -> 100 STARS)
// =========================================================
const isGroupAllowedToPost = (row: any): { ok: boolean; reason: string; daysLeft: number } => {
  if (!row) return { ok: true, reason: 'MASTER', daysLeft: 365 };
  if (row.owner_id && isMaster(Number(row.owner_id))) return { ok: true, reason: 'MASTER', daysLeft: 999 };
  if (row.approval_status === 'REJECTED') return { ok: false, reason: 'REJECTED', daysLeft: 0 };

  const now = Date.now();
  if (row.sub_ends_at && new Date(row.sub_ends_at).getTime() > now) {
    const d = Math.ceil((new Date(row.sub_ends_at).getTime() - now) / 86400000);
    return { ok: true, reason: 'SUB_ACTIVE', daysLeft: d };
  }
  if (row.trial_ends_at && new Date(row.trial_ends_at).getTime() > now) {
    const d = Math.ceil((new Date(row.trial_ends_at).getTime() - now) / 86400000);
    return { ok: true, reason: 'TRIAL_ACTIVE', daysLeft: d };
  }
  return { ok: false, reason: 'EXPIRED', daysLeft: 0 };
};

// =========================================================
// A4 OFFLINE PRINTABLE PAPER (1ST DOWNLOAD FREE -> 10 STARS)
// =========================================================
const sendGroupStarsInvoice = async (destChatId: number, targetGroupId: number) => {
  try {
    await bot.telegram.sendInvoice(destChatId, {
      title: 'Professor Quiz Bot - 1 Year Pro Activation',
      description: '30-दिन का फ्री ट्रायल समाप्त होने के बाद अपने ग्रुप/चैनल में 1 साल (365 दिन) के लिए ऑटोमैटिक लाइव क्विज़ एक्टिवेट करें।',
      payload: 'sub_group_' + targetGroupId,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: '1 Year Channel/Group Activation', amount: 100 }]
    });
  } catch (e) { console.error('Stars Invoice Error:', e); }
};

const sendPdfStarsInvoice = async (destChatId: number, subject: string) => {
  try {
    await bot.telegram.sendInvoice(destChatId, {
      title: 'A4 Printable Coaching Test Paper (' + subject + ')',
      description: 'आपका 1 Free PDF कोटा पूरा हो चुका है। 50 Verified Questions + OMR Sheet + Answer Key डाउनलोड करें:',
      payload: 'pdf_paper_' + subject,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'A4 Printable Test Paper (50 Qs)', amount: 10 }]
    });
  } catch (e) { console.error('PDF Invoice Error:', e); }
};

const deliverOfflineTestPaper = async (chatId: number, subject: string, asTextOnly: boolean = false, wasFreeQuota: boolean = false) => {
  const isMixed = subject.startsWith('MIXED');
  let qRes = await pool.query(
    'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) ORDER BY is_pyq DESC, RANDOM() LIMIT 50',
    [isMixed, '%' + subject + '%']
  ).catch(() => ({ rows: [] }));

  if (qRes.rows.length < 10) {
    await generateQuestionsBatch(isMixed ? undefined : subject);
    qRes = await pool.query(
      'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) ORDER BY is_pyq DESC, RANDOM() LIMIT 50',
      [isMixed, '%' + subject + '%']
    ).catch(() => ({ rows: [] }));
  }

  if (qRes.rows.length === 0) {
    return safeSend(chatId, '⏳ *' + subject + '* के प्रश्न अभी तैयार किए जा रहे हैं। कृपया 1 मिनट बाद प्रयास करें।');
  }

  const rows = qRes.rows;
  const dateStr = new Date(Date.now() + 5.5 * 3600 * 1000).toLocaleDateString('hi-IN');
  const examTarget = EXAM_TARGET_MAP[subject] || 'All Competitive Exams';

  let txtPaper = '============================================================\n';
  txtPaper += '        PROFESSOR OFFLINE TEST SERIES (MODEL PAPER)         \n';
  txtPaper += '============================================================\n';
  txtPaper += 'Subject : ' + subject + '  |  Target : ' + examTarget + '\n';
  txtPaper += 'Time    : 50 Mins   |  Max Marks : ' + rows.length + '  |  Negative : 1/4 (-0.25)\n';
  txtPaper += 'Date    : ' + dateStr + '\n';
  txtPaper += 'Candidate Name: ___________________ Roll No: _______________\n';
  txtPaper += '============================================================\n\n';

  rows.forEach((q, idx) => {
    txtPaper += 'Q.' + (idx + 1) + ') [' + (q.topic || subject) + '] ' + q.question_text + '\n';
    txtPaper += '   (A) ' + q.option_a + '      (B) ' + q.option_b + '\n';
    txtPaper += '   (C) ' + q.option_c + '      (D) ' + q.option_d + '\n\n';
  });

  txtPaper += '\n============================================================\n';
  txtPaper += '              ANSWER KEY & DETAILED EXPLANATIONS            \n';
  txtPaper += '============================================================\n\n';
  rows.forEach((q, idx) => {
    txtPaper += 'Q.' + (idx + 1) + ': (' + q.correct_option + ') -> ' + (q.explanation || 'सत्यापित उत्तर।') + '\n';
  });

  if (asTextOnly) {
    const txtBuf = Buffer.from(txtPaper, 'utf-8');
    return bot.telegram.sendDocument(
      chatId,
      { source: txtBuf, filename: 'Editable_Paper_' + subject.replace(/\s+/g, '_') + '.txt' },
      { caption: '📝 *Editable Text Format (' + subject + ')*\nआप इसे MS Word, Google Docs या Notepad में खोलकर अपने कोचिंग के नाम से एडिट और प्रिंट कर सकते हैं।' }
    );
  }

  let qHtml = '';
  let omrHtml = '';
  let ansHtml = '';

  rows.forEach((q, idx) => {
    const qNum = idx + 1;
    qHtml += '<div class="q-block"><div class="q-title"><b>Q.' + qNum + '.</b> ' + q.question_text + '</div>';
    qHtml += '<div class="opts"><span>(A) ' + q.option_a + '</span><span>(B) ' + q.option_b + '</span><span>(C) ' + q.option_c + '</span><span>(D) ' + q.option_d + '</span></div></div>';
    omrHtml += '<div class="omr-row"><b>' + String(qNum).padStart(2, '0') + '.</b> <span class="bub">A</span><span class="bub">B</span><span class="bub">C</span><span class="bub">D</span></div>';
    ansHtml += '<div class="ans-row"><b>Q.' + qNum + ': (' + q.correct_option + ')</b> — ' + (q.explanation || '') + '</div>';
  });

  const htmlContent = [
    '<!DOCTYPE html><html lang="hi"><head><meta charset="UTF-8">',
    '<title>A4 Question Paper - ' + subject + '</title>',
    '<style>',
    '@page { size: A4 portrait; margin: 10mm; }',
    'body { font-family: "Noto Sans Devanagari", Arial, sans-serif; font-size: 11.5px; color: #111; line-height: 1.38; margin: 0; padding: 12px; }',
    '.no-print { text-align: center; background: #1e293b; color: #fff; padding: 12px; margin-bottom: 15px; border-radius: 8px; }',
    '.btn-print { background: #22c55e; color: #fff; border: none; padding: 10px 22px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; }',
    '@media print { .no-print { display: none !important; } body { padding: 0; } }',
    '.header { border: 2px solid #000; padding: 8px 12px; text-align: center; margin-bottom: 10px; }',
    '.header h1 { margin: 0; font-size: 18px; letter-spacing: 0.5px; }',
    '.meta { display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #000; margin-top: 6px; padding-top: 5px; font-size: 11px; }',
    '.student-box { border: 1px dashed #333; padding: 6px 10px; margin-bottom: 10px; display: flex; justify-content: space-between; font-size: 11px; }',
    '.paper-cols { column-count: 2; column-gap: 18px; column-rule: 1px solid #ccc; }',
    '.q-block { break-inside: avoid; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #ddd; }',
    '.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; margin-top: 3px; font-size: 10.8px; }',
    '.page-break { page-break-before: always; margin-top: 20px; border-top: 2px solid #000; padding-top: 12px; }',
    '.omr-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 10px; }',
    '.omr-row { border: 1px solid #ccc; padding: 4px; text-align: center; border-radius: 4px; }',
    '.bub { display: inline-block; width: 16px; height: 16px; line-height: 16px; border: 1px solid #000; border-radius: 50%; margin: 0 2px; font-size: 9px; text-align: center; }',
    '.ans-cols { column-count: 2; column-gap: 16px; font-size: 10.5px; }',
    '.ans-row { break-inside: avoid; margin-bottom: 5px; }',
    '</style></head><body>',
    '<div class="no-print"><button class="btn-print" onclick="window.print()">🖨️ Save as A4 PDF / Print Paper</button><div style="margin-top:6px;font-size:12px;">मोबाइल या कंप्यूटर में ऊपर हरे बटन को दबाकर सीधे A4 PDF सेव या प्रिंट करें</div></div>',
    '<div class="header"><h1>PROFESSOR COMPETITIVE EXAM MODEL QUESTION PAPER</h1>',
    '<div>Target Exams: ' + examTarget + '</div>',
    '<div class="meta"><span>Subject: ' + subject + '</span><span>Total Questions: ' + rows.length + '</span><span>Time: 50 Mins</span><span>Max Marks: ' + rows.length + ' (Negative: -1/4)</span></div></div>',
    '<div class="student-box"><span>Candidate Name: ________________________</span><span>Roll No: ______________</span><span>Date: ' + dateStr + '</span><span>Invigilator Sign: _________</span></div>',
    '<div class="paper-cols">' + qHtml + '</div>',
    '<div class="page-break"><h2 style="text-align:center;margin:0 0 8px 0;">OMR ANSWER SHEET (अभ्यर्थी उत्तर पत्रक)</h2><div class="omr-grid">' + omrHtml + '</div></div>',
    '<div class="page-break"><h2 style="text-align:center;margin:0 0 8px 0;">OFFICIAL ANSWER KEY & EXPLANATIONS</h2><div class="ans-cols">' + ansHtml + '</div></div>',
    '</body></html>'
  ].join('\n');

  const htmlBuf = Buffer.from(htmlContent, 'utf-8');
  await bot.telegram.sendDocument(
    chatId,
    { source: htmlBuf, filename: 'A4_Model_Paper_' + subject.replace(/\s+/g, '_') + '.html' },
    {
      caption:
        (wasFreeQuota ? '🎁 *आपका 1st FREE A4 Printable Model Paper अनलॉक हो गया है!*\n' : '') +
        '📄 *A4 Coaching Test Paper (' + subject + ')*\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '✅ *शामिल हैं:* 2-Column ' + rows.length + ' Questions + OMR Sheet + Answer Key\n' +
        '🖨️ *कैसे प्रिंट करें:* फाइल खोलकर ऊपर *हरे बटन (Save as A4 PDF / Print)* पर क्लिक करें।',
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📝 Get Editable Text (.txt) Fallback', 'pdf_txt_' + subject)],
        [Markup.button.callback('⚠️ PDF Format Issue / Complaint to Admin', 'pdf_comp_' + subject)]
      ])
    }
  );
};

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true).catch(() => {}));
bot.on('successful_payment', async (ctx) => {
  const payload = ctx.message.successful_payment.invoice_payload;
  if (payload.startsWith('sub_group_')) {
    const targetChatId = Number(payload.replace('sub_group_', ''));
    await pool.query("UPDATE channels SET sub_ends_at = NOW() + INTERVAL '365 days', approval_status = 'APPROVED', is_active = TRUE WHERE chat_id = $1", [targetChatId]);
    await safeSend(ctx.chat.id, '🎉 *भुगतान सफल (100 Stars)!*\nआपका ग्रुप/चैनल पूरे *1 साल (365 दिन)* के लिए एक्टिवेट कर दिया गया है!');
    if (ADMIN_ID) await safeSend(ADMIN_ID, '⭐ *100 Stars Group Payment Received!* Group: ' + targetChatId);
  } else if (payload.startsWith('pdf_paper_')) {
    const sub = payload.replace('pdf_paper_', '');
    await safeSend(ctx.chat.id, '✅ *10 Stars प्राप्त हुए!* आपका A4 Printable Offline Question Paper तैयार किया जा रहा है...');
    await deliverOfflineTestPaper(ctx.chat.id, sub, false, false);
  }
});

bot.action(/^pdf_txt_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  await ctx.answerCbQuery('Sending Editable Text File...');
  return deliverOfflineTestPaper(ctx.chat.id, sub, true, false);
});

bot.action(/^pdf_comp_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  userStates.set(ctx.from.id, { action: 'PDF_COMPLAINT', meta: sub });
  await ctx.answerCbQuery();
  await deliverOfflineTestPaper(ctx.chat.id, sub, true, false);
  return safeSend(
    ctx.chat.id,
    '📝 *हमने तुरंत आपके लिए Editable Text (.txt) फाइल ऊपर भेज दी है ताकि आपका काम न रुके!*\n\n' +
    '⚠️ कृपया अपनी समस्या नीचे लिखकर भेजें—आपकी शिकायत सीधे मास्टर एडमिन को भेज दी जाएगी:\n*(रद्द करने के लिए /cancel लिखें)*'
  );
});

bot.action(/^adm_sendtxt_(\d+)_(.+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const targetUid = Number(ctx.match[1]);
  const sub = ctx.match[2];
  await deliverOfflineTestPaper(targetUid, sub, true, false);
  await safeSend(targetUid, '✅ *मास्टर एडमिन ने आपकी शिकायत का समाधान करते हुए Editable Text पेपर भेज दिया है!*');
  await ctx.answerCbQuery('Sent Editable Paper to User!', { show_alert: true });
});

// =========================================================
// GROQ-ONLY STRICT SCHEMA QUESTION SEEDER (V9.1 DIAGNOSTIC)
// =========================================================
const MCQ_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question_text: { type: 'string' },
          option_a: { type: 'string' },
          option_b: { type: 'string' },
          option_c: { type: 'string' },
          option_d: { type: 'string' },
          correct_option: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          explanation: { type: 'string' },
          difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard', 'Ultra Hard', 'Max Hard'] },
          is_pyq: { type: 'boolean' }
        },
        required: ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'explanation', 'difficulty', 'is_pyq'],
        additionalProperties: false
      }
    }
  },
  required: ['questions'],
  additionalProperties: false
};

const collectGroqKeys = async (): Promise<string[]> => {
  const extraDbKeys = await getCfg('extra_ai_keys');
  const rawTokens = [process.env.GROQ_API_KEY || '', extraDbKeys]
    .join(',')
    .split(/[\s,|;\n]+/)
    .map(k => cleanEnv(k).replace(/^Bearer\s+/i, ''))
    .filter(k => k.startsWith('gsk_') && k.length > 20);

  return Array.from(new Set(rawTokens));
};

const getActiveGroqModels = async (gKey: string): Promise<string[]> => {
  if (cachedGroqModels && Date.now() - cachedGroqModels.ts < 1800000) {
    return cachedGroqModels.list.filter(m => !deadModels.has(m));
  }

  const fallbackList = GROQ_PRIORITY_MODELS.filter(m => !deadModels.has(m));
  try {
    const r = await fetchWithTimeout(`${GROQ_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${gKey}` }
    }, 10000);

    if (r.ok) {
      const d: any = await r.json();
      if (d && Array.isArray(d.data)) {
        const availableSet = new Set<string>(d.data.map((m: any) => String(m.id || '')));
        const prioritized = GROQ_PRIORITY_MODELS.filter(m => availableSet.has(m) && !deadModels.has(m));
        const extraSafe = Array.from(availableSet).filter((id: string) =>
          id &&
          !deadModels.has(id) &&
          !prioritized.includes(id) &&
          (id.startsWith('openai/gpt-oss') || id.includes('llama-3.3') || id.includes('llama-3.1')) &&
          !id.includes('safeguard') &&
          !id.includes('guard') &&
          !id.includes('whisper') &&
          !id.includes('tts') &&
          !id.includes('vision') &&
          !id.includes('audio')
        );
        const merged = [...prioritized, ...extraSafe];
        if (merged.length > 0) {
          cachedGroqModels = { list: merged, ts: Date.now() };
          console.log('[SEEDER] Active Groq models:', merged.join(', '));
          return merged;
        }
      }
    } else {
      console.error(`[SEEDER] /models check HTTP ${r.status}`);
    }
  } catch (e: any) {
    console.error('[SEEDER] /models fetch error:', e?.message);
  }
  return fallbackList;
};

const getNextSubjectAndTopic = async (forcedSubject?: string): Promise<{ subject: string; topic: string }> => {
  let subject = forcedSubject && SYLLABUS_MAP[forcedSubject] ? forcedSubject : '';

  if (!subject) {
    const countsRes = await pool.query('SELECT subject, COUNT(*) as c FROM questions GROUP BY subject').catch(() => ({ rows: [] }));
    const countMap: Record<string, number> = {};
    countsRes.rows.forEach((r: any) => { countMap[r.subject] = Number(r.c); });

    let minSub = '';
    let minVal = 999999;
    for (const s of CORE_SUBJECTS) {
      const c = countMap[s] || 0;
      if (c < minVal) { minVal = c; minSub = s; }
    }
    if (minSub && (minVal < 150 || seedCursor % 2 === 0)) {
      subject = minSub;
    }
  }

  if (!subject) subject = CORE_SUBJECTS[seedCursor++ % CORE_SUBJECTS.length];
  else seedCursor++;

  const topics = SYLLABUS_MAP[subject] || ['संपूर्ण पाठ्यक्रम एवं महत्वपूर्ण प्रश्न'];
  const progRes = await pool.query('SELECT topic_index, cycles_completed FROM syllabus_progress WHERE subject=$1', [subject]).catch(() => ({ rows: [] }));

  let tIdx = Number(progRes.rows[0]?.topic_index || 0);
  let cycles = Number(progRes.rows[0]?.cycles_completed || 0);
  if (tIdx >= topics.length) { tIdx = 0; cycles++; }

  const topic = topics[tIdx];
  const nextIdx = (tIdx + 1) % topics.length;
  const nextCycles = tIdx + 1 >= topics.length ? cycles + 1 : cycles;

  await pool.query(
    'INSERT INTO syllabus_progress (subject, topic_index, cycles_completed) VALUES ($1, $2, $3) ON CONFLICT (subject) DO UPDATE SET topic_index = $2, cycles_completed = $3',
    [subject, nextIdx, nextCycles]
  ).catch(() => {});

  return { subject, topic };
};

const parseAIQuestionsJson = (raw: string): any[] => {
  const cleaned = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    if (parsed && Array.isArray(parsed.mcqs)) return parsed.mcqs;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
  } catch {}

  try {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const arr = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
      if (Array.isArray(arr)) return arr;
    }
  } catch {}

  const salvaged: any[] = [];
  const objRegex = /\{[^{}]*"question(?:_text)?"[^{}]*\}/g;
  const matches = cleaned.match(objRegex) || [];
  for (const m of matches) {
    try {
      const obj = JSON.parse(m);
      if (obj && (obj.question_text || obj.question)) salvaged.push(obj);
    } catch {}
  }
  return salvaged;
};

const normalizeCorrectOption = (rawAns: any, opts: [string, string, string, string]): string => {
  const s = String(rawAns ?? '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
  if (/^[(\[]?([ABCD])[)\].:\s]/i.test(upper)) return upper.match(/([ABCD])/)?.[1] || '';
  if (/^(OPTION\s*)?([ABCD])\b/i.test(upper)) return upper.match(/([ABCD])\b/)?.[1] || '';
  if (s === '0' || s === '1' || s === '2' || s === '3') return ['A', 'B', 'C', 'D'][Number(s)] || '';
  // Match by option text if model returned the full answer string
  const idx = opts.findIndex(o => o.toLowerCase() === s.toLowerCase());
  if (idx !== -1) return ['A', 'B', 'C', 'D'][idx];
  const letterOnly = upper.replace(/[^ABCD]/g, '');
  return letterOnly.length === 1 ? letterOnly : '';
};

const saveQuestionsToDB = async (
  arr: any[],
  subject: string,
  topic: string
): Promise<{ saved: number; skippedInvalid: number; skippedDup: number; dbError: string }> => {
  let saved = 0;
  let skippedInvalid = 0;
  let skippedDup = 0;
  let dbError = '';
  let seqSyncedOnError = false;
  const batchSeenHashes = new Set<string>();

  for (const q of arr) {
    if (!q || typeof q !== 'object') { skippedInvalid++; continue; }

    const rawQ = q.question_text || q.question || q.q || '';
    const optArr = Array.isArray(q.options) ? q.options : [];
    const rawA = q.option_a ?? q.a ?? optArr[0] ?? '';
    const rawB = q.option_b ?? q.b ?? optArr[1] ?? '';
    const rawC = q.option_c ?? q.c ?? optArr[2] ?? '';
    const rawD = q.option_d ?? q.d ?? optArr[3] ?? '';
    const rawAns = q.correct_option ?? q.answer ?? q.correct_answer ?? q.correct ?? '';

    const qText = String(rawQ).replace(/\s+/g, ' ').trim().substring(0, 230);
    const optA = String(rawA).replace(/\s+/g, ' ').trim().substring(0, 95);
    const optB = String(rawB).replace(/\s+/g, ' ').trim().substring(0, 95);
    const optC = String(rawC).replace(/\s+/g, ' ').trim().substring(0, 95);
    const optD = String(rawD).replace(/\s+/g, ' ').trim().substring(0, 95);

    if (qText.length < 10 || !optA || !optB || !optC || !optD) { skippedInvalid++; continue; }

    const uniqueOpts = new Set([optA.toLowerCase(), optB.toLowerCase(), optC.toLowerCase(), optD.toLowerCase()]);
    if (uniqueOpts.size < 4) { skippedInvalid++; continue; }

    const cOpt = normalizeCorrectOption(rawAns, [optA, optB, optC, optD]);
    if (!['A', 'B', 'C', 'D'].includes(cOpt)) { skippedInvalid++; continue; }

    const qHash = makeQuestionHash(qText);
    if (batchSeenHashes.has(qHash)) { skippedDup++; continue; }
    batchSeenHashes.add(qHash);

    const exp = String(q.explanation || 'NCERT एवं आयोग की आधिकारिक उत्तर-कुंजी द्वारा सत्यापित।').replace(/\s+/g, ' ').trim().substring(0, 180);
    const diff = DIFF_TIERS.includes(q.difficulty) ? q.difficulty : 'Medium';

    const insertSql =
      'INSERT INTO questions (subject, topic, question_text, q_hash, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, is_pyq) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id';
    const params = [subject, topic, qText, qHash, optA, optB, optC, optD, cOpt, exp, diff, Boolean(q.is_pyq)];

    try {
      const res = await pool.query(insertSql, params);
      if (res && res.rowCount && res.rowCount > 0) saved++;
    } catch (err: any) {
      const code = String(err?.code || '');
      const constraint = String(err?.constraint || '').toLowerCase();
      if (code === '23505') {
        if (constraint.includes('pkey') && !seqSyncedOnError) {
          seqSyncedOnError = true;
          await syncQuestionsSequence();
          try {
            const retryRes = await pool.query(insertSql, params);
            if (retryRes && retryRes.rowCount && retryRes.rowCount > 0) { saved++; continue; }
          } catch (retryErr: any) {
            if (String(retryErr?.code) === '23505') { skippedDup++; continue; }
            dbError = `${retryErr?.code || 'DB'}: ${String(retryErr?.message || '').substring(0, 55)}`;
            console.error('[DB INSERT RETRY ERROR]', retryErr?.message);
          }
        } else {
          skippedDup++;
        }
      } else {
        dbError = `${code || 'DB'}: ${String(err?.message || '').substring(0, 55)}`;
        console.error('[DB INSERT ERROR]', code, err?.message);
      }
    }
  }

  const dKey = getTodayKey();
  if (todaySeedDayKey !== dKey) {
    todaySeedDayKey = dKey;
    todaySeededCount = 0;
  }
  todaySeededCount += saved;
  return { saved, skippedInvalid, skippedDup, dbError };
};

const callGroqChatCompletion = async (
  gKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  formatMode: 'strict_schema' | 'json_object' | 'none'
) => {
  const isGptOss = model.startsWith('openai/gpt-oss');
  const body: Record<string, any> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_completion_tokens: isGptOss ? 6000 : 4500
  };

  if (formatMode === 'strict_schema' && isGptOss) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'mcq_batch',
        strict: true,
        schema: MCQ_JSON_SCHEMA
      }
    };
  } else if (formatMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  if (isGptOss) {
    body.reasoning_effort = 'low';
  }

  const r = await fetchWithTimeout(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gKey}`
    },
    body: JSON.stringify(body)
  }, 38000);

  const retryAfterSec = Number(r.headers.get('retry-after') || 0);
  const data: any = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, retryAfterSec, data };
};

const generateQuestionsBatch = async (forcedSub?: string): Promise<{ ok: boolean; count: number; sub: string; topic: string; provider: string; error?: string }> => {
  if (isSeedingNow && (Date.now() - seedingStartedAt > 80000)) isSeedingNow = false;
  if (isSeedingNow && !forcedSub) return { ok: false, count: 0, sub: 'BUSY', topic: '', provider: 'NONE' };
  if ((await getCfg('factory_on')) === 'false' && !forcedSub) return { ok: false, count: 0, sub: 'PAUSED', topic: '', provider: 'NONE' };

  isSeedingNow = true;
  seedingStartedAt = Date.now();

  try {
    const groqKeys = await collectGroqKeys();
    if (groqKeys.length === 0) {
      const msg = '❌ GROQ API KEY नहीं मिली! GitHub Secrets या Admin Panel से gsk Key जोड़ें।';
      lastSeedReport = msg;
      console.error('[SEEDER]', msg);
      return { ok: false, count: 0, sub: 'NO_KEY', topic: '', provider: 'NONE', error: msg };
    }

    const { subject, topic } = await getNextSubjectAndTopic(forcedSub);
    const examTarget = EXAM_TARGET_MAP[subject] || 'UPSC, UPPSC, SSC, Railway';
    const langInstruction = subject === 'ENGLISH'
      ? 'Language: Standard Competitive Exam English only.'
      : 'Language: Pure, clear Hindi (Devanagari script). Keep technical terms in English brackets only if helpful.';

    const recentRes = await pool.query(
      'SELECT option_a, option_b, option_c, option_d, correct_option FROM questions WHERE subject=$1 AND topic=$2 ORDER BY id DESC LIMIT 8',
      [subject, topic]
    ).catch(() => ({ rows: [] }));

    const usedAnswers = recentRes.rows.map((r: any) => {
      const m: Record<string, string> = { A: r.option_a, B: r.option_b, C: r.option_c, D: r.option_d };
      return String(m[r.correct_option] || r.option_a).substring(0, 28);
    }).filter(Boolean).join(', ');

    const systemPrompt =
      'You are an expert Indian Competitive Exam Question Setter (UPSC/UPPSC/SSC/Railway). ' +
      'Respond strictly with a valid JSON object having a single key "questions" containing an array of 10 unique MCQ objects.';

    const userPrompt = [
      `Generate 10 fresh, unique, NCERT-verified MCQs for ${examTarget}.`,
      `Subject: ${subject} | Topic: ${topic}`,
      langInstruction,
      usedAnswers ? `Avoid repeating answers already used: [${usedAnswers}].` : '',
      'Mix difficulties: 2 Easy, 3 Medium, 2 Hard, 2 Ultra Hard, 1 Max Hard. Mark 3-4 as real PYQs (is_pyq: true) with [Exam Year] tag.',
      'Limits: question_text <= 200 chars, each option <= 80 chars, explanation <= 160 chars, all 4 options distinct.',
      'JSON format: {"questions":[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"A","explanation":"...","difficulty":"Medium","is_pyq":false}]}'
    ].filter(Boolean).join('\n');

    let rateLimitedHits = 0;
    let lastErrorDetail = '';

    for (let kIdx = 0; kIdx < groqKeys.length; kIdx++) {
      const gKey = groqKeys[(modelRotationCursor + kIdx) % groqKeys.length];
      const groqModels = await getActiveGroqModels(gKey);

      for (let i = 0; i < groqModels.length; i++) {
        const mName = groqModels[(modelRotationCursor + i) % groqModels.length];
        if (deadModels.has(mName)) continue;

        const cooldownKey = `${kIdx}:${mName}`;
        const coolUntil = modelCooldownUntil.get(cooldownKey) || 0;
        if (Date.now() < coolUntil && !forcedSub) {
          rateLimitedHits++;
          continue;
        }

        const shortModel = mName.split('/').pop() || mName;
        const isGptOss = mName.startsWith('openai/gpt-oss');

        try {
          let resp = await callGroqChatCompletion(
            gKey,
            mName,
            systemPrompt,
            userPrompt,
            isGptOss ? 'strict_schema' : 'json_object'
          );

          // Fallback to plain JSON prompt if strict schema or json_object rejected with 400
          if (!resp.ok && resp.status === 400) {
            console.warn(`[SEEDER] ${shortModel} HTTP 400 (${resp.data?.error?.message || ''}), retrying plain mode...`);
            resp = await callGroqChatCompletion(gKey, mName, systemPrompt, userPrompt, 'none');
          }

          if (!resp.ok || resp.data?.error) {
            const errMsg = String(resp.data?.error?.message || resp.data?.error?.code || `HTTP ${resp.status}`);
            const lower = errMsg.toLowerCase();
            lastErrorDetail = `${shortModel}: ${escMd(errMsg).substring(0, 65)}`;
            console.error(`[SEEDER ERROR] ${lastErrorDetail}`);

            if (resp.status === 401 || lower.includes('invalid api key')) {
              break;
            }
            if (lower.includes('decommission') || lower.includes('not exist') || lower.includes('model_not_found')) {
              deadModels.add(mName);
              continue;
            }
            if (resp.status === 429 || lower.includes('rate limit') || lower.includes('tokens per')) {
              const waitMs = resp.retryAfterSec > 0
                ? Math.min(resp.retryAfterSec * 1000, 3600000)
                : 15 * 60 * 1000;
              modelCooldownUntil.set(cooldownKey, Date.now() + waitMs);
              rateLimitedHits++;
              continue;
            }
            continue;
          }

          const choice = resp.data?.choices?.[0];
          const content = String(choice?.message?.content || '').trim();
          const finishReason = String(choice?.finish_reason || 'unknown');

          if (!content) {
            lastErrorDetail = `${shortModel}: empty content (finish=${finishReason})`;
            console.warn(`[SEEDER WARN] ${lastErrorDetail}`);
            continue;
          }

          const arr = parseAIQuestionsJson(content);
          if (arr.length === 0) {
            lastErrorDetail = `${shortModel}: JSON parse empty (len=${content.length})`;
            console.warn(`[SEEDER WARN] ${lastErrorDetail} | preview=${content.substring(0, 120)}`);
            continue;
          }

          const stats = await saveQuestionsToDB(arr, subject, topic);
          if (stats.saved > 0) {
            modelRotationCursor++;
            lastSeedReport = `✅ Groq (${shortModel}) +${stats.saved} Qs [${subject}] (Today: +${todaySeededCount})`;
            console.log(`[SEEDER] ${lastSeedReport} | dup=${stats.skippedDup} inv=${stats.skippedInvalid}`);
            return { ok: true, count: stats.saved, sub: subject, topic, provider: `Groq (${shortModel})` };
          }

          lastErrorDetail = stats.dbError
            ? `DB Err: ${escMd(stats.dbError)}`
            : `${shortModel}: parsed ${arr.length}, 0 saved (dup=${stats.skippedDup}, inv=${stats.skippedInvalid})`;
          console.warn(`[SEEDER ZERO SAVE] ${lastErrorDetail}`);
        } catch (err: any) {
          lastErrorDetail = `${shortModel}: ${escMd(String(err?.message || 'Timeout')).substring(0, 50)}`;
          console.error(`[SEEDER CATCH] ${lastErrorDetail}`);
        }
      }
    }

    const qCountRes = await pool.query('SELECT COUNT(*) FROM questions').catch(() => ({ rows: [{ count: 0 }] }));
    const totalInDb = Number(qCountRes.rows[0]?.count || 0);
    const statusMsg = rateLimitedHits > 0 && !lastErrorDetail
      ? `⏳ Groq Cooldown (${totalInDb} Qs Ready — Auto-Resumes soon)`
      : `⚠️ ${lastErrorDetail || 'No Groq model returned new Qs'} | DB: ${totalInDb} Qs`;
    lastSeedReport = escMd(statusMsg);
    return { ok: false, count: 0, sub: subject, topic, provider: 'GROQ_WAIT', error: lastSeedReport };
  } catch (e: any) {
    const errText = escMd(String(e?.message || 'Unknown error'));
    lastSeedReport = '⚠️ Seeder Exception: ' + errText.substring(0, 60);
    console.error('[SEEDER FATAL]', e);
    return { ok: false, count: 0, sub: 'ERROR', topic: '', provider: 'NONE', error: errText };
  } finally {
    isSeedingNow = false;
  }
};

// Smart Auto-Seeder: Every 8 minutes
setInterval(() => {
  generateQuestionsBatch().catch(() => {});
}, 480000);

// =========================================================
// TOPIC META, LEADERBOARD & 3-PLAYER ONLINE LOBBY
// =========================================================
const getTopicSummaryMeta = async (subject: string) => {
  const topics = SYLLABUS_MAP[subject] || ['संपूर्ण पाठ्यक्रम'];
  const progRes = await pool.query('SELECT topic_index, cycles_completed FROM syllabus_progress WHERE subject=$1', [subject]).catch(() => ({ rows: [] }));
  const tIdx = Number(progRes.rows[0]?.topic_index || 0);
  const currentTopic = topics[tIdx % topics.length];
  const totalQRes = await pool.query('SELECT COUNT(*) FROM questions WHERE subject=$1', [subject]).catch(() => ({ rows: [{ count: 0 }] }));
  const totalSubjectQs = Number(totalQRes.rows[0]?.count || 0);
  return { currentTopic, totalSubjectQs };
};

const announceAndPinLeaderboard = async (chatId: number, subject: string) => {
  try {
    await clearTempGroupMessages(chatId);
    const giftTag = await getCfg('gift_tagline');
    const seoTags = await getCfg('seo_tags');
    const top = await pool.query('SELECT user_id, username, right_count, wrong_count, net_marks FROM test_scores WHERE chat_id=$1 ORDER BY net_marks DESC, right_count DESC LIMIT 10', [chatId]);

    let msg = '🏛 *SUBJECT TEST CLOSED: ' + subject + '* 🏛\n';
    msg += '• 🎯 *Target:* ' + (EXAM_TARGET_MAP[subject] || 'All Exams') + '\n';
    msg += '• ⚖️ *Rule:* +1.00 Right | -0.25 Wrong (1/4 Negative)\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━\n';

    if (top.rows.length === 0) {
      msg += 'इस सत्र में किसी भी छात्र का स्कोर दर्ज नहीं हुआ।\n\n';
    } else {
      msg += '🏆 *TOP 10 MERIT LIST (Name ➔ Score):*\n\n';
      top.rows.forEach((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖' + (i + 1) + '.';
        const deducted = (Number(r.wrong_count) * 0.25).toFixed(2);
        msg += medal + ' [' + escMd(r.username) + '](tg://user?id=' + r.user_id + ') ➔ *' + Number(r.net_marks).toFixed(2) + '/50* (✅' + r.right_count + ' ❌' + r.wrong_count + ' ✂️-' + deducted + ')\n';
      });
      msg += '\n';
    }

    msg += '*' + giftTag + '*\n';
    msg += '📓 *गलत सवालों का रिवीजन:* बॉट के DM में `/mistakes` लिखें!\n';
    msg += '📄 *1st Free A4 Paper:* /pdf | 📊 *Report:* /myreport\n' + seoTags;

    const sent = await safeSend(chatId, msg, Markup.inlineKeyboard([
      [Markup.button.callback('🙋‍♂️ Ready for Next Quiz (0/3)', 'ready_quiz_' + chatId), Markup.button.callback('👑 Admin Instant Start', 'gstart_' + chatId)]
    ]));
    if (sent && 'message_id' in sent) await bot.telegram.pinChatMessage(chatId, sent.message_id, { disable_notification: false }).catch(() => {});
  } catch {}
};

const announceDailyClosingReport = async () => {
  const dayKey = getTodayKey();
  const giftTag = await getCfg('gift_tagline');
  const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));

  for (const c of chs.rows) {
    const cid = Number(c.chat_id);
    await clearTempGroupMessages(cid);
    const top = await pool.query(
      'SELECT user_id, username, right_count, wrong_count, net_marks FROM daily_scores WHERE day_key=$1 AND chat_id=$2 ORDER BY net_marks DESC LIMIT 10',
      [dayKey, cid]
    ).catch(() => ({ rows: [] }));

    let msg = '🌙 *DAILY CLOSING REPORT (' + dayKey + ')* 🌙\n';
    msg += '• 📊 *Summary:* 15 Hours (13 Subjects + 2 Mixed Tests Completed)\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━\n';

    if (top.rows.length === 0) {
      msg += 'आज के सत्र समाप्त हुए। कल सुबह 8:00 AM पर पुनः लाइव टेस्ट शुरू होंगे!\n\n';
    } else {
      msg += '👑 *TODAY OVERALL TOP 10 CHAMPIONS:*\n\n';
      top.rows.forEach((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖' + (i + 1) + '.';
        const deducted = (Number(r.wrong_count) * 0.25).toFixed(2);
        msg += medal + ' [' + escMd(r.username) + '](tg://user?id=' + r.user_id + ') ➔ *' + Number(r.net_marks).toFixed(2) + ' Pts* (✅' + r.right_count + ' ❌' + r.wrong_count + ' ✂️-' + deducted + ')\n';
      });
      msg += '\n';
    }
    msg += '*' + giftTag + '*\n⏰ *कल सुबह 8:00 AM से नए टॉपिक-वाइज टेस्ट फिर शुरू होंगे!*';

    const sent = await safeSend(cid, msg);
    if (sent && 'message_id' in sent) await bot.telegram.pinChatMessage(cid, sent.message_id, { disable_notification: false }).catch(() => {});
    await sleep(300);
  }
};

const stopTestInGroup = async (chatId: number, saveCheckpoint: boolean = true) => {
  const running = activeTests.get(chatId);
  if (!running) return;
  clearInterval(running.timer);
  activeTests.delete(chatId);

  if (saveCheckpoint && running.currentQ < 50) {
    await pool.query("UPDATE channels SET checkpoints = jsonb_set(COALESCE(checkpoints, '{}'::jsonb), ARRAY[$1], to_jsonb($2::int)) WHERE chat_id = $3", [running.subject, running.currentQ, chatId]).catch(() => {});
    const sent = await safeSend(
      chatId,
      '⏸ *' + running.subject + ' टेस्ट Q.' + running.currentQ + ' पर रुका।* अगले राउंड में यहीं से आगे बढ़ेगा!\n👇 *3 छात्र Ready बटन दबाकर या एडमिन 1-Click से तुरंत टेस्ट दोबारा शुरू कर सकते हैं:*',
      Markup.inlineKeyboard([
        [Markup.button.callback('🙋‍♂️ Ready to Resume (0/3)', 'ready_quiz_' + chatId), Markup.button.callback('👑 Admin Start', 'gstart_' + chatId)]
      ])
    );
    if (sent && 'message_id' in sent) trackTempMessage(chatId, sent.message_id);
  }
};

const sendQuizSafe = async (chatId: number, questionText: string, opts: string[], finalIdx: number, explanation: string, pollDuration: number) => {
  try {
    return await bot.telegram.sendQuiz(chatId, questionText, opts, { correct_option_id: finalIdx, explanation, open_period: pollDuration, is_anonymous: false });
  } catch {
    return await bot.telegram.sendQuiz(chatId, questionText, opts, { correct_option_id: finalIdx, explanation, open_period: pollDuration, is_anonymous: true });
  }
};

const openThreePlayerLobby = async (chatId: number, subject: string) => {
  await clearTempGroupMessages(chatId);
  const lobby = { users: new Map<number, string>(), subject, updatedAt: Date.now() };
  quizLobbies.set(chatId, lobby);
  const meta = await getTopicSummaryMeta(subject);
  const txt =
    '🔔 *LIVE QUIZ LOBBY: ' + subject + '*\n' +
    '• 📌 *Topic:* ' + meta.currentTopic + '\n' +
    '• 👥 *Status:* *0/3 छात्र ऑनलाइन तैयार हैं*\n\n' +
    '👇 *नीचे "🙋‍♂️ I\'m Ready" बटन दबाएं—जैसे ही 3 ऑनलाइन लोग बटन दबाएंगे (या एडमिन Start दबाएंगे), लाइव क्विज़ तुरंत शुरू हो जाएगा!*';

  const sent = await safeSend(
    chatId,
    txt,
    Markup.inlineKeyboard([
      [Markup.button.callback("🙋‍♂️ I'm Ready! Start Quiz (0/3)", 'ready_quiz_' + chatId)],
      [Markup.button.callback('👑 Admin Instant Start (1-Click)', 'gstart_' + chatId)]
    ])
  );
  if (sent && 'message_id' in sent) trackTempMessage(chatId, sent.message_id);
};

const startHourlySubjectTest = async (chatId: number, subject: string, resumeFromMinuteOffset: number = 0, forceStart: boolean = false) => {
  if (activeTests.has(chatId)) await stopTestInGroup(chatId, true);
  await clearTempGroupMessages(chatId);
  quizLobbies.delete(chatId);

  let chRes = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]).catch(() => ({ rows: [] }));
  if (chRes.rows.length === 0) {
    await pool.query("INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status, trial_ends_at) VALUES($1,'Quiz Group','supergroup',$2,TRUE,'APPROVED', NOW() + INTERVAL '30 days') ON CONFLICT DO NOTHING", [chatId, Number(ADMIN_ID)]).catch(() => {});
    chRes = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]).catch(() => ({ rows: [] }));
  }
  const ch = chRes.rows[0] || { chat_id: chatId, title: 'Quiz Group', chat_type: 'supergroup', approval_status: 'APPROVED', is_active: true };

  const perm = isGroupAllowedToPost(ch);
  if (!perm.ok) {
    if (perm.reason === 'EXPIRED') {
      await safeSend(chatId, '⚠️ *इस ग्रुप का 30 दिनों का फ्री ट्रायल समाप्त हो चुका है!*\nपूरे 1 साल (365 दिन) अनलिमिटेड लाइव टेस्ट चलाने के लिए *100 Stars* से एक्टिवेट करें:');
      return sendGroupStarsInvoice(chatId, chatId);
    }
    return;
  }

  const minCheckOn = (await getCfg('min_participants_enabled')) !== 'false';
  if (minCheckOn && !forceStart && chatId < 0 && resumeFromMinuteOffset === 0 && ch.chat_type !== 'channel') {
    return openThreePlayerLobby(chatId, subject);
  }

  const isMixed = subject.startsWith('MIXED');
  const existingCountRes = await pool.query(
    'SELECT COUNT(*) FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2)',
    [isMixed, '%' + subject + '%']
  ).catch(() => ({ rows: [{ count: 0 }] }));

  if (Number(existingCountRes.rows[0]?.count || 0) < 5) {
    await generateQuestionsBatch(isMixed ? undefined : subject);
  }

  const savedQ = Number(ch.checkpoints?.[subject] || 0);
  let currentQ = savedQ > 0 && savedQ < 50 ? savedQ : resumeFromMinuteOffset;
  if (currentQ === 0) await pool.query('DELETE FROM test_scores WHERE chat_id=$1', [chatId]).catch(() => {});

  const meta = await getTopicSummaryMeta(subject);
  const seoTags = await getCfg('seo_tags');
  const customCap = ch.custom_caption ? '• 📢 *Note:* ' + ch.custom_caption + '\n' : '';

  await safeSend(
    chatId,
    '🏛 *LIVE TEST: ' + subject + '* ' + (currentQ > 0 ? '*(Resume Q.' + (currentQ + 1) + ')*' : '') + '\n' +
    '• 🎯 *Exams:* ' + (EXAM_TARGET_MAP[subject] || 'All Exams') + '\n' +
    '• 📌 *Topic:* ' + meta.currentTopic + '\n' +
    '• ✅ *Question Bank:* ' + meta.totalSubjectQs + ' Unique Qs\n' +
    '• 📋 *Rule:* 50 Qs | ⚖️ -1/4 Negative | ⏱ 15s-55s\n' +
    customCap + seoTags,
    Markup.inlineKeyboard([
      [Markup.button.callback('🛑 Stop Test (Admin)', 'pause_test_' + chatId), Markup.button.callback('📄 Get A4 PDF (1st Free)', 'buy_pdf_' + subject)]
    ])
  );

  const sendNextQuestion = async () => {
    currentQ++;
    const state = activeTests.get(chatId);
    if (state) state.currentQ = currentQ;

    if (currentQ > 50) {
      await stopTestInGroup(chatId, false);
      await pool.query("UPDATE channels SET checkpoints = jsonb_set(COALESCE(checkpoints, '{}'::jsonb), ARRAY[$1], '0'::jsonb) WHERE chat_id=$2", [subject, chatId]).catch(() => {});
      await announceAndPinLeaderboard(chatId, subject);
      return;
    }

    const tierIndex = Math.min(4, Math.floor((currentQ - 1) / 10));
    const targetDiff = DIFF_TIERS[tierIndex];
    const preferPyq = currentQ % 5 === 0;

    try {
      let qRes = await pool.query(
        'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) AND difficulty = $3 AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $4) ORDER BY (is_pyq = $5) DESC, RANDOM() LIMIT 1',
        [isMixed, '%' + subject + '%', targetDiff, chatId, preferPyq]
      );
      if (qRes.rows.length === 0) {
        qRes = await pool.query('SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $3) ORDER BY RANDOM() LIMIT 1', [isMixed, '%' + subject + '%', chatId]);
      }
      if (qRes.rows.length === 0) {
        await pool.query('DELETE FROM asked_history WHERE chat_id=$1', [chatId]).catch(() => {});
        qRes = await pool.query('SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) ORDER BY RANDOM() LIMIT 1', [isMixed, '%' + subject + '%']);
      }
      if (qRes.rows.length === 0) {
        qRes = await pool.query('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1');
      }
      if (qRes.rows.length === 0) {
        await stopTestInGroup(chatId, true);
        return;
      }

      const q = qRes.rows[0];
      await pool.query('INSERT INTO asked_history(chat_id, question_id, asked_at) VALUES($1,$2,NOW()) ON CONFLICT DO NOTHING', [chatId, q.id]).catch(() => {});

      const pollDuration = getPollTimer(q.subject || subject, q.difficulty || targetDiff);
      const pyqTag = q.is_pyq ? '⭐PYQ ' : '';
      const shortTopic = (q.topic || subject).substring(0, 24);
      const shortExam = (EXAM_TARGET_MAP[q.subject || subject] || 'PSC/SSC').split('|').slice(0, 2).join('/');
      const qHeader = 'Q.' + currentQ + '/50 | ' + (q.difficulty || targetDiff) + ' (' + pollDuration + 's) | 🎯' + shortExam.trim() + '\n📌 ' + shortTopic + ' ' + pyqTag + '\n';
      const questionText = (qHeader + q.question_text).substring(0, 298);
      const opts = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
      const cIdx = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
      const finalIdx = cIdx !== -1 ? cIdx : 0;

      const sentPoll = await sendQuizSafe(chatId, questionText, opts, finalIdx, '💡 ' + (q.explanation || 'सत्यापित उत्तर।').substring(0, 185), pollDuration);
      if (sentPoll?.poll?.id) {
        await pool.query('INSERT INTO poll_tracking(poll_id, chat_id, question_id, correct_index) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [sentPoll.poll.id, chatId, q.id, finalIdx]).catch(() => {});
      }
    } catch {}
  };

  sendNextQuestion();
  const timer = setInterval(sendNextQuestion, 60000);
  activeTests.set(chatId, { timer, subject, currentQ });
};

// =========================================================
// INTERACTIVE 1-BY-1 SEQUENTIAL SOLO PRACTICE ENGINE
// =========================================================
const finishSoloSession = async (uid: number, stoppedManually: boolean = false) => {
  const session = soloSessions.get(uid);
  if (!session) return;
  if (session.nextTimer) clearTimeout(session.nextTimer);
  session.active = false;
  soloSessions.delete(uid);

  const attempted = session.right + session.wrong;
  const netMarks = (session.right - session.wrong * 0.25).toFixed(2);
  const accuracy = attempted > 0 ? ((session.right / attempted) * 100).toFixed(1) : '0.0';
  const totalQs = session.questions.length;

  const title = session.mode === 'MISTAKES'
    ? '📓 *MISTAKE REVISION COMPLETED*'
    : `⚡ *SOLO TEST SCORECARD: ${session.subject}*`;

  const msg =
    `${title}${stoppedManually ? ' *(Stopped)*' : ''}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *कुल प्रश्न:* ${totalQs} | ✍️ *Attempted:* ${attempted} | ⏭ *Skipped:* ${session.skipped}\n` +
    `✅ *सही:* ${session.right} | ❌ *गलत:* ${session.wrong}\n` +
    `🎯 *Accuracy:* *${accuracy}%*\n` +
    `🏆 *Net Marks (-0.25):* *${netMarks} / ${totalQs}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Tip:* आपके गलत हुए सवाल अपने आप *Mistake Notebook* में सेव हो गए हैं!`;

  await safeSend(
    session.chatId,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔁 Re-Test ' + session.subject, 'solo_' + session.subject), Markup.button.callback('📓 Revise Mistakes', 'u_mistakes')],
      [Markup.button.callback('📊 Full Report Card', 'u_report'), Markup.button.callback('🔙 Main Menu', 'u_home')]
    ])
  );
};

const sendNextSoloQuestion = async (uid: number) => {
  const session = soloSessions.get(uid);
  if (!session || !session.active) return;

  if (session.index >= session.questions.length) {
    return finishSoloSession(uid, false);
  }

  const q = session.questions[session.index];
  const qNum = session.index + 1;
  const total = session.questions.length;
  const pollDuration = getPollTimer(q.subject || session.subject, q.difficulty || 'Medium');
  const opts = [q.option_a.substring(0, 95), q.option_b.substring(0, 95), q.option_c.substring(0, 95), q.option_d.substring(0, 95)];
  const cIdx = ['A', 'B', 'C', 'D'].indexOf((q.correct_option || 'A').toUpperCase().charAt(0));
  const finalIdx = cIdx !== -1 ? cIdx : 0;

  const badge = session.mode === 'MISTAKES' ? '📓 [Mistake Review]' : `⚡ Q.${qNum}/${total} | ${q.difficulty || 'Medium'}`;
  const header = `${badge} (${pollDuration}s)\n📌 ${(q.topic || q.subject || session.subject).substring(0, 28)}\n`;
  const sent = await sendQuizSafe(
    session.chatId,
    (header + q.question_text).substring(0, 298),
    opts,
    finalIdx,
    '💡 ' + (q.explanation || 'सत्यापित उत्तर।').substring(0, 185),
    pollDuration
  );

  session.index++;

  if (sent?.poll?.id) {
    session.currentPollId = sent.poll.id;
    await pool.query('INSERT INTO poll_tracking(poll_id, chat_id, question_id, correct_index) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [sent.poll.id, session.chatId, q.id, finalIdx]).catch(() => {});
  }

  if (session.nextTimer) clearTimeout(session.nextTimer);
  session.nextTimer = setTimeout(() => {
    const s = soloSessions.get(uid);
    if (s && s.active && s.currentPollId === sent?.poll?.id) {
      s.skipped++;
      s.currentPollId = undefined;
      sendNextSoloQuestion(uid);
    }
  }, (pollDuration + 3) * 1000);
};

const launchSoloSession = async (ctx: any, subject: string, questions: any[], mode: 'SOLO' | 'MISTAKES') => {
  const uid = ctx.from.id;
  if (soloSessions.has(uid)) {
    const old = soloSessions.get(uid)!;
    if (old.nextTimer) clearTimeout(old.nextTimer);
    soloSessions.delete(uid);
  }

  const session: SoloSession = {
    chatId: ctx.chat.id,
    subject,
    mode,
    questions,
    index: 0,
    right: 0,
    wrong: 0,
    skipped: 0,
    active: true
  };
  soloSessions.set(uid, session);

  const label = mode === 'MISTAKES'
    ? `📓 *MISTAKE REVISION STARTED (${questions.length} Questions)*\n*नियम:* सही उत्तर देने पर सवाल Mistake List से हट जाएगा। हर उत्तर के बाद अगला सवाल अपने आप आएगा!`
    : `⚡ *LIVE SOLO TEST: ${subject} (${questions.length} Questions)*\n• ⚖️ *Marking:* +1.00 Right | -0.25 Wrong\n• ⏩ *Smart Flow:* उत्तर देते ही 2.5 सेकंड में अगला सवाल आएगा!`;

  await safeSend(
    ctx.chat.id,
    label,
    Markup.inlineKeyboard([[Markup.button.callback('🛑 End Test & See Scorecard', 'stop_solo')]])
  );

  await sleep(800);
  sendNextSoloQuestion(uid);
};

bot.action('stop_solo', async (ctx) => {
  await ctx.answerCbQuery('Test Ended!');
  return finishSoloSession(ctx.from.id, true);
});

// Handle 3-User Online Ready Button Click
bot.action(/^ready_quiz_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  if (activeTests.has(cid)) {
    return ctx.answerCbQuery('🔥 इस ग्रुप में लाइव क्विज़ पहले से चल रहा है!', { show_alert: true });
  }

  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());

  if (isMaster(ctx.from.id)) {
    await ctx.answerCbQuery('👑 Admin Instant Start: ' + sub + ' Quiz शुरू हो रहा है!');
    await ctx.deleteMessage().catch(() => {});
    return startHourlySubjectTest(cid, sub, 0, true);
  }

  let lobby = quizLobbies.get(cid);
  if (!lobby || Date.now() - lobby.updatedAt > 1800000) {
    lobby = { users: new Map<number, string>(), subject: sub, updatedAt: Date.now() };
    quizLobbies.set(cid, lobby);
  }

  const uName = escMd(ctx.from.first_name || ctx.from.username || 'Student').substring(0, 16);
  lobby.users.set(ctx.from.id, uName);
  lobby.updatedAt = Date.now();

  const readyCount = lobby.users.size;
  const namesList = Array.from(lobby.users.values()).join(', ');

  if (readyCount >= 3) {
    quizLobbies.delete(cid);
    await ctx.answerCbQuery('🎉 3 छात्र तैयार! लाइव क्विज़ शुरू हो रहा है!');
    await ctx.deleteMessage().catch(() => {});
    return startHourlySubjectTest(cid, lobby.subject, 0, true);
  }

  await ctx.answerCbQuery('✅ आप जुड़ गए! (' + readyCount + '/3 तैयार — ' + (3 - readyCount) + ' और चाहिए)');
  const txt =
    '🔔 *LIVE QUIZ LOBBY: ' + lobby.subject + '*\n' +
    '• 👥 *Status:* *' + readyCount + '/3 छात्र ऑनलाइन तैयार हैं*\n' +
    '• ✅ *Ready Students:* ' + namesList + '\n\n' +
    '👇 *सिर्फ़ ' + (3 - readyCount) + ' और छात्र नीचे "🙋‍♂️ I\'m Ready" बटन दबाएं, क्विज़ तुरंत शुरू हो जाएगा!*';

  return safeEdit(
    ctx,
    txt,
    Markup.inlineKeyboard([
      [Markup.button.callback("🙋‍♂️ I'm Ready! Start Quiz (" + readyCount + '/3)', 'ready_quiz_' + cid)],
      [Markup.button.callback('👑 Admin Instant Start (1-Click)', 'gstart_' + cid)]
    ])
  );
});

bot.command('startquiz', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('यह कमांड अपने ग्रुप के अंदर लिखें, या DM प्रैक्टिस के लिए /practice लिखें।');
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  if (await isGroupAdminOrMaster(ctx, ctx.chat.id, ctx.from.id)) return startHourlySubjectTest(ctx.chat.id, sub, 0, true);
  return openThreePlayerLobby(ctx.chat.id, sub);
});

// =========================================================
// POLL ANSWER TRACKER + SEQUENTIAL SOLO AUTO-ADVANCE
// =========================================================
bot.on('poll_answer', async (ctx) => {
  try {
    const ans = ctx.pollAnswer;
    if (!ans.option_ids || ans.option_ids.length === 0) return;
    const uid = ans.user.id;
    const uname = escMd(ans.user.first_name || ans.user.username || 'Student').substring(0, 18);
    const chosen = ans.option_ids[0];

    const pRes = await pool.query('SELECT chat_id, question_id, correct_index FROM poll_tracking WHERE poll_id=$1', [ans.poll_id]);
    if (pRes.rows.length === 0) return;
    const { chat_id, question_id, correct_index } = pRes.rows[0];

    const isRight = chosen === Number(correct_index);
    const rInc = isRight ? 1 : 0;
    const wInc = isRight ? 0 : 1;
    const markDelta = isRight ? 1.00 : -0.25;

    if (Number(question_id) > 0) {
      if (!isRight) {
        await pool.query('INSERT INTO user_mistakes(user_id, question_id, wrong_at) VALUES($1,$2,NOW()) ON CONFLICT (user_id, question_id) DO UPDATE SET wrong_at=NOW()', [uid, question_id]).catch(() => {});
      } else {
        await pool.query('DELETE FROM user_mistakes WHERE user_id=$1 AND question_id=$2', [uid, question_id]).catch(() => {});
      }
    }

    await pool.query(
      'INSERT INTO test_scores (chat_id, user_id, username, right_count, wrong_count, net_marks) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (chat_id, user_id) DO UPDATE SET username = $3, right_count = test_scores.right_count + $4, wrong_count = test_scores.wrong_count + $5, net_marks = test_scores.net_marks + $6',
      [chat_id, uid, uname, rInc, wInc, markDelta]
    );

    const dayKey = getTodayKey();
    await pool.query(
      'INSERT INTO daily_scores (day_key, chat_id, user_id, username, right_count, wrong_count, net_marks) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (day_key, chat_id, user_id) DO UPDATE SET username = $4, right_count = daily_scores.right_count + $5, wrong_count = daily_scores.wrong_count + $6, net_marks = daily_scores.net_marks + $7',
      [dayKey, chat_id, uid, uname, rInc, wInc, markDelta]
    );

    const monthKey = getMonthKey();
    await pool.query(
      'INSERT INTO monthly_scores (month_key, user_id, username, right_count, wrong_count, net_marks) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (month_key, user_id) DO UPDATE SET username = $3, right_count = monthly_scores.right_count + $4, wrong_count = monthly_scores.wrong_count + $5, net_marks = monthly_scores.net_marks + $6',
      [monthKey, uid, uname, rInc, wInc, markDelta]
    );

    const solo = soloSessions.get(uid);
    if (solo && solo.active && solo.currentPollId === ans.poll_id) {
      if (isRight) solo.right++;
      else solo.wrong++;
      solo.currentPollId = undefined;
      if (solo.nextTimer) clearTimeout(solo.nextTimer);
      solo.nextTimer = setTimeout(() => sendNextSoloQuestion(uid), 2500);
    }
  } catch {}
});

const getSubjectForHour = (istHour: number): string => {
  const idx = istHour - 8;
  return (idx >= 0 && idx < SCHEDULE_15H.length) ? SCHEDULE_15H[idx] : SCHEDULE_15H[0];
};

const getNextISTHourSubject = (): string => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return getSubjectForHour((ist.getUTCHours() + 1) % 24);
};

const sendPreTestReminders = async (minsLeft: number) => {
  const nextSub = getNextISTHourSubject();
  const meta = await getTopicSummaryMeta(nextSub);
  const chs = await pool.query("SELECT * FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  const users = await pool.query('SELECT telegram_id, first_name FROM users WHERE alerts_enabled=TRUE AND is_banned=FALSE AND ($1 = ANY(preferred_subjects) OR $2 = TRUE)', [nextSub, nextSub.startsWith('MIXED')]).catch(() => ({ rows: [] }));
  const mentionList = users.rows.slice(0, 20).map(u => '[' + escMd(u.first_name || 'Student') + '](tg://user?id=' + u.telegram_id + ')').join(', ');

  for (const ch of chs.rows) {
    if (!isGroupAllowedToPost(ch).ok) continue;
    const cid = Number(ch.chat_id);
    if (minsLeft === 1) {
      await clearTempGroupMessages(cid);
      const instructionText =
        '🚨 *1 MIN LEFT — LIVE TEST INSTRUCTIONS* 🚨\n' +
        '• 📘 *Subject:* ' + nextSub + ' (50 Qs)\n' +
        '• 🎯 *Exams:* ' + (EXAM_TARGET_MAP[nextSub] || 'All Exams') + '\n' +
        '• 📌 *Topic:* ' + meta.currentTopic + '\n' +
        '• ⚖️ *Negative Marking:* 1/4 (-0.25 per wrong answer)\n' +
        '• 🔔 *Ready:* ' + (mentionList || 'सभी अभ्यर्थी तैयार रहें!');
      const sent = await safeSend(
        cid,
        instructionText,
        Markup.inlineKeyboard([[Markup.button.callback("🙋‍♂️ I'm Ready (0/3)", 'ready_quiz_' + cid), Markup.button.callback('👑 Admin Start', 'gstart_' + cid)]])
      );
      if (sent && 'message_id' in sent) {
        trackTempMessage(cid, sent.message_id);
        await bot.telegram.pinChatMessage(cid, sent.message_id, { disable_notification: false }).catch(() => {});
      }
    } else {
      const sent = await safeSend(
        cid,
        '⏰ *Test Alert (' + minsLeft + 'm Left):* *' + nextSub + '*\n• 📌 *Topic:* ' + meta.currentTopic + ' | ⚖️ -1/4 Negative\n🔔 ' + (mentionList || 'तैयार रहें!')
      );
      if (sent && 'message_id' in sent) trackTempMessage(cid, sent.message_id);
    }
    await sleep(300);
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
    startHourlySubjectTest(Number(c.chat_id), sub, 0, false);
    await sleep(350);
  }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('0 23 * * *', () => announceDailyClosingReport(), { timezone: 'Asia/Kolkata' });

const autoResumeOnServerBoot = async () => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hr = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  if (hr >= 8 && hr <= 22 && min >= 1 && min <= 48) {
    const sub = getSubjectForHour(hr);
    const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
    for (const c of chs.rows) {
      const cid = Number(c.chat_id);
      if (!activeTests.has(cid)) { startHourlySubjectTest(cid, sub, min, true); await sleep(350); }
    }
  }
};

// =========================================================
// PRO STUDENT FEATURES: REPORT CARD, MISTAKES & SOLO PRACTICE
// =========================================================
const renderStudentReport = async (ctx: any) => {
  const uid = ctx.from.id;
  const monthKey = getMonthKey();

  const [uRes, mRes, mistRes] = await Promise.all([
    pool.query('SELECT wallet_balance, referral_count, free_pdf_used, target_exam FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] })),
    pool.query('SELECT right_count, wrong_count, net_marks FROM monthly_scores WHERE month_key=$1 AND user_id=$2', [monthKey, uid]).catch(() => ({ rows: [] })),
    pool.query('SELECT COUNT(*) FROM user_mistakes WHERE user_id=$1', [uid]).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  const u = uRes.rows[0] || { wallet_balance: 0, referral_count: 0, free_pdf_used: false, target_exam: 'UPSC / UPPSC' };
  const m = mRes.rows[0] || { right_count: 0, wrong_count: 0, net_marks: 0 };
  const totalAttempt = Number(m.right_count) + Number(m.wrong_count);
  const acc = totalAttempt > 0 ? ((Number(m.right_count) / totalAttempt) * 100).toFixed(1) : '0.0';
  const mistakeCnt = Number(mistRes.rows[0]?.count || 0);

  const msg =
    '📊 *STUDENT PERFORMANCE REPORT CARD* 📊\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '👤 *अभ्यर्थी:* ' + escMd(ctx.from.first_name || 'Student') + '\n' +
    '🎯 *लक्ष्य परीक्षा:* ' + (u.target_exam || 'All Exams') + '\n' +
    '✅ *सही उत्तर (इस माह):* ' + m.right_count + ' | ❌ *गलत:* ' + m.wrong_count + '\n' +
    '🎯 *सटीकता (Accuracy):* *' + acc + '%*\n' +
    '🏆 *कुल नेट स्कोर:* *' + Number(m.net_marks || 0).toFixed(2) + ' Marks*\n' +
    '📓 *Mistake Notebook:* *' + mistakeCnt + ' सवाल रिवीजन हेतु बाकी*\n' +
    '🎁 *Free A4 PDF कोटा:* *' + (u.free_pdf_used ? 'Used (Next 10⭐)' : '1 Free Download Available 🟢') + '*\n' +
    '💰 *रेफ़रल वॉलेट:* ₹' + (u.wallet_balance || 0) + ' (' + (u.referral_count || 0) + ' Refers)';

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('📓 Practice My Mistakes (' + mistakeCnt + ')', 'u_mistakes'), Markup.button.callback('⚡ Solo Practice Quiz', 'u_practice')],
    [Markup.button.callback('📄 Download A4 Paper', 'u_pdf_menu'), Markup.button.callback('🔙 Main Menu', 'u_home')]
  ]);
  if (ctx.callbackQuery) return safeEdit(ctx, msg, kb);
  return safeSend(ctx.chat.id, msg, kb);
};

bot.command('myreport', (ctx) => renderStudentReport(ctx));
bot.action('u_report', (ctx) => renderStudentReport(ctx));

const triggerMistakeRevision = async (ctx: any) => {
  const uid = ctx.from.id;
  const qRes = await pool.query(
    'SELECT q.* FROM questions q INNER JOIN user_mistakes um ON q.id = um.question_id WHERE um.user_id = $1 ORDER BY um.wrong_at DESC LIMIT 10',
    [uid]
  ).catch(() => ({ rows: [] }));

  if (qRes.rows.length === 0) {
    const emptyMsg = '🎉 *शानदार! आपकी Mistake Notebook खाली है।*\nजब भी लाइव टेस्ट में आपका कोई सवाल गलत होगा, वह अपने आप यहाँ रिवीजन के लिए सेव हो जाएगा!';
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('No pending mistakes!');
      return safeEdit(ctx, emptyMsg, Markup.inlineKeyboard([[Markup.button.callback('⚡ Start Solo Practice', 'u_practice')], [Markup.button.callback('🔙 Main Menu', 'u_home')]]));
    }
    return safeSend(ctx.chat.id, emptyMsg);
  }

  if (ctx.callbackQuery) await ctx.answerCbQuery('Starting Interactive Mistake Revision...');
  return launchSoloSession(ctx, 'MISTAKES', qRes.rows, 'MISTAKES');
};

bot.command('mistakes', (ctx) => triggerMistakeRevision(ctx));
bot.action('u_mistakes', (ctx) => triggerMistakeRevision(ctx));

const renderSoloPracticeMenu = async (ctx: any) => {
  const kb: any[][] = [];
  for (let i = 0; i < CORE_SUBJECTS.length; i += 2) {
    const row = [Markup.button.callback('⚡ ' + CORE_SUBJECTS[i], 'solo_' + CORE_SUBJECTS[i])];
    if (CORE_SUBJECTS[i + 1]) row.push(Markup.button.callback('⚡ ' + CORE_SUBJECTS[i + 1], 'solo_' + CORE_SUBJECTS[i + 1]));
    kb.push(row);
  }
  kb.push([Markup.button.callback('🔥 MIXED FULL PRACTICE (10 Qs)', 'solo_MIXED TEST 1')]);
  kb.push([Markup.button.callback('🔙 Back to Main Menu', 'u_home')]);
  const txt = '⚡ *SOLO INTERACTIVE PRACTICE (1-by-1 TEST MODE)*\nकिसी भी विषय पर क्लिक करें—10 बेहतरीन सवाल एक-एक करके आएंगे और अंत में लाइव Scorecard मिलेगा:';
  if (ctx.callbackQuery) return safeEdit(ctx, txt, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, txt, Markup.inlineKeyboard(kb));
};

bot.command('practice', (ctx) => renderSoloPracticeMenu(ctx));
bot.action('u_practice', (ctx) => renderSoloPracticeMenu(ctx));

bot.action(/^solo_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  const isMixed = sub.startsWith('MIXED');
  await ctx.answerCbQuery('Preparing 10 Questions for ' + sub + '...');

  let qRes = await pool.query(
    'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject=$2) AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id=$3) ORDER BY RANDOM() LIMIT 10',
    [isMixed, sub, ctx.chat.id]
  ).catch(() => ({ rows: [] }));

  if (qRes.rows.length < 5) {
    qRes = await pool.query(
      'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject=$2) ORDER BY RANDOM() LIMIT 10',
      [isMixed, sub]
    ).catch(() => ({ rows: [] }));
  }

  if (qRes.rows.length === 0) {
    await safeSend(ctx.chat.id, `⏳ *${sub}* के नए सवाल Groq AI से तैयार किए जा रहे हैं, कृपया 10 सेकंड प्रतीक्षा करें...`);
    await generateQuestionsBatch(isMixed ? undefined : sub);
    qRes = await pool.query(
      'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject=$2) ORDER BY RANDOM() LIMIT 10',
      [isMixed, sub]
    ).catch(() => ({ rows: [] }));
  }

  if (qRes.rows.length === 0) {
    return safeSend(ctx.chat.id, `⚠️ अभी *${sub}* के प्रश्न लोड नहीं हो सके। कृपया कुछ देर बाद प्रयास करें या दूसरा विषय चुनें।`);
  }

  for (const q of qRes.rows) {
    pool.query('INSERT INTO asked_history(chat_id, question_id, asked_at) VALUES($1,$2,NOW()) ON CONFLICT DO NOTHING', [ctx.chat.id, q.id]).catch(() => {});
  }

  return launchSoloSession(ctx, sub, qRes.rows, 'SOLO');
});

// =========================================================
// USER INTERFACE & FREEMIUM PDF MENU
// =========================================================
const renderMainMenu = async (ctx: any) => {
  const botUser = ctx.botInfo?.username || '';
  const giftTag = await getCfg('gift_tagline');
  const adminPerms = 'post_messages+edit_messages+delete_messages+pin_messages+invite_users';
  const text =
    '🎓 *प्रोफेसर स्मार्ट लाइव टेस्ट सीरीज़ (V9.1 Pro)*\n' +
    '• ⏰ *Live Time:* 8:00 AM – 11:00 PM (15 Hours Daily)\n' +
    '• ⚡ *Smart Test Mode:* 1-by-1 Solo Quiz + Mistake Notebook + Report Card\n' +
    '• 🎁 *Freemium Offer:* 1st A4 PDF Paper *FREE* | Groups *30-Day FREE Trial*\n' +
    '• 💰 *Refer & Earn:* ₹5/Refer (Min Withdraw ₹99 via UPI)\n\n' + giftTag;

  const kb: any[][] = [
    [Markup.button.callback('⚡ Solo Practice (DM)', 'u_practice'), Markup.button.callback('📓 My Mistake Book', 'u_mistakes')],
    [Markup.button.callback('📊 My Report Card', 'u_report'), Markup.button.callback('📄 A4 Test Paper (1st FREE)', 'u_pdf_menu')],
    [Markup.button.callback('🎯 Exam & Subject Alerts', 'u_prefs'), Markup.button.callback('📅 15-Hour Schedule', 'u_sched')],
    [Markup.button.callback('🏆 Monthly Top 10', 'u_monthly'), Markup.button.callback('💰 Refer & Earn (₹5)', 'u_refer')],
    [Markup.button.callback('⚙️ My Groups (30d Free Trial)', 'u_groups')],
    [
      Markup.button.url('➕ Add to Group (30d Free)', 'https://t.me/' + botUser + '?startgroup=true&admin=' + adminPerms),
      Markup.button.url('📢 Add to Channel (30d Free)', 'https://t.me/' + botUser + '?startchannel=true&admin=' + adminPerms)
    ]
  ];
  if (isMaster(ctx.from?.id)) kb.push([Markup.button.callback('👑 MASTER ADMIN PANEL (ONLY FOR ME) 👑', 'adm_home')]);

  if (ctx.callbackQuery) return safeEdit(ctx, text, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, text, Markup.inlineKeyboard(kb));
};

const renderPdfSubjectMenu = async (ctx: any) => {
  const uid = ctx.from.id;
  const uRes = await pool.query('SELECT free_pdf_used FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] }));
  const freeAvailable = isMaster(uid) || !Boolean(uRes.rows[0]?.free_pdf_used);

  const coreSubs = SCHEDULE_15H.slice(0, 14);
  const kb: any[][] = [];
  for (let i = 0; i < coreSubs.length; i += 2) {
    const tag = freeAvailable ? '🆓 ' : '📄 ';
    const row = [Markup.button.callback(tag + coreSubs[i], 'buy_pdf_' + coreSubs[i])];
    if (coreSubs[i + 1]) row.push(Markup.button.callback(tag + coreSubs[i + 1], 'buy_pdf_' + coreSubs[i + 1]));
    kb.push(row);
  }
  kb.push([Markup.button.callback('🔙 Back to Main Menu', 'u_home')]);

  const msg =
    '📄 *A4 PRINTABLE OFFLINE QUESTION PAPER MODEL*\n' +
    '• 50 प्रश्नों का 2-Column A4 पेपर + *OMR Sheet* + *Answer Key*\n' +
    '• 🎁 *आपका स्टेटस:* ' + (freeAvailable ? '*1st Download 100% FREE 🟢*' : '*Free Quota Used (10 Telegram Stars ⭐)*') + '\n\n' +
    '👇 *जिस विषय का A4 मॉडल पेपर चाहिए उसे चुनें:*';

  if (ctx.callbackQuery) return safeEdit(ctx, msg, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, msg, Markup.inlineKeyboard(kb));
};

bot.command('pdf', (ctx) => renderPdfSubjectMenu(ctx));
bot.action('u_pdf_menu', (ctx) => renderPdfSubjectMenu(ctx));

bot.action(/^buy_pdf_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  const uid = ctx.from.id;
  const destChat = ctx.chat?.id || uid;

  if (isMaster(uid)) {
    await ctx.answerCbQuery('Admin Free Access: Generating A4 Paper...');
    return deliverOfflineTestPaper(destChat, sub, false, false);
  }

  const uRes = await pool.query('SELECT free_pdf_used FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] }));
  const alreadyUsed = Boolean(uRes.rows[0]?.free_pdf_used);

  if (!alreadyUsed) {
    await pool.query('UPDATE users SET free_pdf_used = TRUE WHERE telegram_id=$1', [uid]).catch(() => {});
    await ctx.answerCbQuery('🎁 Unlocking Your 1st FREE A4 Model Paper!');
    return deliverOfflineTestPaper(destChat, sub, false, true);
  }

  await ctx.answerCbQuery('Sending 10 Stars Invoice (1st Free Quota Used)...');
  return sendPdfStarsInvoice(destChat, sub);
});

bot.start(async (ctx) => {
  const uid = ctx.from.id;
  const payload = ctx.startPayload || '';
  let refBy: number | null = null;
  if (payload.startsWith('ref_')) {
    const parsed = Number(payload.replace('ref_', ''));
    if (!isNaN(parsed) && parsed !== uid) refBy = parsed;
  }
  await pool.query(
    'INSERT INTO users(telegram_id, username, first_name, referred_by, ref_credited) VALUES($1,$2,$3,$4,FALSE) ON CONFLICT(telegram_id) DO UPDATE SET username=$2, first_name=$3',
    [uid, ctx.from.username || 'student', ctx.from.first_name || 'Student', refBy]
  ).catch(() => {});

  const fsub = await checkTwoFSub(uid);
  if (!fsub.ok) {
    const btns: any[][] = fsub.missing.map(m => [Markup.button.url(m.title, m.link)]);
    btns.push([Markup.button.callback('✅ मैंने जॉइन कर लिया (Verify & Start)', 'verify_fsub')]);
    return safeSend(ctx.chat.id, '🔒 *अनिवार्य सूचना:*\nप्रोफेसर बॉट के सभी फीचर्स और 1st Free A4 PDF अनलॉक करने के लिए कृपया नीचे दिए गए दोनों ऑफिशियल ग्रुप और चैनल को जॉइन करें:', Markup.inlineKeyboard(btns));
  }
  await creditReferralIfEligible(uid);
  return renderMainMenu(ctx);
});

bot.action('verify_fsub', async (ctx) => {
  const fsub = await checkTwoFSub(ctx.from.id);
  if (!fsub.ok) return ctx.answerCbQuery('❌ कृपया पहले दोनों चैनल/ग्रुप जॉइन करें!', { show_alert: true });
  await creditReferralIfEligible(ctx.from.id);
  await ctx.answerCbQuery('✅ सत्यापन सफल!', { show_alert: true });
  return renderMainMenu(ctx);
});

bot.action('u_home', (ctx) => renderMainMenu(ctx));

const renderReferPanel = async (ctx: any) => {
  const uid = ctx.from.id;
  const botUser = ctx.botInfo?.username || '';
  const r = await pool.query('SELECT wallet_balance, referral_count, last_cleared_at FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] }));
  const u = r.rows[0] || { wallet_balance: 0, referral_count: 0, last_cleared_at: null };
  const refLink = 'https://t.me/' + botUser + '?start=ref_' + uid;

  const msg =
    '💰 *PROFESSOR REFER & EARN* 💰\n' +
    '• 🎁 *Reward:* ₹5/Refer | 🏦 *Min Withdraw:* ₹99 (UPI)\n' +
    '• 👥 *Current Referrals:* ' + (u.referral_count || 0) + ' | 💳 *Balance:* ₹' + (u.wallet_balance || 0) + '\n' +
    (u.last_cleared_at ? '• 🧹 *Last Paid & Reset:* ' + u.last_cleared_at + '\n' : '') +
    '\n🔗 *Your Link:* ' + refLink;

  const kb: any[][] = [
    [Markup.button.url('📲 Share Link on Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(refLink) + '&text=' + encodeURIComponent('🎓 रोज़ 15 घंटे फ्री लाइव टेस्ट दें, 1 Free A4 PDF पाएं और ₹100 Gift Card जीतें:'))],
    [Markup.button.callback('💸 Withdraw ₹99+ (Submit UPI)', 'u_withdraw')],
    [Markup.button.callback('🔙 Back', 'u_home')]
  ];
  if (ctx.callbackQuery) return safeEdit(ctx, msg, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, msg, Markup.inlineKeyboard(kb));
};

bot.command('refer', (ctx) => renderReferPanel(ctx));
bot.action('u_refer', (ctx) => renderReferPanel(ctx));

bot.action('u_withdraw', async (ctx) => {
  const uid = ctx.from.id;
  const r = await pool.query('SELECT wallet_balance FROM users WHERE telegram_id=$1', [uid]).catch(() => ({ rows: [] }));
  const bal = Number(r.rows[0]?.wallet_balance || 0);
  if (bal < 99) return ctx.answerCbQuery('❌ न्यूनतम निकासी ₹99 है! अभी आपका बैलेंस ₹' + bal + ' है।', { show_alert: true });
  userStates.set(uid, { action: 'SUBMIT_UPI' });
  await ctx.answerCbQuery();
  return safeSend(ctx.chat.id, '🏦 *UPI Withdrawal (₹' + bal + '):* अपनी सही UPI ID और नाम लिखकर भेजें (/cancel रद्द करने के लिए):');
});

const renderScheduleView = async (ctx: any) => {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const currentHr = ist.getUTCHours();
  const currentSub = getSubjectForHour(currentHr);
  let msg = '📅 *15-HOUR SCHEDULE (8 AM - 11 PM)*\n🟢 *Live Now:* *' + ((currentHr >= 8 && currentHr <= 22) ? currentSub : 'Closed (Opens 8 AM)') + '*\n━━━━━━━━━━━━━━━━━━━━━\n';
  SCHEDULE_15H.forEach((s, idx) => {
    const hr = 8 + idx;
    const label = (hr > 12 ? (hr - 12) + ':00 PM' : (hr === 12 ? '12:00 PM' : '0' + hr + ':00 AM')) + ' ➔ ' + s;
    msg += (hr === currentHr ? '👉 *' + label + ' (LIVE)*\n' : '• ' + label + '\n');
  });
  msg += '• 11:00 PM ➔ Daily Closing Report & Pin';
  const kb = Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'u_home')]]);
  if (ctx.callbackQuery) return safeEdit(ctx, msg, kb);
  return safeSend(ctx.chat.id, msg, kb);
};

bot.action('u_sched', (ctx) => renderScheduleView(ctx));
bot.command('schedule', (ctx) => renderScheduleView(ctx));

const renderMonthlyTopperList = async (ctx: any) => {
  const monthKey = getMonthKey();
  const top = await pool.query('SELECT user_id, username, right_count, wrong_count, net_marks FROM monthly_scores WHERE month_key=$1 ORDER BY net_marks DESC LIMIT 10', [monthKey]).catch(() => ({ rows: [] }));
  let msg = '🏆 *MONTHLY TOP 10 (' + monthKey + ')* 🏆\n🎁 *1 Nov ₹100 Gift Card Leaderboard:*\n━━━━━━━━━━━━━━━━━━━━━\n\n';
  if (top.rows.length === 0) msg += 'अभी स्कोरबोर्ड खाली है।\n';
  else top.rows.forEach((r, i) => { msg += (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖' + (i + 1) + '.') + ' [' + escMd(r.username) + '](tg://user?id=' + r.user_id + ') ➔ *' + Number(r.net_marks).toFixed(2) + ' Pts* (✅' + r.right_count + ' ❌' + r.wrong_count + ')\n'; });
  const kb = Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'u_home')]]);
  if (ctx.callbackQuery) return safeEdit(ctx, msg, kb);
  return safeSend(ctx.chat.id, msg, kb);
};

bot.action('u_monthly', (ctx) => renderMonthlyTopperList(ctx));
bot.command('monthlytop', (ctx) => renderMonthlyTopperList(ctx));

const renderPrefs = async (ctx: any) => {
  const r = await pool.query('SELECT target_exam, preferred_subjects, alerts_enabled FROM users WHERE telegram_id=$1', [ctx.from.id]).catch(() => ({ rows: [] }));
  const u = r.rows[0] || { target_exam: EXAMS[0], preferred_subjects: [], alerts_enabled: true };
  const subs: string[] = u.preferred_subjects || [];
  const kb: any[][] = [
    EXAMS.slice(0, 2).map(e => Markup.button.callback((u.target_exam === e ? '✅ ' : '') + e, 'setex_' + e)),
    EXAMS.slice(2, 4).map(e => Markup.button.callback((u.target_exam === e ? '✅ ' : '') + e, 'setex_' + e))
  ];
  for (let i = 0; i < CORE_SUBJECTS.length; i += 2) {
    const row = [Markup.button.callback((subs.includes(CORE_SUBJECTS[i]) ? '✅ ' : '⬜ ') + CORE_SUBJECTS[i], 'setsub_' + CORE_SUBJECTS[i])];
    if (CORE_SUBJECTS[i + 1]) row.push(Markup.button.callback((subs.includes(CORE_SUBJECTS[i + 1]) ? '✅ ' : '⬜ ') + CORE_SUBJECTS[i + 1], 'setsub_' + CORE_SUBJECTS[i + 1]));
    kb.push(row);
  }
  kb.push([Markup.button.callback('🔔 Mention Alerts: ' + (u.alerts_enabled ? 'ON ✅' : 'OFF 🔕'), 'tog_alert')]);
  kb.push([Markup.button.callback('💾 Save & Back', 'u_home')]);
  return safeEdit(ctx, '🎯 *अपनी परीक्षा और विषय चुनें:*', Markup.inlineKeyboard(kb));
};

bot.action('u_prefs', (ctx) => renderPrefs(ctx));
bot.action(/^setex_(.+)$/, async (ctx) => { await pool.query('UPDATE users SET target_exam=$1 WHERE telegram_id=$2', [ctx.match[1], ctx.from.id]); return renderPrefs(ctx); });
bot.action(/^setsub_(.+)$/, async (ctx) => {
  const s = ctx.match[1];
  const r = await pool.query('SELECT preferred_subjects FROM users WHERE telegram_id=$1', [ctx.from.id]);
  let arr: string[] = r.rows[0]?.preferred_subjects || [];
  arr = arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s];
  await pool.query('UPDATE users SET preferred_subjects=$1 WHERE telegram_id=$2', [arr, ctx.from.id]);
  return renderPrefs(ctx);
});
bot.action('tog_alert', async (ctx) => { await pool.query('UPDATE users SET alerts_enabled = NOT alerts_enabled WHERE telegram_id=$1', [ctx.from.id]); return renderPrefs(ctx); });

// =========================================================
// GROUP MANAGEMENT (AUTO 30-DAY FREE TRIAL ON ADD)
// =========================================================
bot.on('my_chat_member', async (ctx) => {
  try {
    const st = ctx.myChatMember.new_chat_member.status;
    const chat: any = ctx.myChatMember.chat;
    const adder = ctx.myChatMember.from;
    if (['group', 'supergroup', 'channel'].includes(chat.type) && ['administrator', 'member'].includes(st)) {
      const chatTitle = chat.title || 'Educational Chat';
      await pool.query(
        "INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status, trial_ends_at) VALUES($1,$2,$3,$4,TRUE,'APPROVED', NOW() + INTERVAL '30 days') ON CONFLICT(chat_id) DO UPDATE SET title=$2, chat_type=$3, is_active=TRUE",
        [chat.id, chatTitle, chat.type, adder.id]
      );
      await safeSend(
        chat.id,
        '🎓 *Professor AI Quiz Bot अब "' + escMd(chatTitle) + '" से जुड़ चुका है!*\n' +
        '🎁 *30-Day Free Trial Activated!* (पसंद आने पर 30 दिन बाद 100 Stars/Year से रिन्यू करें)',
        Markup.inlineKeyboard([
          [Markup.button.callback('🙋‍♂️ Ready for Quiz (0/3)', 'ready_quiz_' + chat.id), Markup.button.callback('▶️ Start Live Quiz', 'gstart_' + chat.id)],
          [Markup.button.callback('🛑 Stop Quiz (Admin)', 'pause_test_' + chat.id)]
        ])
      );
      if (ADMIN_ID && !isMaster(adder.id)) {
        await safeSend(
          ADMIN_ID,
          '🔔 *New Group Added (30d Free Trial Active)!*\n📌 *' + escMd(chatTitle) + '* (' + chat.id + ')\n👤 By: ' + escMd(adder.first_name || 'User') + ' (' + adder.id + ')',
          Markup.inlineKeyboard([
            [Markup.button.callback('⭐ Grant 1 Yr Free', 'adm_yr_' + chat.id), Markup.button.callback('🚫 Block Group', 'adm_rej_' + chat.id)]
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
  await ctx.answerCbQuery('Approved 30d Trial!', { show_alert: true });
  await safeSend(cid, '🎉 *मास्टर एडमिन ने आपके ग्रुप/चैनल का 30 दिनों का फ्री ट्रायल एक्टिवेट कर दिया है!*');
});

bot.action(/^adm_yr_(-?\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const cid = Number(ctx.match[1]);
  await pool.query("UPDATE channels SET approval_status='APPROVED', sub_ends_at = NOW() + INTERVAL '365 days', is_active=TRUE WHERE chat_id=$1", [cid]);
  await ctx.answerCbQuery('Granted 1 Year!', { show_alert: true });
  await safeSend(cid, '🎉 *मास्टर एडमिन ने आपके ग्रुप/चैनल को 1 साल के लिए एक्टिवेट कर दिया है!*');
});

bot.action(/^adm_rej_(-?\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const cid = Number(ctx.match[1]);
  await stopTestInGroup(cid, false);
  await pool.query("UPDATE channels SET approval_status='REJECTED', is_active=FALSE WHERE chat_id=$1", [cid]);
  await ctx.answerCbQuery('Blocked!', { show_alert: true });
});

bot.command('setupgroup', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('यह कमांड अपने ग्रुप या चैनल के अंदर लिखें।');
  const gChat: any = ctx.chat;
  const gTitle = gChat.title || 'Group';
  await pool.query(
    "INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status, trial_ends_at) VALUES($1,$2,$3,$4,TRUE,'APPROVED', NOW() + INTERVAL '30 days') ON CONFLICT(chat_id) DO UPDATE SET title=$2, owner_id=$4, is_active=TRUE",
    [ctx.chat.id, gTitle, ctx.chat.type, ctx.from.id]
  );
  return safeSend(
    ctx.chat.id,
    '✅ *"' + escMd(gTitle) + '" रजिस्टर हो गया है (30-Day Free Trial Active)!*',
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋‍♂️ Ready for Quiz (0/3)', 'ready_quiz_' + ctx.chat.id), Markup.button.callback('▶️ Start Test Now', 'gstart_' + ctx.chat.id)],
      [Markup.button.callback('🛑 Stop Test (Admin)', 'pause_test_' + ctx.chat.id)]
    ])
  );
});

bot.action('u_groups', async (ctx) => {
  const r = isMaster(ctx.from.id)
    ? await pool.query('SELECT * FROM channels ORDER BY title LIMIT 30').catch(() => ({ rows: [] }))
    : await pool.query('SELECT * FROM channels WHERE owner_id=$1', [ctx.from.id]).catch(() => ({ rows: [] }));
  if (r.rows.length === 0) {
    return safeEdit(
      ctx,
      '📢 कोई ग्रुप/चैनल अभी रजिस्टर नहीं है। बॉट को अपने ग्रुप में Admin बनाएं (30 दिन फ्री ट्रायल तुरंत चालू हो जाएगा) या नीचे से लिंक करें:',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Link Group / Channel', 'adm_add_grp')],
        [Markup.button.callback('🔙 Back', 'u_home')]
      ])
    );
  }
  const kb: any[][] = r.rows.map(g => {
    const p = isGroupAllowedToPost(g);
    return [Markup.button.callback((g.is_active ? '🟢 ' : '🔴 ') + g.title + ' (' + p.daysLeft + 'd left)', 'gpanel_' + g.chat_id)];
  });
  if (isMaster(ctx.from.id)) kb.push([Markup.button.callback('➕ Link Another Group/Channel', 'adm_add_grp')]);
  kb.push([Markup.button.callback('🔙 Back', 'u_home')]);
  return safeEdit(ctx, '⚙️ *ग्रुप / चैनल चुनें (30-Day Free Trial + Pro Status):*', Markup.inlineKeyboard(kb));
});

const renderGroupPanel = async (ctx: any, chatId: number) => {
  const r = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]).catch(() => ({ rows: [] }));
  if (r.rows.length === 0) return;
  const g = r.rows[0];
  const perm = isGroupAllowedToPost(g);

  const txt =
    '⚙️ *Group Panel: ' + escMd(g.title) + '*\n• 🆔 ID: ' + g.chat_id + ' | 👤 Owner: ' + (g.owner_id || 'N/A') + '\n' +
    '• 📡 Schedule: *' + (g.is_active ? 'ON 🟢' : 'OFF 🔴') + '*\n' +
    '• 🎁 Plan Status: *' + (perm.ok ? perm.reason + ' (' + perm.daysLeft + ' Days Left) ✅' : 'TRIAL EXPIRED ❌') + '*\n' +
    '• ✍️ Header: *' + (g.custom_caption || 'Default') + '*';

  const kb: any[][] = [
    [Markup.button.callback('▶️ Start Test Now', 'gstart_' + chatId), Markup.button.callback('🛑 Stop Test', 'pause_test_' + chatId)],
    [Markup.button.callback(g.is_active ? '🔕 Schedule OFF' : '🔔 Schedule ON', 'gtog_' + chatId), Markup.button.callback('✍️ Custom Header', 'gcap_' + chatId)],
    [Markup.button.callback('⭐ Upgrade 1 Year Pro (100 Stars)', 'gpay_' + chatId)]
  ];
  if (isMaster(ctx.from.id)) {
    kb.push([Markup.button.callback('✅ +30d Trial', 'adm_app_' + chatId), Markup.button.callback('⭐ +1 Yr Free', 'adm_yr_' + chatId), Markup.button.callback('🚫 Block', 'adm_rej_' + chatId)]);
  }
  kb.push([Markup.button.callback('🔙 Back', 'u_groups')]);
  return safeEdit(ctx, txt, Markup.inlineKeyboard(kb));
};

bot.action(/^gpanel_(-?\d+)$/, (ctx) => renderGroupPanel(ctx, Number(ctx.match[1])));
bot.action(/^gtog_(-?\d+)$/, async (ctx) => { const cid = Number(ctx.match[1]); await pool.query('UPDATE channels SET is_active = NOT is_active WHERE chat_id=$1', [cid]); return renderGroupPanel(ctx, cid); });
bot.action(/^gcap_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  userStates.set(ctx.from.id, { action: 'SET_GRP_CAP', targetId: cid });
  await ctx.answerCbQuery();
  return safeSend(ctx.chat.id, '✍️ *कस्टम लाइन लिखें (/cancel रद्द करने के लिए):*');
});
bot.action(/^gpay_(-?\d+)$/, async (ctx) => { const cid = Number(ctx.match[1]); await ctx.answerCbQuery('Sending 100 Stars Invoice...'); return sendGroupStarsInvoice(ctx.chat?.id || ctx.from.id, cid); });

bot.action(/^gstart_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());

  if (await isGroupAdminOrMaster(ctx, cid, ctx.from.id)) {
    await ctx.answerCbQuery('👑 Admin Instant Start: ' + sub + ' Test शुरू हो रहा है!');
    return startHourlySubjectTest(cid, sub, 0, true);
  }
  await ctx.answerCbQuery('Joining 3-Player Ready Lobby...');
  return openThreePlayerLobby(cid, sub);
});

bot.action(/^pause_test_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  const allowed = await isGroupAdminOrMaster(ctx, cid, ctx.from.id);
  if (!allowed) {
    return ctx.answerCbQuery('⚠️ केवल ग्रुप एडमिन या मास्टर एडमिन ही लाइव टेस्ट रोक सकते हैं!', { show_alert: true });
  }
  await stopTestInGroup(cid, true);
  await ctx.answerCbQuery('⏸ Test Paused by Admin!');
});

// =========================================================
// MASTER ADMIN PANEL (GROQ-ONLY KEYS, SUBJECT STATS & SEEDER)
// =========================================================
const renderAdmin = async (ctx: any) => {
  if (!isMaster(ctx.from?.id)) return ctx.reply('🔒 केवल बॉट मालिक के लिए। (ID: ' + ctx.from?.id + ')');

  let uCnt = 0, gCnt = 0, qCnt = 0;
  try {
    const [uRes, gRes, qRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM channels WHERE is_active=TRUE'),
      pool.query('SELECT COUNT(*) FROM questions')
    ]);
    uCnt = Number(uRes.rows[0]?.count || 0);
    gCnt = Number(gRes.rows[0]?.count || 0);
    qCnt = Number(qRes.rows[0]?.count || 0);
    dbStatusText = '🟢 PostgreSQL Connected & Active';
  } catch (e: any) {
    dbStatusText = '🔴 DB Error: ' + escMd(String(e?.message || '')).substring(0, 40);
  }

  const fsubOn = await getCfg('fsub_enabled');
  const minCheckOn = (await getCfg('min_participants_enabled')) !== 'false';
  const facOn = await getCfg('factory_on');
  const groqKeys = await collectGroqKeys();

  const txt =
    '👑 *PROFESSOR MASTER ADMIN PANEL (V9.1 Pro)* 👑\n' +
    '• 🗄 *Database:* ' + dbStatusText + '\n' +
    '• ⚡ *Groq Engine:* ' + groqKeys.length + ' Active Key(s) | GPT-OSS-20B / 120B / Llama-3.3\n' +
    '• 👥 *Users:* *' + uCnt + '* | 📢 *Active Groups:* *' + gCnt + '*\n' +
    '• 📚 *Unique Question Bank:* *' + qCnt + '* (Today: +' + todaySeededCount + ')\n' +
    '• 📡 *Seeder Status:* ' + escMd(lastSeedReport) + '\n' +
    '• 👥 *3-User Ready Lobby:* *' + (minCheckOn ? 'ON 🟢' : 'OFF 🔴') + '*\n' +
    '• 🔐 *2-Channel Force Sub:* *' + (fsubOn === 'true' ? 'ON 🟢' : 'OFF 🔴') + '*';

  const kb: any[][] = [
    [Markup.button.callback('🔑 Add Groq Keys', 'adm_set_keys'), Markup.button.callback('⚡ Seed +10 Qs', 'adm_gen10'), Markup.button.callback('🚀 Turbo +30 Qs', 'adm_gen30')],
    [Markup.button.callback('📊 Subject Bank Stats', 'adm_sub_stats'), Markup.button.callback('🔄 Sync DB & Reset Cooldown', 'adm_chk_db')],
    [Markup.button.callback(minCheckOn ? '🔴 3-User Lobby: OFF' : '🟢 3-User Lobby: ON', 'adm_tog_min'), Markup.button.callback('➕ Link Group/Channel', 'adm_add_grp')],
    [Markup.button.callback('📌 Pin Custom Message in Groups', 'adm_bcpin'), Markup.button.callback('📢 Normal Broadcast', 'adm_bc')],
    [Markup.button.callback('🌙 Post Daily Close Report Now', 'adm_daily_rep'), Markup.button.callback('🎁 Edit ₹100 Gift Tagline', 'adm_gift')],
    [Markup.button.callback('🔐 Set FSub 1', 'adm_fsub1'), Markup.button.callback('💬 Set FSub 2', 'adm_fsub2'), Markup.button.callback('💌 Msg Winner', 'adm_msg_win')],
    [Markup.button.callback(fsubOn === 'true' ? '🔴 FSub OFF' : '🟢 FSub ON', 'adm_tog_fsub'), Markup.button.callback(facOn === 'true' ? '⏸ Pause Seeder' : '▶️ Resume Seeder', 'adm_tog_fac')],
    [Markup.button.callback('🚀 Instant Start All Groups', 'adm_start_all'), Markup.button.callback('🛑 Stop All Tests', 'adm_stop_all')],
    [Markup.button.callback('⚙️ Manage Groups (' + gCnt + ')', 'u_groups'), Markup.button.callback('🔙 User Menu', 'u_home')]
  ];
  if (ctx.callbackQuery) return safeEdit(ctx, txt, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, txt, Markup.inlineKeyboard(kb));
};

bot.command('admin', (ctx) => renderAdmin(ctx));
bot.action('adm_home', (ctx) => renderAdmin(ctx));

bot.action('adm_sub_stats', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const res = await pool.query('SELECT subject, COUNT(*) as c FROM questions GROUP BY subject ORDER BY c DESC').catch(() => ({ rows: [] }));
  const map: Record<string, number> = {};
  res.rows.forEach((r: any) => { map[r.subject] = Number(r.c); });

  let msg = '📊 *SUBJECT-WISE QUESTION BANK STATS*\n━━━━━━━━━━━━━━━━━━━━━\n';
  let total = 0;
  const kb: any[][] = [];
  for (let i = 0; i < CORE_SUBJECTS.length; i++) {
    const s = CORE_SUBJECTS[i];
    const cnt = map[s] || 0;
    total += cnt;
    msg += `• *${s}:* ${cnt} Qs\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n📚 *Total Questions:* *${total}*\n👇 *किसी विषय में तुरंत +10 सवाल जोड़ने के लिए क्लिक करें:*`;

  for (let i = 0; i < CORE_SUBJECTS.length; i += 2) {
    const row = [Markup.button.callback(`➕ ${CORE_SUBJECTS[i]}`, `adm_seedsub_${CORE_SUBJECTS[i]}`)];
    if (CORE_SUBJECTS[i + 1]) row.push(Markup.button.callback(`➕ ${CORE_SUBJECTS[i + 1]}`, `adm_seedsub_${CORE_SUBJECTS[i + 1]}`));
    kb.push(row);
  }
  kb.push([Markup.button.callback('🔙 Back to Admin', 'adm_home')]);
  return safeEdit(ctx, msg, Markup.inlineKeyboard(kb));
});

bot.action(/^adm_seedsub_(.+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const sub = ctx.match[1];
  await ctx.answerCbQuery(`Seeding +10 Qs for ${sub}...`);
  const r = await generateQuestionsBatch(sub);
  await safeSend(ctx.chat.id, r.ok ? `✅ *${r.provider}* से *${r.sub} (${r.topic})* के *+${r.count}* नए प्रश्न सेव हो गए!` : `ℹ️ ${escMd(r.error || 'No new Qs')}`);
  return renderAdmin(ctx);
});

bot.action('adm_set_keys', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADD_AI_KEYS' });
  await ctx.answerCbQuery();
  return safeSend(
    ctx.chat.id,
    '🔑 *Groq Multi-Key Booster:*\nआप यहाँ अतिरिक्त **Groq API Keys (`gsk_...`)** कॉमा (`,`) या नई लाइन में भेज सकते हैं।\n\n' +
    '💡 *फायदा:* सारी Keys डेटाबेस में सेव हो जाएंगी और बॉट `openai/gpt-oss-20b`, `llama-3.3-70b`, `gpt-oss-120b` के साथ सभी Keys को रोटेट करके रोज़ हज़ारों प्रश्न सेव करेगा!\n*(रद्द करने के लिए /cancel लिखें)*'
  );
});

bot.action('adm_chk_db', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  await ctx.answerCbQuery('Syncing DB Sequence & Resetting Groq Cooldowns...');
  const ok = await initDB();
  await runDatabaseAutoCleaner();
  modelCooldownUntil.clear();
  cachedGroqModels = null;
  await safeSend(ctx.chat.id, ok ? '✅ *PostgreSQL कनेक्टेड है, ID Sequence सिंक हो गई है, और सभी Groq मॉडल कूलडाउन रीसेट कर दिए गए हैं!*' : '❌ *डेटाबेस एरर:* ' + dbStatusText);
  return renderAdmin(ctx);
});

bot.action('adm_add_grp', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action: 'ADD_GRP' });
  await ctx.answerCbQuery();
  return safeSend(
    ctx.chat.id,
    '📢 *ग्रुप या चैनल को PostgreSQL में जोड़ने के लिए:*\nउसका `@username` भेजें या वहां से कोई मैसेज यहां Forward करें:'
  );
});

bot.action('adm_tog_min', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const curr = (await getCfg('min_participants_enabled')) !== 'false';
  await setCfg('min_participants_enabled', curr ? 'false' : 'true');
  return renderAdmin(ctx);
});

bot.action('adm_daily_rep', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  await ctx.answerCbQuery('Posting & Pinning Daily Closing Report...');
  await announceDailyClosingReport();
  return renderAdmin(ctx);
});

bot.action('adm_tog_fsub', async (ctx) => { if (!isMaster(ctx.from.id)) return; const c = await getCfg('fsub_enabled'); await setCfg('fsub_enabled', c === 'true' ? 'false' : 'true'); return renderAdmin(ctx); });
bot.action('adm_tog_fac', async (ctx) => { if (!isMaster(ctx.from.id)) return; const c = await getCfg('factory_on'); await setCfg('factory_on', c === 'true' ? 'false' : 'true'); return renderAdmin(ctx); });

bot.action('adm_gen10', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  await ctx.answerCbQuery('Seeding 10 Unique Questions via Groq...');
  const r = await generateQuestionsBatch();
  await safeSend(ctx.chat.id, r.ok ? '✅ *' + r.provider + '* से *' + r.sub + ' (' + r.topic + ')* के *+' + r.count + '* नए प्रश्न डेटाबेस में सेव हो गए!' : 'ℹ️ ' + escMd(r.error || 'No new Qs'));
  return renderAdmin(ctx);
});

bot.action('adm_gen30', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  await ctx.answerCbQuery('Turbo Seeding +30 Unique Questions...');
  await safeSend(ctx.chat.id, '🚀 *Groq Turbo Seeder चालू:* 3 अलग-अलग मॉडल्स/विषयों से +30 यूनिक सवाल जोड़े जा रहे हैं...');
  (async () => {
    let totalAdded = 0;
    const notes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await generateQuestionsBatch();
      if (r.ok) {
        totalAdded += r.count;
        notes.push(`✅ ${r.sub}: +${r.count} (${r.provider})`);
      } else {
        notes.push(`⚠️ Batch ${i + 1}: ${escMd(r.error || 'Failed')}`);
      }
      await sleep(1500);
    }
    await safeSend(ctx.chat.id, '🎉 *Turbo Seed Complete:* कुल *+' + totalAdded + '* नए प्रश्न जुड़ गए!\n' + notes.join('\n'));
  })();
  return renderAdmin(ctx);
});

bot.action('adm_start_all', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  if (chs.rows.length === 0) {
    return ctx.answerCbQuery('⚠️ कोई ग्रुप लिंक नहीं है! पहले "➕ Link Group/Channel" दबाकर ग्रुप जोड़ें।', { show_alert: true });
  }
  for (const c of chs.rows) { startHourlySubjectTest(Number(c.chat_id), sub, 0, true); await sleep(350); }
  await ctx.answerCbQuery('🚀 Instant Started ' + sub + ' in ' + chs.rows.length + ' groups!', { show_alert: true });
});

bot.action('adm_stop_all', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  for (const cid of Array.from(activeTests.keys())) await stopTestInGroup(cid, true);
  await ctx.answerCbQuery('All tests paused!', { show_alert: true });
});

bot.action(/^pay_ok_(\d+)$/, async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const targetUid = Number(ctx.match[1]);
  const clearDate = new Date(Date.now() + 5.5 * 3600 * 1000).toLocaleDateString('hi-IN');
  await pool.query('UPDATE users SET wallet_balance = 0, referral_count = 0, last_cleared_at = $1 WHERE telegram_id = $2', [clearDate, targetUid]);
  await pool.query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [targetUid]).catch(() => {});
  await ctx.answerCbQuery('Marked Paid & Reset!', { show_alert: true });
  await safeSend(targetUid, '✅ *भुगतान सफल एवं रेफ़रल काउंटर रीसेट!*');
  await safeEdit(ctx, '✅ *User ' + targetUid + ' का पेमेंट क्लियर और काउंटर रीसेट कर दिया गया (' + clearDate + ')!*');
});

const promptAdminInput = async (ctx: any, action: string, promptText: string) => {
  if (!isMaster(ctx.from.id)) return;
  userStates.set(ctx.from.id, { action });
  await safeSend(ctx.chat.id, promptText + '\n*(रद्द करने के लिए /cancel लिखें)*');
};

bot.action('adm_bc', (ctx) => promptAdminInput(ctx, 'BC_NORM', '📢 *Broadcast मैसेज भेजें:*'));
bot.action('adm_bcpin', (ctx) => promptAdminInput(ctx, 'BC_PIN', '📌 *Pin & Broadcast मैसेज भेजें (सभी ग्रुप्स में पिन होगा और यूज़र्स को दिखेगा):*'));
bot.action('adm_gift', (ctx) => promptAdminInput(ctx, 'SET_GIFT', '🎁 *Gift Tagline लिखें:*'));
bot.action('adm_fsub1', (ctx) => promptAdminInput(ctx, 'SET_FSUB1', '🔐 *FSub 1:* पोस्ट Forward करें या @username लिखें:'));
bot.action('adm_fsub2', (ctx) => promptAdminInput(ctx, 'SET_FSUB2', '💬 *FSub 2:* पोस्ट Forward करें या @username लिखें:'));
bot.action('adm_msg_win', (ctx) => promptAdminInput(ctx, 'MSG_WINNER', '💌 *User/Winner को मैसेज भेजें (Format: USER_ID | Message):*'));

bot.command('cancel', (ctx) => { userStates.delete(ctx.from.id); ctx.reply('✅ रद्द किया गया।'); });

bot.on('message', async (ctx) => {
  const st = userStates.get(ctx.from.id);
  if (!st) return;

  if (st.action === 'PDF_COMPLAINT' && 'text' in ctx.message) {
    userStates.delete(ctx.from.id);
    const issue = ctx.message.text.trim();
    const sub = st.meta || 'HISTORY';
    if (ADMIN_ID) {
      await safeSend(
        ADMIN_ID,
        '⚠️ *PDF COMPLAINT RECEIVED*\n👤 User: ' + escMd(ctx.from.first_name || 'Student') + ' (ID: ' + ctx.from.id + ')\n📘 Subject: ' + sub + '\n💬 Issue: ' + issue,
        Markup.inlineKeyboard([[Markup.button.callback('📝 Send Editable Text (.txt) to User', 'adm_sendtxt_' + ctx.from.id + '_' + sub)]])
      );
    }
    return safeSend(ctx.chat.id, '✅ *आपकी शिकायत मास्टर एडमिन को भेज दी गई है!* जल्द ही समाधान किया जाएगा।');
  }

  if (st.action === 'SUBMIT_UPI' && 'text' in ctx.message) {
    userStates.delete(ctx.from.id);
    const upiDetails = ctx.message.text.trim();
    const uid = ctx.from.id;
    const r = await pool.query('SELECT wallet_balance, referral_count, first_name FROM users WHERE telegram_id=$1', [uid]);
    const u = r.rows[0];
    const bal = Number(u?.wallet_balance || 0);
    if (bal < 99) return safeSend(ctx.chat.id, '❌ बैलेंस ₹99 से कम है।');

    const clearDate = new Date(Date.now() + 5.5 * 3600 * 1000).toLocaleDateString('hi-IN');
    await pool.query('UPDATE users SET wallet_balance = 0, referral_count = 0, last_cleared_at = $1 WHERE telegram_id = $2', [clearDate, uid]);
    await pool.query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [uid]).catch(() => {});

    if (ADMIN_ID) {
      await safeSend(
        ADMIN_ID,
        '💸 *WITHDRAWAL REQUEST (₹' + bal + ')*\n👤 ' + escMd(u.first_name || 'User') + ' (' + uid + ')\n🏦 UPI: *' + escMd(upiDetails) + '*',
        Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm Paid', 'pay_ok_' + uid)]])
      );
    }
    return safeSend(ctx.chat.id, '✅ आपकी रिक्वेस्ट एडमिन को भेज दी गई है और आपका रेफ़रल मीटर 0 से रीसेट हो गया है!');
  }

  if (st.action === 'SET_GRP_CAP' && st.targetId && 'text' in ctx.message) {
    userStates.delete(ctx.from.id);
    await pool.query('UPDATE channels SET custom_caption=$1 WHERE chat_id=$2', [ctx.message.text.trim().substring(0, 120), st.targetId]);
    await safeSend(ctx.chat.id, '✅ कस्टम कैप्शन सेव हो गया!');
    return renderGroupPanel(ctx, st.targetId);
  }

  if (!isMaster(ctx.from.id)) return;
  userStates.delete(ctx.from.id);

  if (st.action === 'ADD_AI_KEYS' && 'text' in ctx.message) {
    const incomingKeys = ctx.message.text
      .split(/[\s,|;\n]+/)
      .map(k => cleanEnv(k))
      .filter(k => k.startsWith('gsk_') && k.length > 20);

    if (incomingKeys.length === 0) {
      return safeSend(ctx.chat.id, '❌ कोई मान्य Groq Key (`gsk_...`) नहीं मिली। कृपया सही Key भेजें।');
    }

    const existing = await getCfg('extra_ai_keys');
    const combined = Array.from(new Set([...existing.split(',').filter(Boolean), ...incomingKeys])).join(',');
    await setCfg('extra_ai_keys', combined);
    modelCooldownUntil.clear();
    cachedGroqModels = null;

    const r = await generateQuestionsBatch();
    await safeSend(ctx.chat.id, '✅ *' + incomingKeys.length + ' नई Groq Key(s) सेव हो गईं!*\n' + (r.ok ? '📡 *Test Seed:* +' + r.count + ' Qs via ' + r.provider : 'ℹ️ ' + escMd(r.error || 'No new Qs')));
    return renderAdmin(ctx);
  }

  if (st.action === 'ADD_GRP') {
    const msgAny: any = ctx.message;
    try {
      let targetId: number | string = '';
      if (msgAny.forward_from_chat) targetId = msgAny.forward_from_chat.id;
      else if ('text' in ctx.message) targetId = ctx.message.text.trim();
      const chatInfo: any = await bot.telegram.getChat(targetId);
      await pool.query(
        "INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status, trial_ends_at) VALUES($1,$2,$3,$4,TRUE,'APPROVED', NOW() + INTERVAL '30 days') ON CONFLICT(chat_id) DO UPDATE SET title=$2, is_active=TRUE, approval_status='APPROVED'",
        [chatInfo.id, chatInfo.title || 'Quiz Group', chatInfo.type || 'supergroup', ctx.from.id]
      );
      await safeSend(ctx.chat.id, '✅ *"' + escMd(chatInfo.title || String(chatInfo.id)) + '" सीधे PostgreSQL डेटाबेस में जुड़ गया है!*');
    } catch (e: any) {
      await safeSend(ctx.chat.id, '❌ ग्रुप नहीं मिला: सुनिश्चित करें कि बॉट उस ग्रुप में Admin है। (' + (e?.message || '') + ')');
    }
    return renderAdmin(ctx);
  }

  if (st.action === 'BC_NORM' || st.action === 'BC_PIN') {
    const pin = st.action === 'BC_PIN';
    const us = await pool.query('SELECT telegram_id FROM users').catch(() => ({ rows: [] }));
    const gs = await pool.query('SELECT chat_id FROM channels WHERE is_active=TRUE').catch(() => ({ rows: [] }));
    for (const u of us.rows) { try { await ctx.telegram.copyMessage(u.telegram_id, ctx.chat.id, ctx.message.message_id); await sleep(80); } catch {} }
    for (const g of gs.rows) {
      try {
        const m = await ctx.telegram.copyMessage(g.chat_id, ctx.chat.id, ctx.message.message_id);
        if (pin && m.message_id) await ctx.telegram.pinChatMessage(g.chat_id, m.message_id, { disable_notification: false }).catch(() => {});
        await sleep(120);
      } catch {}
    }
    return safeSend(ctx.chat.id, '✅ Broadcast & Pin Complete!');
  }

  if (st.action === 'SET_FSUB1' || st.action === 'SET_FSUB2') {
    const msgAny: any = ctx.message;
    let cid = '', link = '';
    if (msgAny.forward_from_chat) {
      const fChat = msgAny.forward_from_chat;
      cid = String(fChat.id);
      link = fChat.username ? 'https://t.me/' + fChat.username : '';
    } else if ('text' in ctx.message) {
      const txt = ctx.message.text.trim();
      if (txt.includes('|')) { const p = txt.split('|'); cid = p[0].trim(); link = p[1].trim(); }
      else if (txt.startsWith('@')) { cid = txt; link = 'https://t.me/' + txt.replace('@', ''); }
    }
    if (!cid || !link) return safeSend(ctx.chat.id, '❌ कृपया पोस्ट Forward करें या @username लिखें।');
    const num = st.action === 'SET_FSUB1' ? '1' : '2';
    await setCfg('fsub' + num + '_id', cid);
    await setCfg('fsub' + num + '_link', link);
    await setCfg('fsub_enabled', 'true');
    await safeSend(ctx.chat.id, '✅ FSub ' + num + ' Set!');
    return renderAdmin(ctx);
  }

  if (!('text' in ctx.message)) return;
  const txt = ctx.message.text.trim();
  if (st.action === 'SET_GIFT') { await setCfg('gift_tagline', txt); await safeSend(ctx.chat.id, '✅ Updated!'); return renderAdmin(ctx); }
  if (st.action === 'MSG_WINNER') {
    const p = txt.split('|');
    const uid = p[0]?.trim();
    const msg = p.slice(1).join('|').trim();
    if (!uid || !msg) return safeSend(ctx.chat.id, '❌ फॉरमेट: ID | Message');
    await safeSend(uid, '🏆 *MESSAGE FROM PROFESSOR ADMIN:*\n' + msg);
    return safeSend(ctx.chat.id, '✅ Sent!');
  }
});

// =========================================================
// SAFE BOOT & GRACEFUL SHUTDOWN (ZERO 409 CONFLICT ON RESTART)
// =========================================================
const launchBot = async () => {
  try {
    await initDB();
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });

    setTimeout(() => {
      runDatabaseAutoCleaner();
      autoResumeOnServerBoot();
      generateQuestionsBatch();
    }, 3000);

    await bot.launch({ dropPendingUpdates: true });
    console.log('Professor AI Quiz Bot V9.1 Pro Successfully Launched!');
  } catch (e: any) {
    console.error('Polling Error:', e?.message);
    setTimeout(launchBot, 6000);
  }
};

launchBot();

const gracefulShutdown = async (signal: string) => {
  console.log(`[SHUTDOWN] Received ${signal}, saving checkpoints & stopping cleanly...`);
  for (const [cid, running] of activeTests.entries()) {
    clearInterval(running.timer);
    if (running.currentQ < 50) {
      await pool.query(
        "UPDATE channels SET checkpoints = jsonb_set(COALESCE(checkpoints, '{}'::jsonb), ARRAY[$1], to_jsonb($2::int)) WHERE chat_id = $3",
        [running.subject, running.currentQ, cid]
      ).catch(() => {});
    }
  }
  for (const s of soloSessions.values()) {
    if (s.nextTimer) clearTimeout(s.nextTimer);
  }
  try { bot.stop(signal); } catch {}
  try { server.close(); } catch {}
  try { await pool.end(); } catch {}
  process.exit(0);
};

process.once('SIGINT', () => { gracefulShutdown('SIGINT'); });
process.once('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
