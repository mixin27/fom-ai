/** Narrow source constraints, not a general phone/correction language parser. */
export function normalizeAiPhone(value: string): string {
  return value
    .replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040))
    .replace(/[\s().-]/g, '');
}

function numbers(line: string): string[] {
  return [
    ...new Set(
      (line.match(/\+?[0-9၀-၉][0-9၀-၉ \t().-]*[0-9၀-၉]/g) ?? [])
        .map(normalizeAiPhone)
        .filter((value) => /^\+?[0-9]{5,40}$/.test(value)),
    ),
  ];
}

type PhonePolicy = {
  status: 'unconstrained' | 'corrected' | 'ambiguous';
  allowedPhones: string[];
  correctionLine?: number;
};

const phoneLabel =
  /^(?:phone(?:\s+number)?|ph|mobile|telephone|contact\s+number|ဖုန်း(?:နံပါတ်)?)\s*[:：-]?\s*[+0-9၀-၉]/i;
const englishCorrection =
  /^(?:(?:correction|corrected|correct|new)\s*:?\s*phone(?:\s+number)?|phone(?:\s+number)?\s+correction)\s*[:：-]\s*\+?[0-9၀-၉][0-9၀-၉ \t().-]*[0-9၀-၉][.!]?$/i;
const myanmarCorrection = /^ဖုန်း(?:နံပါတ်)?(?:ကို)?(?:ပြင်ပါမယ်|ပြောင်းပါမယ်)/;
const questionOrCondition =
  /[?？]|\b(?:if|unless|maybe|perhaps)\b|ဆိုရင်|ရင်တော့/i;
const wrongPhone =
  /^(?:Correction:\s*)?(?:the\s+)?phone(?:\s+number)?(?:\s+above)?\s+is\s+(?:wrong|incorrect)[.!]?$/i;

export function analyzeAiPhoneSource(message: string): PhonePolicy {
  const lines = message.split(/\r?\n/);
  const values = lines.map(numbers);
  const all = [...new Set(values.flat())];
  // Do not mistake ordinary prices/product codes for competing phone numbers.
  // Unlabelled candidates are conservative domestic/international phone shapes.
  const candidates = values.map((phones, index) =>
    phones.filter(
      (phone) =>
        phoneLabel.test(lines[index].trim()) ||
        /^(?:0[0-9]{7,14}|\+[0-9]{7,15})$/.test(phone),
    ),
  );
  let correction: { line: number; phone: string } | undefined;
  let unresolvedAt = -1;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    const previous = lines[index - 1]?.trim() ?? '';
    if (wrongPhone.test(line)) unresolvedAt = index;
    const followsWrongPhone = wrongPhone.test(previous);
    const useInstead =
      followsWrongPhone &&
      /^Use\s+[+0-9၀-၉][0-9၀-၉ \t().-]*\s+instead[.!]?$/i.test(line);
    const myanmar = myanmarCorrection.test(line);
    const startsCorrection =
      englishCorrection.test(line) || myanmar || useInstead;
    if (!startsCorrection) continue;
    const supported =
      values[index].length === 1 &&
      !questionOrCondition.test(line) &&
      // The target must explicitly be requested, not merely mentioned as rejected.
      (!myanmar || /ကို(?:ပဲ)?(?:သုံးပေးပါ|ဆက်ပေးပါ)[။.!\s]*$/.test(line));
    if (supported) correction = { line: index, phone: values[index][0] };
    else unresolvedAt = index;
  }
  if (correction && unresolvedAt < correction.line) {
    const laterConflict = candidates
      .slice(correction.line + 1)
      .some((phones) => phones.some((phone) => phone !== correction.phone));
    if (!laterConflict)
      return {
        status: 'corrected',
        allowedPhones: [correction.phone],
        correctionLine: correction.line + 1,
      };
  }
  if (correction || unresolvedAt >= 0 || new Set(candidates.flat()).size > 1)
    return { status: 'ambiguous', allowedPhones: [] };
  return { status: 'unconstrained', allowedPhones: all };
}
