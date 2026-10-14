/** A finite vocabulary for source-grounded Myanmar quantities, not translation. */
const words: Record<string, number> = {
  တစ်: 1,
  နှစ်: 2,
  သုံး: 3,
  လေး: 4,
  ငါး: 5,
  ခြောက်: 6,
  ခုနစ်: 7,
  ရှစ်: 8,
  ကိုး: 9,
  ဆယ်: 10,
};
export const myanmarCount =
  '(?:[0-9၀-၉]+|တစ်|နှစ်|သုံး|လေး|ငါး|ခြောက်|ခုနစ်|ရှစ်|ကိုး|ဆယ်)';
export const myanmarUnit = '(?:ထည်|ထုပ်|အုပ်|လုံး|ဘူး|ဗူး|ရံ|ခု)';
export function aiQuantity(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040));
  const token = new RegExp(`^(${myanmarCount})\\s*(?:${myanmarUnit})?$`).exec(
    normalized,
  )?.[1];
  if (!token) return null;
  const count = words[token] ?? Number(token);
  return Number.isSafeInteger(count) && count >= 1 && count <= 10000
    ? count
    : null;
}

// Only complete colour allocations are understood. Alternatives and unexplained
// trailing text deliberately fail; a mention of a colour is not an order item.
export function aiVariantAllocations(
  line: string,
): { variant: string; qty: number; unit: string }[] | null {
  const pattern = new RegExp(
    `^(အဖြူ(?:ရောင်)?|အနက်(?:ရောင်)?|အနီ(?:ရောင်)?|အပြာ(?:ရောင်)?|အစိမ်း(?:ရောင်)?|အဝါ(?:ရောင်)?|ပန်းရောင်)\\s*(${myanmarCount})\\s*(${myanmarUnit})(?:\\s+|(?=ပါ[။.!]*$)|$)`,
  );
  let remaining = line
    .trim()
    .replace(/ပါ[။.!]*$/, '')
    .trim();
  const values: { variant: string; qty: number; unit: string }[] = [];
  while (remaining) {
    const match = pattern.exec(remaining);
    if (!match) return null;
    const qty = aiQuantity(match[2]);
    if (qty === null) return null;
    values.push({ variant: match[1], qty, unit: match[3] });
    remaining = remaining.slice(match[0].length).trim();
  }
  return values.length >= 2 &&
    values.length <= 20 &&
    new Set(values.map((v) => v.variant)).size === values.length
    ? values
    : null;
}

// A whole, unconditional replacement directive. State/old-value validation
// happens in the complete-message policy before constraining model output.
export function aiQuantityCorrection(
  line: string,
): { before: number; after: number; unit: string } | null {
  const match = new RegExp(
    `^(?:အဲ\\s*)?(?:မင်မင်\\s*)?(${myanmarCount})\\s*(${myanmarUnit})မဟုတ်ဘူး\\s*(${myanmarCount})\\s*(${myanmarUnit})လုပ်ပေးပါ(?:နော်)?[။.!]*$`,
  ).exec(line.trim());
  if (!match || match[2] !== match[4]) return null;
  const before = aiQuantity(match[1]),
    after = aiQuantity(match[3]);
  return before !== null && after !== null
    ? { before, after, unit: match[2] }
    : null;
}

export function aiWordQuantitySupported(quote: string, value: number): boolean {
  if (aiQuantityCorrection(quote)?.after === value) return true;
  const labelled = /^(?:qty|quantity|အရေအတွက်)\s*[:：]\s*(.+)$/i.exec(
    quote.trim(),
  );
  if (labelled && aiQuantity(labelled[1]) === value) return true;
  const allocation = aiVariantAllocations(quote);
  if (allocation?.some((v) => v.qty === value)) return true;
  const order = new RegExp(
    `(?:^|\\s)(${myanmarCount})\\s*${myanmarUnit}(?:ယူ(?:ပါ)?မယ်|လိုချင်ပါတယ်)(?:နော်)?[။.!\\s]*$`,
  ).exec(quote.trim());
  return !!order && aiQuantity(order[1]) === value;
}

// Require the amount immediately following the per-unit phrase. A later total
// on the same line must not gain unit-price status merely by sharing evidence.
export function aiMyanmarUnitPriceSupported(
  quote: string,
  value: number,
): boolean {
  const pattern = new RegExp(
    `တစ်${myanmarUnit}(?:ဈေး|စျေး|လျှင်)?\\s*[:：]?\\s*([0-9၀-၉]+(?:,[0-9၀-၉]{3})*)(?![0-9၀-၉,.])`,
    'g',
  );
  return [...quote.matchAll(pattern)].some(
    (match) =>
      Number(
        match[1]
          .replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040))
          .replace(/,/g, ''),
      ) === value,
  );
}
