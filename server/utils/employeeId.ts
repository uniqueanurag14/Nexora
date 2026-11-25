/**
 * Dynamic Company Prefix & Sequential Employee ID Generator
 * Derives a deterministic 3-character uppercase prefix from the active company name
 * and produces sequential IDs: <PREFIX>-001 .. <PREFIX>-999 .. <PREFIX>-1000 .. <PREFIX>-10000+
 */

const EXCLUDED_STOP_WORDS = new Set([
  'and',
  'of',
  'the',
  'for',
  'in',
  'at',
  'by',
  'to',
  'on',
  'with',
  'pvt',
  'private',
  'ltd',
  'limited',
  'llp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'llc',
  'plc',
  'gmbh',
]);

/**
 * Split a company name into meaningful word tokens:
 * - Inserts spaces before CamelCase boundaries (e.g. "FunZoo" -> "Fun Zoo")
 * - Normalizes punctuation and delimiters
 * - Filters out connector and legal suffix stop-words
 */
export function extractMeaningfulWords(companyName: string): string[] {
  const cleaned = String(companyName || '').trim();
  if (!cleaned) return [];

  // Split CamelCase boundaries (e.g., FunZoo -> Fun Zoo, ToyBiz -> Toy Biz)
  const deCamelCased = cleaned
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  const rawTokens = deCamelCased
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = rawTokens.filter(
    (token) => !EXCLUDED_STOP_WORDS.has(token.toLowerCase())
  );

  return meaningful.length > 0 ? meaningful : rawTokens;
}

/**
 * Generate a 3-character uppercase prefix from the first 3 meaningful words
 * of the active company name.
 * Example:
 *  - "Fun Zoo Toys Jewar, Uttar Pradesh" -> "FZT"
 *  - "FunZoo Toys Jewar, Uttar Pradesh"  -> "FZT"
 */
export function extractCompanyPrefix(companyName: string): string {
  const words = extractMeaningfulWords(companyName);
  if (words.length === 0) return 'EMP';

  let chars: string[] = [];
  for (const w of words) {
    if (chars.length >= 3) break;
    const first = w.charAt(0).toUpperCase();
    if (/[A-Z0-9]/.test(first)) {
      chars.push(first);
    }
  }

  // If fewer than 3 meaningful words, fill remaining prefix characters from words in order
  if (chars.length < 3) {
    for (const w of words) {
      for (let i = 1; i < w.length && chars.length < 3; i++) {
        const ch = w.charAt(i).toUpperCase();
        if (/[A-Z0-9]/.test(ch)) {
          chars.push(ch);
        }
      }
      if (chars.length >= 3) break;
    }
  }

  while (chars.length < 3) {
    chars.push('X');
  }

  return chars.slice(0, 3).join('');
}

/**
 * Formats an integer sequence cleanly:
 * - 1..999 -> 001..999
 * - 1000+  -> 1000, 9999, 10000 (no artificial truncation)
 */
export function formatEmployeeId(prefix: string, sequence: number): string {
  const cleanPrefix = (prefix || 'EMP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'EMP';
  const safeSeq = Math.max(1, Math.floor(sequence));
  const numPart = safeSeq < 1000 ? String(safeSeq).padStart(3, '0') : String(safeSeq);
  return `${cleanPrefix}-${numPart}`;
}

/**
 * Computes the next sequential Employee ID for the given company name
 * by inspecting all existing registered employee IDs matching the company prefix.
 */
export function computeNextEmployeeId(
  companyName: string,
  existingEmpIds: string[]
): {
  company_name: string;
  prefix: string;
  sequence: number;
  next_emp_id: string;
} {
  const prefix = extractCompanyPrefix(companyName);
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  const usedNumbers = new Set<number>();
  let maxSeq = 0;

  for (const rawId of existingEmpIds || []) {
    if (!rawId) continue;
    const match = String(rawId).trim().match(pattern);
    if (match && match[1]) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > 0) {
        usedNumbers.add(seq);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  }

  let nextSeq = maxSeq + 1;
  while (usedNumbers.has(nextSeq)) {
    nextSeq++;
  }

  return {
    company_name: companyName,
    prefix,
    sequence: nextSeq,
    next_emp_id: formatEmployeeId(prefix, nextSeq),
  };
}
