import { Telegraf, Markup } from 'telegraf';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import http from 'http';
import cron from 'node-cron';

dotenv.config();

http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Professor AI Quiz Bot V6.4 (Fast Cache + 3-User Lobby + Non-Stop Seeder) Running 24/7!');
}).listen(process.env.PORT || 3000);

process.on('uncaughtException', (e) => console.error('Uncaught Exception:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled Rejection:', e));

const bot = new Telegraf(process.env.BOT_TOKEN || '');
const MASTER_IDS = new Set(['7412791600', (process.env.ADMIN_ID || '').trim()].filter(Boolean));
const ADMIN_ID = (process.env.ADMIN_ID || '7412791600').trim();
const isMaster = (uid?: number | string) => Boolean(uid) && MASTER_IDS.has(String(uid).trim());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 15,
  idleTimeoutMillis: 30000
});

const SCHEDULE_15H = [
  'HISTORY', 'GEOGRAPHY', 'ECONOMY', 'ENVIRONMENT', 'POLITY', 'CURRENT AFFAIRS',
  'PHYSICS', 'CHEMISTRY', 'GS MATHEMATICS', 'MATH', 'ENGLISH', 'REASONING', 'HINDI',
  'MIXED TEST 1', 'MIXED TEST 2'
];

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
  'ENVIRONMENT': ['पारिस्थितिकी (Ecology) एवं इकोसिस्टम के घटक', 'खाद्य श्रृंखला, खाद्य जाल एवं ऊर्जा पिरामिड', 'जैव-भू-रासायनिक चक्र (कार्बन, नाइट्रोजन, जल)', 'जैव विविधता (Biodiversity), हॉटस्पॉट एवं संरक्षण', 'राष्ट्रीय उद्यान (National Parks) एवं वन्यजीव अभयारण्य', 'प्रोजेक्ट टाइगर, प्रोजेक्ट एलीफेंट एवं बायोस्फीयर रिजर्व', 'रामसर आर्द्रभूमि (Wetlands), मैंग्रोव एवं प्रवाल भित्ति', 'वायु, जल, मृदा, ध्वनि एवं ई-कचरा प्रदूषण', 'ग्रीनहाउस गैसें, ग्लवायु परिवर्तन एवं ग्लोबल वार्मिंग', 'ओजोन परत क्षरण एवं अम्लीय वर्षा', 'पर्यावरण संरक्षण कानून, NGT एवं चिपको/एपिको आंदोलन', 'अंतरराष्ट्रीय सम्मेलन (स्टॉकहोम, रियो, क्योटो, पेरिस, COP)'],
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

const activeTests = new Map<number, { timer: NodeJS.Timeout; subject: string; currentQ: number }>();
const quizLobbies = new Map<number, { users: Map<number, string>; subject: string; updatedAt: number }>();
const reminderMsgIds = new Map<number, number[]>();
const userStates = new Map<number, { action: string; targetId?: number; meta?: string }>();
const cfgCache = new Map<string, { val: string; ts: number }>();
const banCache = new Map<number, { banned: boolean; ts: number }>();

let isSeedingNow = false;
let seedingStartedAt = 0;
let lastSeedReport = 'Initializing Multi-Engine Seeder...';
let apiKeyCursor = 0;
let discoveredGeminiModels: string[] = [];

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs: number = 25000) => {
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

const initDB = async () => {
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
    "CREATE TABLE IF NOT EXISTS daily_scores (day_key TEXT, chat_id BIGINT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(8,2) DEFAULT 0.00, PRIMARY KEY (day_key, chat_id, user_id))",
    "CREATE TABLE IF NOT EXISTS monthly_scores (month_key TEXT, user_id BIGINT, username TEXT, right_count INT DEFAULT 0, wrong_count INT DEFAULT 0, net_marks NUMERIC(8,2) DEFAULT 0.00, PRIMARY KEY (month_key, user_id))",
    "CREATE TABLE IF NOT EXISTS bot_settings (key TEXT PRIMARY KEY, value TEXT)",
    "INSERT INTO bot_settings (key, value) VALUES ('fsub1_id', ''), ('fsub1_link', ''), ('fsub2_id', ''), ('fsub2_link', ''), ('fsub_enabled', 'false'), ('min_participants_enabled', 'true'), ('service_clean_enabled', 'true'), ('gift_tagline', '🎁 *विशेष घोषणा: 1 नवंबर से जो छात्र इस टेस्ट सीरीज़ में टॉप पर आएगा, उसे ₹100 का Gift Card इनाम में दिया जाएगा!*'), ('promo_msg', '💡 *Professor Bot Tip:* आप इस स्मार्ट क्विज़ बॉट को अपने ग्रुप या चैनल में जोड़कर छात्रों को इकट्ठा कर सकते हैं और अपना एजुकेशनल नेटवर्क तेजी से बढ़ा सकते हैं! (30 दिन बिल्कुल मुफ्त ट्रायल)'), ('seo_tags', '#UPSC #UPPSC #SSC #RailwayExams #LiveQuiz #TestSeries #DailyGK #ProfessorBot'), ('factory_on', 'true') ON CONFLICT (key) DO NOTHING"
  ];
  for (const q of queries) await pool.query(q).catch(() => {});
  console.log('Professor V6.4 Database Ready!');
};
initDB();

const getCfg = async (k: string): Promise<string> => {
  const cached = cfgCache.get(k);
  if (cached && Date.now() - cached.ts < 120000) return cached.val;
  const val = (await pool.query('SELECT value FROM bot_settings WHERE key=$1', [k]).catch(() => ({ rows: [] }))).rows[0]?.value || '';
  cfgCache.set(k, { val, ts: Date.now() });
  return val;
};

const setCfg = async (k: string, v: string) => {
  cfgCache.set(k, { val: v, ts: Date.now() });
  return pool.query('INSERT INTO bot_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [k, v]);
};

// =========================================================
// FAST RAM BAN CHECK & GROUP SERVICE MESSAGE AUTO-CLEANER
// =========================================================
bot.use(async (ctx, next) => {
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
      await safeSend(u.referred_by, '🎉 *बधाई हो! नया रेफ़रल सफल हुआ!*\n👤 छात्र: *' + (u.first_name || 'Student') + '* ने बॉट जॉइन कर लिया है।\n💰 आपके वॉलेट में *+₹5* जोड़ दिए गए हैं!');
    }
  } catch {}
};

const isGroupAllowedToPost = (row: any): { ok: boolean; reason: string } => {
  if (row.owner_id && isMaster(Number(row.owner_id))) return { ok: true, reason: 'MASTER' };
  if (row.approval_status === 'REJECTED') return { ok: false, reason: 'REJECTED' };
  if (row.approval_status === 'PENDING') return { ok: false, reason: 'PENDING_APPROVAL' };
  const now = new Date();
  if (row.sub_ends_at && new Date(row.sub_ends_at) > now) return { ok: true, reason: 'SUB_ACTIVE' };
  if (row.trial_ends_at && new Date(row.trial_ends_at) > now) return { ok: true, reason: 'TRIAL_ACTIVE' };
  return { ok: false, reason: 'EXPIRED' };
};

// =========================================================
// A4 OFFLINE PRINTABLE QUESTION PAPER + OMR + TXT
// =========================================================
const sendGroupStarsInvoice = async (destChatId: number, targetGroupId: number) => {
  try {
    await bot.telegram.sendInvoice(destChatId, {
      title: 'Professor Quiz Bot - 1 Year Pro Activation',
      description: 'अपने ग्रुप/चैनल में 1 साल (365 दिन) के लिए ऑटोमैटिक लाइव क्विज़ तुरंत एक्टिवेट करें।',
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
      description: '50 Verified Exam Questions + OMR Bubble Sheet + Answer Key (Print-Ready A4 PDF Format + Editable Text)',
      payload: 'pdf_paper_' + subject,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'A4 Printable Test Paper (50 Qs)', amount: 10 }]
    });
  } catch (e) { console.error('PDF Invoice Error:', e); }
};

const deliverOfflineTestPaper = async (chatId: number, subject: string, asTextOnly: boolean = false) => {
  const isMixed = subject.startsWith('MIXED');
  const qRes = await pool.query(
    'SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) ORDER BY is_pyq DESC, RANDOM() LIMIT 50',
    [isMixed, '%' + subject + '%']
  ).catch(() => ({ rows: [] }));

  if (qRes.rows.length === 0) {
    generateQuestionsBatch(isMixed ? undefined : subject);
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
        '📄 *A4 Printable Offline Coaching Test Paper (' + subject + ')*\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '✅ *इसमें शामिल हैं:* 2-Column 50 Questions + OMR Bubble Sheet + Answer Key\n' +
        '🖨️ *कैसे प्रिंट करें:* फाइल खोलकर ऊपर *हरे बटन (Save as A4 PDF / Print)* पर क्लिक करें।\n\n' +
        '👇 *यदि आपके फोन में PDF सही न दिखे, तो नीचे दिए गए बटन से Editable Text लें या एडमिन को शिकायत भेजें:*',
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
    await deliverOfflineTestPaper(ctx.chat.id, sub, false);
  }
});

bot.action(/^pdf_txt_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  await ctx.answerCbQuery('Sending Editable Text File...');
  return deliverOfflineTestPaper(ctx.chat.id, sub, true);
});

bot.action(/^pdf_comp_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  userStates.set(ctx.from.id, { action: 'PDF_COMPLAINT', meta: sub });
  await ctx.answerCbQuery();
  await deliverOfflineTestPaper(ctx.chat.id, sub, true);
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
  await deliverOfflineTestPaper(targetUid, sub, true);
  await safeSend(targetUid, '✅ *मास्टर एडमिन ने आपकी शिकायत का समाधान करते हुए Editable Text पेपर भेज दिया है!*');
  await ctx.answerCbQuery('Sent Editable Paper to User!', { show_alert: true });
});

// =========================================================
// NON-STOP AUTO-SEEDER: GROQ (gsk_) + GEMINI + OPENAI
// =========================================================
let seedCursor = 0;

const getActiveGeminiModels = async (apiKey: string): Promise<string[]> => {
  if (discoveredGeminiModels.length > 0) return discoveredGeminiModels;
  const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
  try {
    const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, {}, 12000);
    const d: any = await r.json();
    if (d && Array.isArray(d.models)) {
      const valid = d.models
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => String(m.name).replace('models/', ''))
        .filter((name: string) =>
          name.includes('gemini') &&
          name.includes('flash') &&
          !name.includes('vision') &&
          !name.includes('embedding') &&
          !name.includes('image') &&
          !name.includes('tts') &&
          !name.includes('audio')
        );
      if (valid.length > 0) {
        discoveredGeminiModels = Array.from(new Set([...fallbackModels, ...valid])).slice(0, 5);
        return discoveredGeminiModels;
      }
    }
  } catch {}
  return fallbackModels;
};

const getNextSubjectAndTopic = async (forcedSubject?: string): Promise<{ subject: string; topic: string }> => {
  const coreSubjects = SCHEDULE_15H.slice(0, 13);
  let subject = forcedSubject || '';

  if (!subject) {
    const countsRes = await pool.query('SELECT subject, COUNT(*) as c FROM questions GROUP BY subject').catch(() => ({ rows: [] }));
    const countMap: Record<string, number> = {};
    countsRes.rows.forEach((r: any) => { countMap[r.subject] = Number(r.c); });

    let minSub = '';
    let minVal = 9999999;
    for (const s of coreSubjects) {
      const c = countMap[s] || 0;
      if (c < minVal) { minVal = c; minSub = s; }
    }
    if (minSub && minVal < 500 && seedCursor % 2 === 0) subject = minSub;
  }

  if (!subject) subject = coreSubjects[seedCursor++ % coreSubjects.length];
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

const parseAIJsonArray = (raw: string): any[] | null => {
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      const subArr = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
      if (Array.isArray(subArr)) return subArr;
    }
  } catch {}
  return null;
};

const saveQuestionsToDB = async (arr: any[], subject: string, topic: string): Promise<number> => {
  let saved = 0;
  for (const q of arr) {
    if (!q || !q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.correct_option) continue;
    const cOpt = q.correct_option.toString().trim().toUpperCase().charAt(0);
    if (!['A', 'B', 'C', 'D'].includes(cOpt)) continue;
    if (q.option_a === q.option_b && q.option_b === q.option_c) continue;

    const res = await pool.query(
      'INSERT INTO questions (subject, topic, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, is_pyq) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (question_text) DO NOTHING RETURNING id',
      [
        subject,
        topic,
        String(q.question_text).trim().substring(0, 235),
        String(q.option_a).trim().substring(0, 95),
        String(q.option_b).trim().substring(0, 95),
        String(q.option_c).trim().substring(0, 95),
        String(q.option_d).trim().substring(0, 95),
        cOpt,
        String(q.explanation || 'NCERT एवं आयोग की आधिकारिक उत्तर-कुंजी द्वारा सत्यापित।').trim().substring(0, 185),
        DIFF_TIERS.includes(q.difficulty) ? q.difficulty : 'Medium',
        Boolean(q.is_pyq)
      ]
    ).catch(() => ({ rowCount: 0 }));

    if (res && res.rowCount && res.rowCount > 0) saved++;
  }
  return saved;
};

const generateQuestionsBatch = async (forcedSub?: string): Promise<{ ok: boolean; count: number; sub: string; topic: string; provider: string; error?: string }> => {
  // Safety lock breaker: if a previous seed hung for >80 seconds, unlock automatically
  if (isSeedingNow && (Date.now() - seedingStartedAt > 80000)) {
    isSeedingNow = false;
  }
  if (isSeedingNow && !forcedSub) return { ok: false, count: 0, sub: 'BUSY', topic: '', provider: 'NONE' };
  if ((await getCfg('factory_on')) === 'false' && !forcedSub) return { ok: false, count: 0, sub: 'PAUSED', topic: '', provider: 'NONE' };

  isSeedingNow = true;
  seedingStartedAt = Date.now();

  try {
    const rawGeminiKeys = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    const secondKeys = [
      ...(process.env.GROQ_API_KEY || '').split(','),
      ...(process.env.CHATGPT_API_KEY || '').split(','),
      ...(process.env.OPENAI_API_KEY || '').split(',')
    ].map(k => k.trim()).filter(Boolean);

    const { subject, topic } = await getNextSubjectAndTopic(forcedSub);
    const examTarget = EXAM_TARGET_MAP[subject] || 'UPSC, PSC, SSC, Railway';
    const randSalt = Math.floor(1000 + Math.random() * 9000);

    const prompt = [
      'You are an authoritative Indian Competitive Exam Paper Setter for: ' + examTarget + ' (Batch #' + randSalt + ').',
      'Generate 15 unique, 100% fact-checked, NCERT & Official Answer-Key verified MCQs on:',
      'Subject: ' + subject + ' | Specific Topic: ' + topic,
      'Language: Hindi (if subject is ENGLISH, write in English).',
      'Distribution: 3 "Easy", 3 "Medium", 3 "Hard", 3 "Ultra Hard", and 3 "Max Hard" questions.',
      'At least 5 questions MUST be Previous Year Questions (mention exam & year like [UPPSC 2023] or [SSC CGL 2022] at end of question_text) with "is_pyq": true.',
      'Return ONLY a valid JSON Object with a "questions" array of 15 objects, each having keys:',
      '"question_text" (max 205 chars), "option_a", "option_b", "option_c", "option_d" (max 80 chars each), "correct_option" ("A","B","C", or "D"), "explanation" (max 150 chars), "difficulty" ("Easy","Medium","Hard","Ultra Hard","Max Hard"), "is_pyq" (boolean).'
    ].join('\n');

    let geminiErr = '';
    let fallbackErr = '';

    // 1. Try Ultra-Fast Free Groq Keys (gsk_) OR OpenAI Keys FIRST for instant 1.5s seeding
    for (const sKey of secondKeys) {
      const isGroq = sKey.startsWith('gsk_');
      const apiUrl = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      const models = isGroq ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] : ['gpt-4o-mini', 'gpt-3.5-turbo'];
      const label = isGroq ? 'Groq Free AI' : 'ChatGPT';

      for (const mName of models) {
        try {
          const r = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sKey },
            body: JSON.stringify({
              model: mName,
              messages: [
                { role: 'system', content: 'You are an Indian competitive exam question generator. Always respond with valid JSON containing a "questions" array.' },
                { role: 'user', content: prompt }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7
            })
          }, 25000);
          const d: any = await r.json();
          if (d.error) {
            fallbackErr = label + ' (' + mName + '): ' + String(d.error.message || d.error.code).substring(0, 60);
            continue;
          }
          const txt = d.choices?.[0]?.message?.content?.trim();
          if (!txt) continue;
          const arr = parseAIJsonArray(txt);
          if (!arr || arr.length === 0) continue;

          const saved = await saveQuestionsToDB(arr, subject, topic);
          if (saved > 0) {
            lastSeedReport = '✅ ' + label + ' (' + mName + ') +' + saved + ' Qs [' + subject + ']';
            console.log(lastSeedReport);
            isSeedingNow = false;
            return { ok: true, count: saved, sub: subject, topic, provider: label + ' (' + mName + ')' };
          }
        } catch (err: any) {
          fallbackErr = label + ': ' + (err?.message || 'Timeout');
        }
      }
    }

    // 2. Try All Gemini Keys as Parallel/Secondary Engine
    if (rawGeminiKeys.length > 0) {
      const modelsToTry = await getActiveGeminiModels(rawGeminiKeys[0]);
      for (let k = 0; k < rawGeminiKeys.length; k++) {
        const keyIndex = (apiKeyCursor + k) % rawGeminiKeys.length;
        const geminiKey = rawGeminiKeys[keyIndex];

        for (const model of modelsToTry) {
          try {
            const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + geminiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
              })
            }, 25000);
            const d: any = await r.json();
            if (d.error) {
              if (!geminiErr) geminiErr = 'Key#' + (keyIndex + 1) + ' (' + model + '): ' + String(d.error.message || d.error.code).substring(0, 60);
              continue;
            }
            const txt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!txt) continue;
            const arr = parseAIJsonArray(txt);
            if (!arr || arr.length === 0) continue;

            const saved = await saveQuestionsToDB(arr, subject, topic);
            if (saved > 0) {
              apiKeyCursor = keyIndex + 1;
              lastSeedReport = '✅ Gemini Key#' + (keyIndex + 1) + ' (' + model + ') +' + saved + ' Qs [' + subject + ']';
              console.log(lastSeedReport);
              isSeedingNow = false;
              return { ok: true, count: saved, sub: subject, topic, provider: 'Gemini Key#' + (keyIndex + 1) + ' (' + model + ')' };
            }
          } catch (err: any) {
            if (!geminiErr) geminiErr = 'Gemini: ' + (err?.message || 'Timeout');
          }
        }
      }
    } else if (!fallbackErr) {
      geminiErr = 'No API Keys Configured';
    }

    const errSummary = [fallbackErr, geminiErr].filter(Boolean).join(' | ');
    lastSeedReport = '❌ ' + (errSummary || 'Duplicate batch skipped');
    isSeedingNow = false;
    return { ok: false, count: 0, sub: subject, topic, provider: 'NONE', error: errSummary };
  } catch (e: any) {
    isSeedingNow = false;
    return { ok: false, count: 0, sub: 'ERROR', topic: '', provider: 'NONE', error: e?.message };
  }
};

// Continuous Non-Stop Auto-Seeder Every 60 Seconds
setInterval(() => {
  generateQuestionsBatch().catch(() => {});
}, 60000);

// =========================================================
// TOPIC META, LEADERBOARD & 3-PLAYER ONLINE LOBBY
// =========================================================
const getTopicSummaryMeta = async (subject: string) => {
  const topics = SYLLABUS_MAP[subject] || ['संपूर्ण पाठ्यक्रम'];
  const progRes = await pool.query('SELECT topic_index, cycles_completed FROM syllabus_progress WHERE subject=$1', [subject]).catch(() => ({ rows: [] }));
  const tIdx = Number(progRes.rows[0]?.topic_index || 0);
  const currentTopic = topics[tIdx % topics.length];
  const prevTopics = topics.slice(Math.max(0, tIdx - 3), tIdx).map(t => t.split(' ')[0] + ' ' + (t.split(' ')[1] || '')).join(', ') || 'प्रारंभिक अध्याय';
  const totalQRes = await pool.query('SELECT COUNT(*) FROM questions WHERE subject=$1', [subject]).catch(() => ({ rows: [{ count: 0 }] }));
  const totalSubjectQs = Number(totalQRes.rows[0]?.count || 0);
  return { currentTopic, prevTopics, totalSubjectQs };
};

const clearOldReminders = async (chatId: number) => {
  const ids = reminderMsgIds.get(chatId) || [];
  for (const mid of ids) await bot.telegram.deleteMessage(chatId, mid).catch(() => {});
  reminderMsgIds.delete(chatId);
};

const announceAndPinLeaderboard = async (chatId: number, subject: string) => {
  try {
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
        msg += medal + ' [' + r.username + '](tg://user?id=' + r.user_id + ') ➔ *' + Number(r.net_marks).toFixed(2) + '/50* (✅' + r.right_count + ' ❌' + r.wrong_count + ' ✂️-' + deducted + ')\n';
      });
      msg += '\n';
    }

    msg += '*' + giftTag + '*\n';
    msg += '📄 *A4 Printable Paper:* /pdf | 🏆 *Monthly Top:* /monthlytop\n';
    msg += '⏳ *अगला विषय टेस्ट ठीक 10 मिनट बाद शुरू होगा!*\n' + seoTags;

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
        msg += medal + ' [' + r.username + '](tg://user?id=' + r.user_id + ') ➔ *' + Number(r.net_marks).toFixed(2) + ' Pts* (✅' + r.right_count + ' ❌' + r.wrong_count + ' ✂️-' + deducted + ')\n';
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
    await safeSend(
      chatId,
      '⏸ *' + running.subject + ' टेस्ट Q.' + running.currentQ + ' पर रुका।* अगले राउंड में यहीं से आगे बढ़ेगा!\n👇 *3 छात्र Ready बटन दबाकर या एडमिन 1-Click से तुरंत टेस्ट दोबारा शुरू कर सकते हैं:*',
      Markup.inlineKeyboard([
        [Markup.button.callback('🙋‍♂️ Ready to Resume (0/3)', 'ready_quiz_' + chatId), Markup.button.callback('👑 Admin Start', 'gstart_' + chatId)]
      ])
    );
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
  const lobby = { users: new Map<number, string>(), subject, updatedAt: Date.now() };
  quizLobbies.set(chatId, lobby);
  const meta = await getTopicSummaryMeta(subject);
  const txt =
    '🔔 *LIVE QUIZ LOBBY: ' + subject + '*\n' +
    '• 📌 *Topic:* ' + meta.currentTopic + '\n' +
    '• 👥 *Status:* **0/3 छात्र ऑनलाइन तैयार हैं**\n\n' +
    '👇 *नीचे "🙋‍♂️ I\'m Ready" बटन दबाएं—जैसे ही 3 ऑनलाइन लोग बटन दबाएंगे (या एडमिन Start दबाएंगे), लाइव क्विज़ तुरंत शुरू हो जाएगा!*';

  await safeSend(
    chatId,
    txt,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋‍♂️ I\'m Ready! Start Quiz (0/3)', 'ready_quiz_' + chatId)],
      [Markup.button.callback('👑 Admin Instant Start (1-Click)', 'gstart_' + chatId)]
    ])
  );
};

const startHourlySubjectTest = async (chatId: number, subject: string, resumeFromMinuteOffset: number = 0, forceStart: boolean = false) => {
  if (activeTests.has(chatId)) await stopTestInGroup(chatId, true);
  await clearOldReminders(chatId);
  quizLobbies.delete(chatId);

  const chRes = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]).catch(() => ({ rows: [] }));
  if (chRes.rows.length === 0) return;
  const ch = chRes.rows[0];

  const perm = isGroupAllowedToPost(ch);
  if (!perm.ok) {
    if (perm.reason === 'PENDING_APPROVAL') return safeSend(chatId, '⏳ *यह ग्रुप/चैनल अभी मास्टर एडमिन के अप्रूवल की प्रतीक्षा में है।*');
    if (perm.reason === 'EXPIRED') {
      await safeSend(chatId, '⚠️ *30 दिनों का फ्री ट्रायल समाप्त हो चुका है!* 1 साल के लिए *100 Stars* से एक्टिवेट करें:');
      return sendGroupStarsInvoice(chatId, chatId);
    }
    return;
  }

  const minCheckOn = (await getCfg('min_participants_enabled')) !== 'false';
  if (minCheckOn && !forceStart && chatId < 0 && resumeFromMinuteOffset === 0 && ch.chat_type !== 'channel') {
    return openThreePlayerLobby(chatId, subject);
  }

  const savedQ = Number(ch.checkpoints?.[subject] || 0);
  let currentQ = savedQ > 0 && savedQ < 50 ? savedQ : resumeFromMinuteOffset;
  if (currentQ === 0) await pool.query('DELETE FROM test_scores WHERE chat_id=$1', [chatId]).catch(() => {});

  const meta = await getTopicSummaryMeta(subject);
  const seoTags = await getCfg('seo_tags');
  const customCap = ch.custom_caption ? '• 📢 *Note:* ' + ch.custom_caption + '\n' : '';

  await safeSend(
    chatId,
    '🏛 *LIVE TEST STARTED: ' + subject + '* ' + (currentQ > 0 ? '*(Resume Q.' + (currentQ + 1) + ')*' : '') + '\n' +
    '• 🎯 *Exams:* ' + (EXAM_TARGET_MAP[subject] || 'All Exams') + '\n' +
    '• 📌 *Topic:* ' + meta.currentTopic + '\n' +
    '• ✅ *Done Keywords:* ' + meta.prevTopics + ' (' + meta.totalSubjectQs + ' Qs in Bank)\n' +
    '• 📋 *Rule:* 50 Qs | ⚖️ -1/4 Negative | ⏱ 15s-55s\n' +
    customCap + seoTags,
    Markup.inlineKeyboard([
      [Markup.button.callback('🛑 Stop Test', 'pause_test_' + chatId), Markup.button.callback('📄 Get A4 PDF (10⭐)', 'buy_pdf_' + subject)]
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
    const isMixed = subject.startsWith('MIXED');
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
        await generateQuestionsBatch(isMixed ? undefined : subject);
        qRes = await pool.query('SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) AND id NOT IN (SELECT question_id FROM asked_history WHERE chat_id = $3) ORDER BY RANDOM() LIMIT 1', [isMixed, '%' + subject + '%', chatId]);
      }
      if (qRes.rows.length === 0) {
        await pool.query('DELETE FROM asked_history WHERE chat_id=$1 AND question_id IN (SELECT id FROM questions WHERE subject ILIKE $2)', [chatId, '%' + subject + '%']).catch(() => {});
        qRes = await pool.query('SELECT * FROM questions WHERE ($1::boolean = TRUE OR subject ILIKE $2) ORDER BY RANDOM() LIMIT 1', [isMixed, '%' + subject + '%']);
      }
      if (qRes.rows.length === 0) {
        await stopTestInGroup(chatId, true);
        return;
      }

      const q = qRes.rows[0];
      await pool.query('INSERT INTO asked_history(chat_id, question_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [chatId, q.id]);

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
        await pool.query('INSERT INTO poll_tracking(poll_id, chat_id, correct_index) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [sentPoll.poll.id, chatId, finalIdx]);
      }
    } catch {}
  };

  sendNextQuestion();
  const timer = setInterval(sendNextQuestion, 60000);
  activeTests.set(chatId, { timer, subject, currentQ });
};

// Handle 3-User Online Ready Button Click
bot.action(/^ready_quiz_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  if (activeTests.has(cid)) {
    return ctx.answerCbQuery('🔥 इस ग्रुप में लाइव क्विज़ पहले से चल रहा है!', { show_alert: true });
  }

  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());

  // Master Admin starts immediately on 1st click
  if (isMaster(ctx.from.id)) {
    await ctx.answerCbQuery('👑 Admin Instant Start: ' + sub + ' Quiz शुरू हो रहा है!');
    return startHourlySubjectTest(cid, sub, 0, true);
  }

  let lobby = quizLobbies.get(cid);
  if (!lobby || Date.now() - lobby.updatedAt > 1800000) {
    lobby = { users: new Map<number, string>(), subject: sub, updatedAt: Date.now() };
    quizLobbies.set(cid, lobby);
  }

  const uName = (ctx.from.first_name || ctx.from.username || 'Student').replace(/[*_`[\]]/g, '').substring(0, 16);
  lobby.users.set(ctx.from.id, uName);
  lobby.updatedAt = Date.now();

  const readyCount = lobby.users.size;
  const namesList = Array.from(lobby.users.values()).join(', ');

  if (readyCount >= 3) {
    quizLobbies.delete(cid);
    await ctx.answerCbQuery('🎉 3 छात्र तैयार! लाइव क्विज़ शुरू हो रहा है!');
    await safeEdit(ctx, '🚀 *3 ऑनलाइन छात्र तैयार हो चुके हैं (' + namesList + ')!*\n🔥 *' + lobby.subject + '* का लाइव टेस्ट शुरू किया जा रहा है...');
    return startHourlySubjectTest(cid, lobby.subject, 0, true);
  }

  await ctx.answerCbQuery('✅ आप जुड़ गए! (' + readyCount + '/3 तैयार — ' + (3 - readyCount) + ' और चाहिए)');
  const txt =
    '🔔 *LIVE QUIZ LOBBY: ' + lobby.subject + '*\n' +
    '• 👥 *Status:* **' + readyCount + '/3 छात्र ऑनलाइन तैयार हैं**\n' +
    '• ✅ *Ready Students:* ' + namesList + '\n\n' +
    '👇 *सिर्फ़ ' + (3 - readyCount) + ' और छात्र नीचे "🙋‍♂️ I\'m Ready" बटन दबाएं, क्विज़ तुरंत शुरू हो जाएगा!*';

  return safeEdit(
    ctx,
    txt,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋‍♂️ I\'m Ready! Start Quiz (' + readyCount + '/3)', 'ready_quiz_' + cid)],
      [Markup.button.callback('👑 Admin Instant Start (1-Click)', 'gstart_' + cid)]
    ])
  );
});

bot.command('startquiz', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('यह कमांड अपने ग्रुप के अंदर लिखें।');
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  if (isMaster(ctx.from.id)) {
    return startHourlySubjectTest(ctx.chat.id, sub, 0, true);
  }
  return openThreePlayerLobby(ctx.chat.id, sub);
});

bot.on('poll_answer', async (ctx) => {
  try {
    const ans = ctx.pollAnswer;
    if (!ans.option_ids || ans.option_ids.length === 0) return;
    const uid = ans.user.id;
    const uname = (ans.user.first_name || ans.user.username || 'Student').replace(/[*_`[\]]/g, '').substring(0, 18);
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

    const dayKey = getTodayKey();
    await pool.query(
      'INSERT INTO daily_scores (day_key, chat_id, user_id, username, right_count, wrong_count, net_marks) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (day_key, chat_id, user_id) DO UPDATE SET username = $4, right_count = daily_scores.right_count + $5, wrong_count = daily_scores.wrong_count + $6, net_marks = daily_scores.net_marks + $7',
      [dayKey, chat_id, uid, uname, rInc, wInc, markDelta]
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
  return getSubjectForHour((ist.getUTCHours() + 1) % 24);
};

const sendPreTestReminders = async (minsLeft: number) => {
  const nextSub = getNextISTHourSubject();
  const meta = await getTopicSummaryMeta(nextSub);
  const chs = await pool.query("SELECT * FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  const users = await pool.query('SELECT telegram_id, first_name FROM users WHERE alerts_enabled=TRUE AND is_banned=FALSE AND ($1 = ANY(preferred_subjects) OR $2 = TRUE)', [nextSub, nextSub.startsWith('MIXED')]).catch(() => ({ rows: [] }));
  const mentionList = users.rows.slice(0, 20).map(u => '[' + (u.first_name || 'Student').replace(/[*_`[\]]/g, '') + '](tg://user?id=' + u.telegram_id + ')').join(', ');

  for (const ch of chs.rows) {
    if (!isGroupAllowedToPost(ch).ok) continue;
    const cid = Number(ch.chat_id);
    if (minsLeft === 1) {
      const instructionText =
        '🚨 *1 MIN LEFT — LIVE TEST INSTRUCTIONS* 🚨\n' +
        '• 📘 *Subject:* ' + nextSub + ' (50 Qs)\n' +
        '• 🎯 *Exams:* ' + (EXAM_TARGET_MAP[nextSub] || 'All Exams') + '\n' +
        '• 📌 *Topic:* ' + meta.currentTopic + '\n' +
        '• ✅ *Covered:* ' + meta.prevTopics + '\n' +
        '• ⚖️ *Negative Marking:* 1/4 (-0.25 per wrong answer)\n' +
        '• 🔔 *Ready:* ' + (mentionList || 'सभी अभ्यर्थी तैयार रहें!');
      const sent = await safeSend(
        cid,
        instructionText,
        Markup.inlineKeyboard([[Markup.button.callback('🙋‍♂️ I\'m Ready (0/3)', 'ready_quiz_' + cid), Markup.button.callback('👑 Admin Start', 'gstart_' + cid)]])
      );
      if (sent && 'message_id' in sent) await bot.telegram.pinChatMessage(cid, sent.message_id, { disable_notification: false }).catch(() => {});
    } else {
      const sent = await safeSend(
        cid,
        '⏰ *Test Alert (' + minsLeft + 'm Left):* *' + nextSub + '*\n• 📌 *Topic:* ' + meta.currentTopic + ' | ⚖️ -1/4 Negative\n🔔 ' + (mentionList || 'तैयार रहें!')
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
      await safeSend(u.telegram_id, '🔔 *Alert:* *' + nextSub + '* (' + meta.currentTopic + ') का लाइव टेस्ट *10 मिनट* में शुरू हो रहा है!');
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
    startHourlySubjectTest(Number(c.chat_id), sub, 0, false);
    await sleep(350);
  }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('0 23 * * *', () => announceDailyClosingReport(), { timezone: 'Asia/Kolkata' });

cron.schedule('0 14 */2 * *', async () => {
  const promo = await getCfg('promo_msg');
  const botUser = bot.botInfo?.username || '';
  const adminPerms = 'post_messages+edit_messages+delete_messages+pin_messages+invite_users';
  const kb: any[][] = [
    [Markup.button.url('➕ Add to Group (1-Click)', 'https://t.me/' + botUser + '?startgroup=true&admin=' + adminPerms)],
    [Markup.button.url('📢 Add to Channel (1-Click)', 'https://t.me/' + botUser + '?startchannel=true&admin=' + adminPerms)]
  ];
  const chs = await pool.query('SELECT chat_id FROM channels WHERE is_active=TRUE').catch(() => ({ rows: [] }));
  for (const c of chs.rows) { await safeSend(c.chat_id, promo, Markup.inlineKeyboard(kb)); await sleep(350); }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('0 2 * * *', async () => {
  await pool.query("DELETE FROM poll_tracking WHERE created_at < NOW() - INTERVAL '1 day'").catch(() => {});
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
      if (!activeTests.has(cid)) { startHourlySubjectTest(cid, sub, min, true); await sleep(350); }
    }
  }
};

// =========================================================
// USER INTERFACE & PDF MENU
// =========================================================
const renderMainMenu = async (ctx: any) => {
  const botUser = ctx.botInfo?.username || '';
  const giftTag = await getCfg('gift_tagline');
  const adminPerms = 'post_messages+edit_messages+delete_messages+pin_messages+invite_users';
  const text =
    '🎓 *प्रोफेसर स्मार्ट लाइव टेस्ट सीरीज़ (V6.4)*\n' +
    '• ⏰ *Live Time:* 8:00 AM – 11:00 PM (15 Hours Daily)\n' +
    '• 📚 *Syllabus:* Topic-Wise Complete Exam Coverage + PYQs\n' +
    '• ⚖️ *Marking:* +1.00 Right | -0.25 Wrong (1/4 Negative)\n' +
    '• 📄 *Offline Paper:* A4 Printable Question Paper + OMR (10 ⭐)\n' +
    '• 💰 *Refer & Earn:* ₹5/Refer (Min Withdraw ₹99 via UPI)\n\n' + giftTag;

  const kb: any[][] = [
    [Markup.button.callback('🎯 Exam & Subject Alerts', 'u_prefs'), Markup.button.callback('📅 15-Hour Schedule', 'u_sched')],
    [Markup.button.callback('📄 Download A4 Test Paper (10 ⭐)', 'u_pdf_menu'), Markup.button.callback('🏆 Monthly Top 10', 'u_monthly')],
    [Markup.button.callback('💰 Refer & Earn (₹5/Refer)', 'u_refer'), Markup.button.callback('⚙️ My Groups & Channels', 'u_groups')],
    [
      Markup.button.url('➕ Add to Group (1-Click)', 'https://t.me/' + botUser + '?startgroup=true&admin=' + adminPerms),
      Markup.button.url('📢 Add to Channel (1-Click)', 'https://t.me/' + botUser + '?startchannel=true&admin=' + adminPerms)
    ]
  ];
  if (isMaster(ctx.from?.id)) kb.push([Markup.button.callback('👑 MASTER ADMIN PANEL (ONLY FOR ME) 👑', 'adm_home')]);

  if (ctx.callbackQuery) return safeEdit(ctx, text, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, text, Markup.inlineKeyboard(kb));
};

const renderPdfSubjectMenu = async (ctx: any) => {
  const coreSubs = SCHEDULE_15H.slice(0, 14);
  const kb: any[][] = [];
  for (let i = 0; i < coreSubs.length; i += 2) {
    const row = [Markup.button.callback('📄 ' + coreSubs[i], 'buy_pdf_' + coreSubs[i])];
    if (coreSubs[i + 1]) row.push(Markup.button.callback('📄 ' + coreSubs[i + 1], 'buy_pdf_' + coreSubs[i + 1]));
    kb.push(row);
  }
  kb.push([Markup.button.callback('🔙 Back to Main Menu', 'u_home')]);

  const msg =
    '📄 *A4 PRINTABLE OFFLINE QUESTION PAPER MODEL*\n' +
    '• कोचिंग व ऑफलाइन छात्रों को बांटने के लिए 50 प्रश्नों का 2-Column A4 पेपर\n' +
    '• साथ में *50-Question OMR Sheet* और *Answer Key*\n' +
    '• शुल्क: केवल *10 Telegram Stars* (PDF न खुलने पर Editable Text + Admin Support मुफ्त!)\n\n' +
    '👇 *जिस विषय का A4 मॉडल पेपर चाहिए उसे चुनें:*';

  if (ctx.callbackQuery) return safeEdit(ctx, msg, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, msg, Markup.inlineKeyboard(kb));
};

bot.command('pdf', (ctx) => renderPdfSubjectMenu(ctx));
bot.action('u_pdf_menu', (ctx) => renderPdfSubjectMenu(ctx));

bot.action(/^buy_pdf_(.+)$/, async (ctx) => {
  const sub = ctx.match[1];
  if (isMaster(ctx.from.id)) {
    await ctx.answerCbQuery('Admin Free Access: Generating A4 Paper...');
    return deliverOfflineTestPaper(ctx.chat?.id || ctx.from.id, sub, false);
  }
  await ctx.answerCbQuery('Sending 10 Stars Invoice...');
  return sendPdfStarsInvoice(ctx.chat?.id || ctx.from.id, sub);
});

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
    await pool.query('INSERT INTO users(telegram_id, username, first_name, referred_by, ref_credited) VALUES($1,$2,$3,$4,FALSE)', [uid, ctx.from.username || 'student', ctx.from.first_name || 'Student', refBy]).catch(() => {});
  } else {
    await pool.query('UPDATE users SET username=$2, first_name=$3 WHERE telegram_id=$1', [uid, ctx.from.username || 'student', ctx.from.first_name || 'Student']).catch(() => {});
  }

  const fsub = await checkTwoFSub(uid);
  if (!fsub.ok) {
    const btns: any[][] = fsub.missing.map(m => [Markup.button.url(m.title, m.link)]);
    btns.push([Markup.button.callback('✅ मैंने जॉइन कर लिया (Verify & Start)', 'verify_fsub')]);
    return safeSend(ctx.chat.id, '🔒 *अनिवार्य सूचना:*\nप्रोफेसर बॉट के सभी फीचर्स अनलॉक करने के लिए कृपया नीचे दिए गए दोनों ऑफिशियल ग्रुप और चैनल को सब्सक्राइब करें:', Markup.inlineKeyboard(btns));
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
  const r = await pool.query('SELECT wallet_balance, referral_count, last_cleared_at FROM users WHERE telegram_id=$1', [uid]);
  const u = r.rows[0] || { wallet_balance: 0, referral_count: 0, last_cleared_at: null };
  const refLink = 'https://t.me/' + botUser + '?start=ref_' + uid;

  const msg =
    '💰 *PROFESSOR REFER & EARN* 💰\n' +
    '• 🎁 *Reward:* ₹5/Refer | 🏦 *Min Withdraw:* ₹99 (UPI)\n' +
    '• 👥 *Current Referrals:* ' + (u.referral_count || 0) + ' | 💳 *Balance:* ₹' + (u.wallet_balance || 0) + '\n' +
    (u.last_cleared_at ? '• 🧹 *Last Paid & Reset:* ' + u.last_cleared_at + '\n' : '') +
    '\n🔗 *Your Link:* ' + refLink;

  const kb: any[][] = [
    [Markup.button.url('📲 Share Link on Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(refLink) + '&text=' + encodeURIComponent('🎓 रोज़ 15 घंटे फ्री लाइव टेस्ट दें और ₹100 Gift Card जीतें:'))],
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
  const r = await pool.query('SELECT wallet_balance FROM users WHERE telegram_id=$1', [uid]);
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
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const monthKey = ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0');
  const top = await pool.query('SELECT user_id, username, right_count, wrong_count, net_marks FROM monthly_scores WHERE month_key=$1 ORDER BY net_marks DESC LIMIT 10', [monthKey]).catch(() => ({ rows: [] }));
  let msg = '🏆 *MONTHLY TOP 10 (' + monthKey + ')* 🏆\n🎁 *1 Nov ₹100 Gift Card Leaderboard:*\n━━━━━━━━━━━━━━━━━━━━━\n\n';
  if (top.rows.length === 0) msg += 'अभी स्कोरबोर्ड खाली है।\n';
  else top.rows.forEach((r, i) => { msg += (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖' + (i + 1) + '.') + ' [' + r.username + '](tg://user?id=' + r.user_id + ') ➔ *' + Number(r.net_marks).toFixed(2) + ' Pts* (✅' + r.right_count + ' ❌' + r.wrong_count + ')\n'; });
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

bot.on('my_chat_member', async (ctx) => {
  try {
    const st = ctx.myChatMember.new_chat_member.status;
    const chat: any = ctx.myChatMember.chat;
    const adder = ctx.myChatMember.from;
    if (['group', 'supergroup', 'channel'].includes(chat.type) && ['administrator', 'member'].includes(st)) {
      const chatTitle = chat.title || 'Educational Chat';
      const approved = isMaster(adder.id) ? 'APPROVED' : 'PENDING';
      await pool.query('INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status) VALUES($1,$2,$3,$4,TRUE,$5) ON CONFLICT(chat_id) DO UPDATE SET title=$2, chat_type=$3, is_active=TRUE', [chat.id, chatTitle, chat.type, adder.id, approved]);
      await safeSend(
        chat.id,
        '🎓 *Professor AI Quiz Bot अब "' + chatTitle + '" से जुड़ चुका है!*\n' +
        (approved === 'APPROVED' ? '✅ *Status: Active!*' : '⏳ *30-Day Free Trial Request Sent to Admin!*'),
        Markup.inlineKeyboard([
          [Markup.button.callback('🙋‍♂️ Ready for Quiz (0/3)', 'ready_quiz_' + chat.id), Markup.button.callback('▶️ Start Live Quiz', 'gstart_' + chat.id)],
          [Markup.button.callback('🛑 Stop Quiz', 'pause_test_' + chat.id)]
        ])
      );
      if (ADMIN_ID && !isMaster(adder.id)) {
        await safeSend(
          ADMIN_ID,
          '🔔 *New Group/Channel Added!*\n📌 *' + chatTitle + '* (' + chat.id + ')\n👤 By: ' + (adder.first_name || 'User') + ' (' + adder.id + ')',
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approve 30d', 'adm_app_' + chat.id), Markup.button.callback('⭐ Grant 1 Yr', 'adm_yr_' + chat.id), Markup.button.callback('🚫 Block', 'adm_rej_' + chat.id)]
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
  await safeSend(cid, '🎉 *मास्टर एडमिन ने आपके ग्रुप/चैनल का 30 दिनों का फ्री ट्रायल अप्रूव कर दिया है!*');
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
  const approved = isMaster(ctx.from.id) ? 'APPROVED' : 'PENDING';
  await pool.query('INSERT INTO channels(chat_id, title, chat_type, owner_id, is_active, approval_status) VALUES($1,$2,$3,$4,TRUE,$5) ON CONFLICT(chat_id) DO UPDATE SET title=$2, owner_id=$4, is_active=TRUE', [ctx.chat.id, gTitle, ctx.chat.type, ctx.from.id, approved]);
  return safeSend(
    ctx.chat.id,
    '✅ *"' + gTitle + '" रजिस्टर हो गया है!*',
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋‍♂️ Ready for Quiz (0/3)', 'ready_quiz_' + ctx.chat.id), Markup.button.callback('▶️ Start Test Now', 'gstart_' + ctx.chat.id)],
      [Markup.button.callback('🛑 Stop Test', 'pause_test_' + ctx.chat.id)]
    ])
  );
});

bot.action('u_groups', async (ctx) => {
  const r = isMaster(ctx.from.id) ? await pool.query('SELECT * FROM channels ORDER BY title LIMIT 30') : await pool.query('SELECT * FROM channels WHERE owner_id=$1', [ctx.from.id]);
  if (r.rows.length === 0) return safeEdit(ctx, '📢 कोई ग्रुप/चैनल नहीं जुड़ा है।', Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'u_home')]]));
  const kb: any[][] = r.rows.map(g => [Markup.button.callback((g.is_active ? '🟢 ' : '🔴 ') + g.title + ' [' + g.approval_status + ']', 'gpanel_' + g.chat_id)]);
  kb.push([Markup.button.callback('🔙 Back', 'u_home')]);
  return safeEdit(ctx, '⚙️ *ग्रुप / चैनल चुनें:*', Markup.inlineKeyboard(kb));
});

const renderGroupPanel = async (ctx: any, chatId: number) => {
  const r = await pool.query('SELECT * FROM channels WHERE chat_id=$1', [chatId]);
  if (r.rows.length === 0) return;
  const g = r.rows[0];
  const perm = isGroupAllowedToPost(g);

  const txt =
    '⚙️ *Group Panel: ' + g.title + '*\n• 🆔 ID: ' + g.chat_id + ' | 👤 Owner: ' + (g.owner_id || 'N/A') + '\n' +
    '• 📡 Schedule: *' + (g.is_active ? 'ON 🟢' : 'OFF 🔴') + '* | 🛡 Status: *' + g.approval_status + '*\n' +
    '• 💳 Plan: *' + (perm.ok ? 'ACTIVE ✅' : 'LOCKED ❌') + '*\n' +
    '• ✍️ Header: *' + (g.custom_caption || 'Default') + '*';

  const kb: any[][] = [
    [Markup.button.callback('▶️ Start Test Now', 'gstart_' + chatId), Markup.button.callback('🛑 Stop Test', 'pause_test_' + chatId)],
    [Markup.button.callback(g.is_active ? '🔕 Schedule OFF' : '🔔 Schedule ON', 'gtog_' + chatId), Markup.button.callback('✍️ Custom Header', 'gcap_' + chatId)],
    [Markup.button.callback('⭐ Pay 100 Stars (1 Year Auto)', 'gpay_' + chatId)]
  ];
  if (isMaster(ctx.from.id)) {
    kb.push([Markup.button.callback('✅ Approve 30d', 'adm_app_' + chatId), Markup.button.callback('⭐ Grant 1 Yr', 'adm_yr_' + chatId), Markup.button.callback('🚫 Block', 'adm_rej_' + chatId)]);
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
bot.action(/^gpay_(-?\d+)$/, async (ctx) => { const cid = Number(ctx.match[1]); await ctx.answerCbQuery('Sending Invoice...'); return sendGroupStarsInvoice(ctx.chat?.id || ctx.from.id, cid); });

// Start Button: Admin starts immediately; normal users join the 3-player online lobby
bot.action(/^gstart_(-?\d+)$/, async (ctx) => {
  const cid = Number(ctx.match[1]);
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());

  if (isMaster(ctx.from.id)) {
    await ctx.answerCbQuery('👑 Admin Instant Start: ' + sub + ' Test शुरू हो रहा है!');
    return startHourlySubjectTest(cid, sub, 0, true);
  }

  const minCheckOn = (await getCfg('min_participants_enabled')) !== 'false';
  if (!minCheckOn) {
    await ctx.answerCbQuery('🚀 Starting ' + sub + ' Test!');
    return startHourlySubjectTest(cid, sub, 0, true);
  }

  let lobby = quizLobbies.get(cid);
  if (!lobby || Date.now() - lobby.updatedAt > 1800000) {
    lobby = { users: new Map<number, string>(), subject: sub, updatedAt: Date.now() };
    quizLobbies.set(cid, lobby);
  }
  const uName = (ctx.from.first_name || ctx.from.username || 'Student').replace(/[*_`[\]]/g, '').substring(0, 16);
  lobby.users.set(ctx.from.id, uName);
  lobby.updatedAt = Date.now();

  if (lobby.users.size >= 3) {
    quizLobbies.delete(cid);
    await ctx.answerCbQuery('🎉 3 ऑनलाइन छात्र तैयार! टेस्ट शुरू हो रहा है!');
    return startHourlySubjectTest(cid, sub, 0, true);
  }

  await ctx.answerCbQuery('🙋‍♂️ आप जुड़ गए (' + lobby.users.size + '/3)! ' + (3 - lobby.users.size) + ' और लोग बटन दबाएं!', { show_alert: true });
  return openThreePlayerLobby(cid, sub);
});

bot.action(/^pause_test_(-?\d+)$/, async (ctx) => { const cid = Number(ctx.match[1]); await stopTestInGroup(cid, true); await ctx.answerCbQuery('Test Paused!'); });

// =========================================================
// MASTER ADMIN PANEL (OWNER ONLY - PARALLEL FAST QUERIES)
// =========================================================
const renderAdmin = async (ctx: any) => {
  if (!isMaster(ctx.from?.id)) return ctx.reply('🔒 केवल बॉट मालिक के लिए। (ID: ' + ctx.from?.id + ')');

  const [uRes, gRes, qRes, fsubOn, minCfg, facOn] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users').catch(() => ({ rows: [{ count: 0 }] })),
    pool.query('SELECT COUNT(*) FROM channels WHERE is_active=TRUE').catch(() => ({ rows: [{ count: 0 }] })),
    pool.query('SELECT COUNT(*) FROM questions').catch(() => ({ rows: [{ count: 0 }] })),
    getCfg('fsub_enabled'),
    getCfg('min_participants_enabled'),
    getCfg('factory_on')
  ]);

  const uCnt = uRes.rows[0]?.count || 0;
  const gCnt = gRes.rows[0]?.count || 0;
  const qCnt = qRes.rows[0]?.count || 0;
  const minCheckOn = minCfg !== 'false';

  const txt =
    '👑 *PROFESSOR MASTER ADMIN PANEL (V6.4)* 👑\n' +
    '• 👥 Users: *' + uCnt + '* | 📢 Active Groups: *' + gCnt + '*\n' +
    '• 📚 Verified Question Bank: *' + qCnt + '*\n' +
    '• 📡 Seeder Status: ' + lastSeedReport + '\n' +
    '• 👥 3-User Ready Lobby: *' + (minCheckOn ? 'ON 🟢' : 'OFF 🔴') + '*\n' +
    '• 🔐 2-Channel Force Sub: *' + (fsubOn === 'true' ? 'ON 🟢' : 'OFF 🔴') + '*\n' +
    '• ⚡ Auto-Seeder Interval: *Every 60 Seconds 🟢*';

  const kb: any[][] = [
    [Markup.button.callback(minCheckOn ? '🔴 3-User Lobby: OFF' : '🟢 3-User Lobby: ON', 'adm_tog_min'), Markup.button.callback('⚡ Seed +15 Qs', 'adm_gen10'), Markup.button.callback('🚀 Turbo +45 Qs', 'adm_gen45')],
    [Markup.button.callback('📌 Pin Custom Message in Groups', 'adm_bcpin'), Markup.button.callback('📢 Normal Broadcast', 'adm_bc')],
    [Markup.button.callback('🌙 Post Daily Close Report Now', 'adm_daily_rep'), Markup.button.callback('📄 Generate Free A4 PDF', 'u_pdf_menu')],
    [Markup.button.callback('🎁 Edit ₹100 Gift Tagline', 'adm_gift'), Markup.button.callback('💌 Message Winner', 'adm_msg_win')],
    [Markup.button.callback('🔐 Set FSub 1', 'adm_fsub1'), Markup.button.callback('💬 Set FSub 2', 'adm_fsub2')],
    [Markup.button.callback(fsubOn === 'true' ? '🔴 FSub OFF' : '🟢 FSub ON', 'adm_tog_fsub'), Markup.button.callback(facOn === 'true' ? '⏸ Pause Seeder' : '▶️ Resume Seeder', 'adm_tog_fac')],
    [Markup.button.callback('🚀 Instant Start All Groups', 'adm_start_all'), Markup.button.callback('🛑 Stop All Tests', 'adm_stop_all')],
    [Markup.button.callback('⚙️ Manage Groups & Owners', 'u_groups'), Markup.button.callback('🔙 User Menu', 'u_home')]
  ];
  if (ctx.callbackQuery) return safeEdit(ctx, txt, Markup.inlineKeyboard(kb));
  return safeSend(ctx.chat.id, txt, Markup.inlineKeyboard(kb));
};

bot.command('admin', (ctx) => renderAdmin(ctx));
bot.action('adm_home', (ctx) => renderAdmin(ctx));

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
  await ctx.answerCbQuery('Seeding 15 Verified Questions...');
  isSeedingNow = false;
  const r = await generateQuestionsBatch();
  await safeSend(ctx.chat.id, r.ok ? '✅ *' + r.provider + '* से *' + r.sub + ' (' + r.topic + ')* के *+' + r.count + '* नए प्रश्न जुड़ गए!' : '❌ विफल: ' + r.error);
  return renderAdmin(ctx);
});

bot.action('adm_gen45', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  await ctx.answerCbQuery('Turbo Seeding 45 Questions in Background...');
  await safeSend(ctx.chat.id, '🚀 *Turbo Seeder चालू:* अगले 20 सेकंड में 3 अलग-अलग विषयों के +45 सवाल जोड़े जा रहे हैं...');
  (async () => {
    let totalAdded = 0;
    for (let i = 0; i < 3; i++) {
      isSeedingNow = false;
      const r = await generateQuestionsBatch();
      if (r.ok) totalAdded += r.count;
      await sleep(1500);
    }
    await safeSend(ctx.chat.id, '🎉 *Turbo Seed Complete:* डेटाबेस में कुल *+' + totalAdded + '* नए प्रश्न जुड़ गए!');
  })();
  return renderAdmin(ctx);
});

bot.action('adm_start_all', async (ctx) => {
  if (!isMaster(ctx.from.id)) return;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const sub = getSubjectForHour(ist.getUTCHours());
  const chs = await pool.query("SELECT chat_id FROM channels WHERE is_active=TRUE AND approval_status='APPROVED'").catch(() => ({ rows: [] }));
  for (const c of chs.rows) { startHourlySubjectTest(Number(c.chat_id), sub, 0, true); await sleep(350); }
  await ctx.answerCbQuery('Instant Started ' + sub + ' in ' + chs.rows.length + ' groups!', { show_alert: true });
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
        '⚠️ *PDF COMPLAINT RECEIVED*\n👤 User: ' + (ctx.from.first_name || 'Student') + ' (ID: ' + ctx.from.id + ')\n📘 Subject: ' + sub + '\n💬 Issue: ' + issue,
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
        '💸 *WITHDRAWAL REQUEST (₹' + bal + ')*\n👤 ' + (u.first_name || 'User') + ' (' + uid + ')\n🏦 UPI: *' + upiDetails + '*',
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

const launchBot = async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    setTimeout(() => { autoResumeOnServerBoot(); generateQuestionsBatch(); }, 3000);
    await bot.launch({ dropPendingUpdates: true });
    console.log('Professor AI Quiz Bot V6.4 Successfully Launched!');
  } catch (e: any) {
    console.error('Polling Error:', e?.message);
    setTimeout(launchBot, 6000);
  }
};

setTimeout(launchBot, 2000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
