/**
 * Scam and Phishing Message Checker
 * ──────────────────────────────────
 * Fully client-side, rule-based analysis.
 * ZERO network requests — all matching runs in-memory.
 *
 * Scoring bands (per spec):
 *   60+   → "Likely scam"     (red)
 *   30–59 → "Be careful"      (amber)
 *   1–29  → "Not sure"        (grey)
 *   0     → "No red flags found" (teal) + disclaimer
 */

// ─── Hinglish / transliteration normaliser ────────────────────────────
// Maps common Hindi-transliterated words to English equivalents so
// regex patterns can match Hinglish messages.
const HINGLISH_MAP = {
  // Account / banking
  'khata': 'account', 'khate': 'account', 'bank khata': 'bank account',
  'paisa': 'money', 'paise': 'money', 'rupaye': 'money', 'rupay': 'money',
  'dhan': 'money',
  // Urgency
  'jaldi': 'immediately', 'turant': 'immediately', 'abhi': 'now',
  'foran': 'immediately', 'tatkaal': 'urgent',
  // Threats
  'band': 'blocked', 'block': 'blocked', 'suspend': 'suspended',
  'giraftar': 'arrested', 'gireftaar': 'arrested',
  'khatarnak': 'dangerous', 'khatre': 'danger',
  // Verification
  'jaanch': 'verify', 'janch': 'verify', 'satyanpan': 'verify',
  // Scam keywords
  'inam': 'prize', 'jeetna': 'won', 'jeeta': 'won', 'jeete': 'won',
  'inaam': 'prize', 'lucky draw': 'lucky draw',
  'nivesh': 'investment', 'munafa': 'profit', 'faayda': 'profit',
  'kamai': 'earning', 'kamaye': 'earn', 'kamao': 'earn',
  'bhejo': 'send', 'bhejiye': 'send', 'daale': 'deposit', 'daalo': 'deposit', 'jama': 'deposit',
  'video call': 'video call', 'screen share': 'screen share',
  'install karo': 'install', 'install kare': 'install', 'install karein': 'install',
  'link pe click': 'click link', 'click kare': 'click', 'click karo': 'click',
  'otp batao': 'share otp', 'otp bhejo': 'share otp', 'otp dijiye': 'share otp',
  'password batao': 'share password', 'pin batao': 'share pin',
};

/**
 * Normalise text for matching:
 * 1. Lowercase
 * 2. Collapse whitespace and special chars
 * 3. Replace common Hinglish words with English equivalents
 */
export function normaliseText(raw) {
  if (!raw) return '';
  let text = raw
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // zero-width chars
    .replace(/\s+/g, ' ')                      // collapse whitespace
    .trim();

  // Replace Hinglish tokens (longest match first)
  const sorted = Object.keys(HINGLISH_MAP).sort((a, b) => b.length - a.length);
  for (const hindi of sorted) {
    // word-boundary-safe replacement
    const re = new RegExp('\\b' + hindi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    text = text.replace(re, HINGLISH_MAP[hindi]);
  }

  return text;
}

// ─── Rules ────────────────────────────────────────────────────────────
// Each rule: { id, weight, pattern (RegExp), reason (plain-language) }
export const RULES = [
  // --- Original rules (kept & refined) ---
  {
    id: 'otp_password_request',
    weight: 35,
    pattern: /\b(enter|share|send|provide|give|reply with|verify with|confirm|batao|bhejo|dijiye)\b.*\b(otp|one[-\s]?time[-\s]?password|passcode|pin|cvv|cvc|security code|password|mpin)\b|\b(otp|one[-\s]?time[-\s]?password|passcode|pin|cvv|cvc|security code|password|mpin)\s+(required|needed|request|to proceed|to verify|batao|bhejo|dijiye)\b/i,
    reason: "Banks never ask for your OTP, PIN, CVV, or password. Do not share these with anyone."
  },
  {
    id: 'urgent_threat',
    weight: 25,
    pattern: /\b(account|card|access|service|sim|profile|wallet|khata)\s+(is\s+|will\s+be\s+|has\s+been\s+)?(blocked|suspended|deactivated|terminated|frozen|locked|restricted|disabled|canceled|cancelled|band)\b|\b(immediate|urgent|action required|within 24 hours|within \d+ hours|within \d+ minutes|final warning|last chance|jaldi|turant|tatkaal)\b/i,
    reason: "It uses urgent warnings or threats of account suspension to rush you into acting without thinking."
  },
  {
    id: 'fake_kyc',
    weight: 30,
    pattern: /\b(kyc|pan card|aadhaar|aadhar|id verification|identity verification|update your details|re-verify|unblock account)\b.*\b(https?:\/\/|www\.|\.link|\.xyz|\.top|\.click|\.me|\.online|\.site|\.live|bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|wa\.me|t\.me)\b|\b(https?:\/\/|www\.|\.link|\.xyz|\.top|\.click|\.me|\.online|\.site|\.live|bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|wa\.me|t\.me)\b.*\b(kyc|pan card|aadhaar|aadhar|id verification|identity verification|update your details|re-verify|unblock account)\b/i,
    reason: "It pressures you to complete urgent identity or KYC verification through an unverified link."
  },
  {
    id: 'prize_lottery',
    weight: 30,
    pattern: /\b(congratulations|won|winner|lottery|lucky draw|cash prize|jackpot|reward|gift card|selected to receive|free gift|claim your reward|claim your prize|inam|jeeta|jeete|jeetna)\b/i,
    reason: "It claims you won a prize, lottery, or reward for a contest you likely never entered."
  },
  {
    id: 'fee_to_receive_money',
    weight: 30,
    pattern: /\b(pay|transfer|deposit|send)\s+(a\s+)?(small\s+|nominal\s+|advance\s+|processing\s+|registration\s+|delivery\s+|customs\s+|clearance\s+|activation\s+|service\s+)?(fee|charge|amount|tax|deposit|cost)\s+(to\s+receive|to\s+claim|to\s+release|to\s+get|for\s+processing|before\s+receiving)\b|\b(processing|registration|clearance|delivery|activation)\s+fee\b/i,
    reason: "It asks you to pay an upfront fee or tax before you can receive promised money or goods."
  },
  {
    id: 'bank_govt_impersonation',
    weight: 25,
    pattern: /\b(income tax|irs|hmrc|central bank|rbi|reserve bank|federal reserve|fbi|police|customs department|social security|sbi|hdfc|icici|axis bank|wells fargo|chase bank|bank of america|paypal security|amazon security|apple support|microsoft support|cbi|enforcement directorate)\b/i,
    reason: "It mentions a well-known bank, government agency, or tech company to appear official and gain your trust."
  },
  {
    id: 'shortened_suspicious_link',
    weight: 20,
    pattern: /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|ow\.ly|tiny\.cc|wa\.me|t\.me|chat\.whatsapp\.com)\b|\bhttps?:\/\/[^\s/$.?#].[^\s]*\.(xyz|top|club|work|click|link|loan|gq|cf|tk|ml|ga|site|online|live|vip|buzz|rest|fit|surf)\b/i,
    reason: "It contains a shortened or suspicious web link designed to hide the true destination."
  },
  {
    id: 'app_install_remote_access',
    weight: 35,
    pattern: /\b(install|download|sideload)\s+(an?\s+)?(app|application|apk|tool|software|extension)\b|\b(anydesk|teamviewer|rustdesk|quicksupport|screenshare|screen share|share your screen|remote access|remote desktop)\b/i,
    reason: "It asks you to install an application or share your screen, which can give attackers full control of your device."
  },
  {
    id: 'delivery_package_scam',
    weight: 20,
    pattern: /\b(package|parcel|shipment|courier|delivery|fedex|ups|dhl|usps|postal|india post)\s+(could not be delivered|is on hold|failed delivery|address incorrect|pending delivery|update address)\b/i,
    reason: "It claims a package cannot be delivered to trick you into updating personal details or paying redelivery fees."
  },
  {
    id: 'unauthorized_transaction_alert',
    weight: 25,
    pattern: /\b(unauthorized|suspicious|unrecognized)\s+(transaction|charge|purchase|payment|login|activity)\b|\b(did you authorize|if not you|cancel this transaction|if you did not make this)\b/i,
    reason: "It fakes an alert about an unauthorized transaction to frighten you into calling a fake helpline or clicking a link."
  },
  {
    id: 'secret_code_qr_request',
    weight: 30,
    pattern: /\b(scan\s+(this\s+)?(qr|qr\s*code)|send\s+screenshot|keep this (confidential|secret)|tell no one|share this code with our agent)\b/i,
    reason: "It asks you to scan a QR code or keep the communication secret from family and bank staff."
  },
  {
    id: 'crypto_giftcard_payment',
    weight: 30,
    pattern: /\b(pay|send|buy|purchase)\s+(with|via|using)?\s*(bitcoin|crypto|usdt|eth|gift\s*card|itunes\s*card|steam\s*card|google\s*play\s*card|target\s*gift\s*card|apple\s*gift\s*card)\b/i,
    reason: "It demands payment via cryptocurrency or gift cards, which are untraceable and cannot be refunded."
  },
  {
    id: 'friend_family_emergency',
    weight: 25,
    pattern: /\b(hi mum|hi dad|hello mom|hello dad|lost my phone|this is my new number|hospital emergency|arrested|need money urgently|stranded)\b/i,
    reason: "It impersonates a family member in distress claiming they lost their phone and urgently need money."
  },

  // --- NEW: Investment scam rules (76% of India cyber fraud in 2025) ---
  {
    id: 'investment_guaranteed_returns',
    weight: 35,
    pattern: /\b(guaranteed\s+returns?|assured\s+returns?|100%\s+profit|risk[\s-]?free\s+(profit|returns?|investment|income)|double\s+your\s+(money|investment)|triple\s+your\s+(money|investment)|earn\s+\d+%?\s*(daily|weekly|monthly|per\s+day)|very\s+high\s+returns?|minimum\s+returns?\s+of\s+\d+%|earning\s+guaranteed|guaranteed\s+(earning|income|profit|munafa|kamai)|daily\s+\d+\s*(ki|ka)?\s*(earning|kamai|income))\b/i,
    reason: "No legitimate investment guarantees fixed high returns. This is a classic investment fraud pattern."
  },
  {
    id: 'investment_trading_group',
    weight: 30,
    pattern: /\b(join\s+(our|this|my|the)\s+(trading|stock[\s-]?tip|investment|forex|crypto)\s+(group|channel|club|community)|whatsapp\s+(trading|investment|stock)\s+group|telegram\s+(trading|investment|stock)\s+(group|channel)|stock\s+tip\s+group|free\s+trading\s+(tips|signals)|insider\s+tips?|trading\s+group\s+(mein|me|mai|join|aa\s+jao)|investment\s+group\s+(mein|join|aa)|mere\s+trading\s+group)\b/i,
    reason: "Scammers recruit victims into fake trading or stock-tip groups on WhatsApp and Telegram."
  },
  {
    id: 'investment_crypto_doubling',
    weight: 35,
    pattern: /\b(send\s+\d+\s*(btc|eth|usdt|crypto)|crypto\s+doubling|double\s+your\s+(btc|eth|crypto|bitcoin)|send\s+(bitcoin|ethereum|crypto)\s+(and|to)\s+(get|receive)\s+(double|2x|3x)|airdrop\s+scam|free\s+(bitcoin|crypto|eth)\b)/i,
    reason: "No one can double your cryptocurrency. This is a well-known crypto doubling scam."
  },
  {
    id: 'investment_unknown_group',
    weight: 25,
    pattern: /\b(added\s+you\s+to|you\s+have\s+been\s+added|welcome\s+to\s+(the\s+)?(investment|trading|profit|earning)\s+(group|channel))\b|\b(investment\s+opportunity|exclusive\s+investment|limited\s+slots?|only\s+\d+\s+seats?\s+left)\b/i,
    reason: "Being added to unknown investment groups is a common tactic used by investment scammers."
  },

  // --- NEW: Digital-arrest scam rules ---
  {
    id: 'digital_arrest_agency',
    weight: 35,
    pattern: /\b(cbi|central\s+bureau\s+of\s+investigation|enforcement\s+directorate|\bed\b|narcotics\s+control|customs\s+(department|officer|authority)|cyber\s+crime\s+(cell|branch|department|police)|income\s+tax\s+(raid|notice|department))\s*(case|notice|warrant|investigation|complaint|summons)?\b|\b(arrest\s+warrant|non[\s-]?bailable\s+warrant|fir\s+filed|fir\s+registered|case\s+registered)\b/i,
    reason: "Law enforcement agencies do not call or message you to threaten arrest. This is a digital-arrest scam."
  },
  {
    id: 'digital_arrest_video_call',
    weight: 35,
    pattern: /\b(stay\s+on\s+(the\s+)?(video\s+)?call|do\s+not\s+(disconnect|hang\s+up|cut\s+the\s+call)|remain\s+on\s+(the\s+)?call|video\s+call\s+(verification|investigation|interrogation)|appear\s+before\s+(the\s+)?(officer|judge|magistrate)\s+(on|via)\s+(video|skype|zoom))\b/i,
    reason: "Real police never interrogate via video call or ask you to stay on the line for hours. This is a digital-arrest scam."
  },
  {
    id: 'digital_arrest_transfer_verify',
    weight: 35,
    pattern: /\b(transfer\s+(money|funds|amount)\s+(to\s+)?(verify|safe\s+account|rbi\s+account|government\s+account|escrow)|move\s+your\s+(money|funds)\s+to\s+(a\s+)?(safe|secure|verified)\s+account|your\s+(money|account)\s+(is\s+)?(under\s+investigation|linked\s+to\s+(money\s+laundering|terrorism|drug|hawala)))\b/i,
    reason: "No government agency asks you to transfer money to 'verify' or to a 'safe account'. This is a digital-arrest scam."
  },

  // --- Generic link (low weight, kept for coverage) ---
  {
    id: 'suspicious_link_generic',
    weight: 10,
    pattern: /\bhttps?:\/\/[^\s]+\.(com|org|net|io|co|in|ai)\/[^\s]+/i,
    reason: "It contains a link prompting you to visit an external website. Verify the sender before clicking."
  }
];

// ─── Verdict colours ──────────────────────────────────────────────────
export const VERDICT_COLORS = {
  'Likely scam':       { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', badge: '#dc2626' },  // red
  'Be careful':        { bg: '#fffbeb', border: '#fcd34d', text: '#b45309', badge: '#d97706' },  // amber
  'Not sure':          { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280', badge: '#6b7280' },  // grey
  'No red flags found': { bg: '#f0fdfa', border: '#5eead4', text: '#0f766e', badge: '#0d9488' }  // teal
};

/**
 * Checks a text message for potential scam and phishing indicators.
 *
 * Thresholds per spec:
 *   score >= 60 → "Likely scam"
 *   score 30–59 → "Be careful"
 *   score 1–29  → "Not sure"
 *   score 0     → "No red flags found"
 *
 * @param {string} text
 * @returns {{ verdict: string, score: number, matchedRules: Array<{id: string, reason: string, weight: number}> }}
 */
export function checkMessage(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      verdict: 'No red flags found',
      score: 0,
      matchedRules: [],
      reasons: []
    };
  }

  // Normalise for better matching (handles Hinglish too)
  const normalised = normaliseText(text);
  const matchedRules = [];
  let rawScore = 0;

  for (const rule of RULES) {
    // Test against both the original and normalised text
    if (rule.pattern.test(text) || rule.pattern.test(normalised)) {
      matchedRules.push({ id: rule.id, reason: rule.reason, weight: rule.weight });
      rawScore += rule.weight;
    }
  }

  // Cap the score at 100
  const score = Math.min(100, rawScore);

  let verdict;
  if (score >= 60) {
    verdict = 'Likely scam';
  } else if (score >= 30) {
    verdict = 'Be careful';
  } else if (score >= 1) {
    verdict = 'Not sure';
  } else {
    verdict = 'No red flags found';
  }

  return {
    verdict,
    score,
    matchedRules,
    // Keep backward-compatible reasons array
    reasons: matchedRules.map(r => r.reason)
  };
}
