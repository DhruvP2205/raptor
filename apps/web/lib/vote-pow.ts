// Client half of Module 11's invisible proof-of-work vote gate (backend:
// apps/api/src/voting/pow-captcha.service.ts). design/11-voting.md
// Section 2 — "invisible proof-of-work resolves automatically in the
// background (no visible UI for this at all)."

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Must match pow-captcha.service.ts's countLeadingZeroBits bit-for-bit
// — both sides need to agree on what counts as "solved."
function countLeadingZeroBits(hex: string): number {
  let bits = 0;
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    bits += Math.clz32(nibble) - 28;
    break;
  }
  return bits;
}

export async function solveProofOfWork(challenge: string, difficultyBits: number): Promise<string> {
  let nonce = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const digest = await sha256Hex(`${challenge}:${nonce}`);
    if (countLeadingZeroBits(digest) >= difficultyBits) return String(nonce);
    nonce += 1;
  }
}
