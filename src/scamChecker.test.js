/**
 * Scam Checker Test Suite
 * ───────────────────────
 * Tests the scamChecker against:
 *  - 10 scam-style messages (should flag as "Likely scam" or "Be careful")
 *  - 10 normal messages (should pass as "No red flags found" or "Not sure")
 *
 * Run with: node --experimental-vm-modules src/scamChecker.test.js
 * Or:       npx vite-node src/scamChecker.test.js
 */

import { checkMessage } from './scamChecker.js';

export const SCAM_MESSAGES = [
  {
    id: 'scam-1',
    type: 'Scam',
    description: 'Bank KYC suspended with bit.ly link',
    expected: 'Likely scam',
    text: 'Dear Customer, your SBI account has been suspended due to incomplete KYC. Update immediately at https://bit.ly/sbi-kyc-update to avoid permanent deactivation.'
  },
  {
    id: 'scam-2',
    type: 'Scam',
    description: 'Fake lottery / cash prize asking for fee',
    expected: 'Likely scam',
    text: 'Congratulations! You won $500,000 in the International Mobile Lucky Draw. Pay registration fee of $150 to claim your prize. Contact agent at win@lottery.xyz'
  },
  {
    id: 'scam-3',
    type: 'Scam',
    description: 'OTP phishing with urgent threat',
    expected: 'Likely scam',
    text: 'URGENT: Your Chase bank account was logged in from Moscow. To cancel this transaction, share your 6-digit OTP passcode immediately.'
  },
  {
    id: 'scam-4',
    type: 'Scam',
    description: 'Tech support asking for AnyDesk remote access',
    expected: 'Likely scam',
    text: 'Microsoft Support: Severe Trojan virus detected on your computer. Install AnyDesk and share your screen with our engineer to clean your PC.'
  },
  {
    id: 'scam-5',
    type: 'Scam',
    description: 'USPS package delivery failure with suspicious link',
    expected: 'Likely scam',
    text: 'USPS Notice: Your package could not be delivered due to incomplete address. Update address and pay $1.50 redelivery fee at https://usps-redelivery.top/track'
  },
  {
    id: 'scam-6',
    type: 'Scam',
    description: 'Investment scam — guaranteed returns on WhatsApp group',
    expected: 'Likely scam',
    text: 'Join our trading group on WhatsApp! Guaranteed returns of 30% monthly. Our expert traders manage your crypto investment. Risk-free profit! wa.me/9199887766'
  },
  {
    id: 'scam-7',
    type: 'Scam',
    description: 'Digital arrest scam — CBI threat',
    expected: 'Likely scam',
    text: 'This is CBI Cyber Crime Branch. Your Aadhaar is linked to money laundering case. Stay on video call for investigation. Transfer ₹50,000 to verify your account immediately or arrest warrant will be issued.'
  },
  {
    id: 'scam-8',
    type: 'Scam',
    description: 'Crypto doubling scam',
    expected: 'Likely scam',
    text: 'Invest with Binance certified traders! Deposit $500 in crypto and double your money within 24 hours. Risk-free profit guaranteed. Register at http://crypto-boom.xyz'
  },
  {
    id: 'scam-9',
    type: 'Scam',
    description: 'Digital arrest — ED customs + video call',
    expected: 'Likely scam',
    text: 'Enforcement Directorate notice: A parcel in your name at customs contains illegal items. Do not disconnect this call. Appear before the officer on video call. FIR registered against you.'
  },
  {
    id: 'scam-10',
    type: 'Scam',
    description: 'Hinglish investment scam',
    expected: 'Be careful',
    text: 'Bhai mere trading group mein aa jao, daily 5000 ki kamai guaranteed hai. Nivesh karo aur munafa kamao. Link pe click karo: bit.ly/trading-profits'
  }
];

export const NORMAL_MESSAGES = [
  {
    id: 'norm-1',
    type: 'Normal',
    description: 'Real OTP for login (with safety reminder)',
    expected: 'No red flags found',
    text: '482910 is your Uber verification code. Never share this code with anyone. Uber will never call or message to ask for it.'
  },
  {
    id: 'norm-2',
    type: 'Normal',
    description: 'Legitimate bank debit transaction notification',
    expected: 'No red flags found',
    text: 'Your a/c no. XX3948 is debited for USD 24.50 on 12-Oct at Starbucks Store #4102. Available balance: USD 1,420.30.'
  },
  {
    id: 'norm-3',
    type: 'Normal',
    description: 'Real package out for delivery (Amazon)',
    expected: 'No red flags found',
    text: 'Amazon: Your package with order #112-4928192 is out for delivery today and will arrive by 8 PM.'
  },
  {
    id: 'norm-4',
    type: 'Normal',
    description: 'Appointment reminder from doctor',
    expected: 'No red flags found',
    text: 'Reminder: You have an appointment with Dr. Smith at City Health Clinic tomorrow, Tuesday at 10:30 AM. Reply C to confirm or R to reschedule.'
  },
  {
    id: 'norm-5',
    type: 'Normal',
    description: 'Food delivery status update',
    expected: 'No red flags found',
    text: 'Your DoorDash driver Carlos is approaching with your order from Chipotle. Enjoy your meal!'
  },
  {
    id: 'norm-6',
    type: 'Normal',
    description: 'Airline flight boarding update',
    expected: 'No red flags found',
    text: 'Delta Flight DL184 to Seattle is now boarding at Gate B22. Please have your boarding pass ready.'
  },
  {
    id: 'norm-7',
    type: 'Normal',
    description: 'Credit card bill generated notice',
    expected: 'No red flags found',
    text: 'Dear Customer, your credit card statement for ending 4012 is generated. Minimum amount due: $45.00 by Nov 15th.'
  },
  {
    id: 'norm-8',
    type: 'Normal',
    description: 'Casual personal chat message',
    expected: 'No red flags found',
    text: 'Hey! Are we still on for dinner tonight at 7? Let me know if you want me to pick you up.'
  },
  {
    id: 'norm-9',
    type: 'Normal',
    description: 'School closure notification',
    expected: 'No red flags found',
    text: 'Greenwood School District: All schools will be closed tomorrow due to heavy snowfall and icy roads.'
  },
  {
    id: 'norm-10',
    type: 'Normal',
    description: 'Hotel booking confirmation',
    expected: 'No red flags found',
    text: 'Thank you for booking with Marriott Marquis. Your reservation #849204 for Oct 20-22 is confirmed. Check-in is at 3:00 PM.'
  }
];

// ─── Test runner ──────────────────────────────────────────────────────
function runTest() {
  console.log('='.repeat(70));
  console.log('SCAM CHECKER TEST SUITE');
  console.log('='.repeat(70));

  const results = [];

  console.log('\n--- PART 1: 10 SCAM MESSAGES ---');
  let scamCorrect = 0;
  for (const item of SCAM_MESSAGES) {
    const res = checkMessage(item.text);
    const isDetected = res.verdict === 'Likely scam' || res.verdict === 'Be careful';
    const pass = isDetected ? '✅ PASS' : '❌ MISS';
    if (isDetected) scamCorrect++;

    results.push({
      id: item.id,
      type: item.type,
      description: item.description,
      expected: item.expected,
      actual: res.verdict,
      score: res.score,
      pass: isDetected
    });

    console.log(`\n[${item.id}] ${item.description}`);
    console.log(`  Expected: ${item.expected}`);
    console.log(`  Actual:   ${res.verdict} (Score: ${res.score}/100) ${pass}`);
    if (res.reasons.length > 0) {
      res.reasons.forEach(r => console.log(`    ↳ ${r}`));
    }
  }

  console.log('\n--- PART 2: 10 NORMAL MESSAGES ---');
  let normalCorrect = 0;
  let falseAlarms = 0;
  for (const item of NORMAL_MESSAGES) {
    const res = checkMessage(item.text);
    const isClean = res.verdict === 'No red flags found' || res.verdict === 'Not sure';
    const isFalseAlarm = res.verdict === 'Likely scam' || res.verdict === 'Be careful';
    if (isClean) normalCorrect++;
    if (isFalseAlarm) falseAlarms++;

    const pass = isClean ? '✅ PASS' : '⚠️ FALSE POSITIVE';

    results.push({
      id: item.id,
      type: item.type,
      description: item.description,
      expected: item.expected,
      actual: res.verdict,
      score: res.score,
      pass: isClean
    });

    console.log(`\n[${item.id}] ${item.description}`);
    console.log(`  Expected: ${item.expected}`);
    console.log(`  Actual:   ${res.verdict} (Score: ${res.score}/100) ${pass}`);
    if (res.reasons.length > 0) {
      res.reasons.forEach(r => console.log(`    ↳ ${r}`));
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Scams detected:          ${scamCorrect} / ${SCAM_MESSAGES.length}`);
  console.log(`Legitimate passed clean: ${normalCorrect} / ${NORMAL_MESSAGES.length}`);
  console.log(`False alarms:            ${falseAlarms} / ${NORMAL_MESSAGES.length}`);
  console.log('');

  // Print table for the report
  console.log('| ID | Type | Description | Expected | Actual | Score | Result |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.type} | ${r.description} | ${r.expected} | ${r.actual} | ${r.score} | ${r.pass ? '✅' : '❌'} |`);
  }
}

runTest();
