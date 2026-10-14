import type { LineInfo } from './order-message-parser.types';

type TownshipAlias = {
  canonical: string;
  variants: string[];
};

const TOWNSHIP_ALIASES: TownshipAlias[] = [
  {
    canonical: 'Sanchaung',
    variants: ['sanchaung', 'san chaung', 'စမ်းချောင်း'],
  },
  { canonical: 'Hlaing', variants: ['hlaing', 'လှိုင်'] },
  { canonical: 'Kamayut', variants: ['kamayut', 'kamyut', 'ကမာရွတ်'] },
  { canonical: 'Mayangone', variants: ['mayangone', 'mayangon', 'မရမ်းကုန်း'] },
  { canonical: 'Insein', variants: ['insein', 'အင်းစိန်'] },
  { canonical: 'Tarmwe', variants: ['tarmwe', 'tamwe', 'တာမွေ'] },
  {
    canonical: 'Thingangyun',
    variants: ['thingangyun', 'thingangyone', 'သင်္ဃန်းကျွန်း'],
  },
  {
    canonical: 'South Okkalapa',
    variants: ['south okkalapa', 's okkalapa', 'south okk', 'တောင်ဥက္ကလာပ'],
  },
  {
    canonical: 'North Okkalapa',
    variants: ['north okkalapa', 'n okkalapa', 'north okk', 'မြောက်ဥက္ကလာပ'],
  },
  { canonical: 'Yankin', variants: ['yankin', 'ရန်ကင်း'] },
  { canonical: 'Bahan', variants: ['bahan', 'ဗဟန်း'] },
  { canonical: 'Ahlone', variants: ['ahlone', 'alon', 'အလုံ'] },
  { canonical: 'Lanmadaw', variants: ['lanmadaw', 'လမ်းမတော်'] },
  { canonical: 'Latha', variants: ['latha', 'လသာ'] },
  { canonical: 'Pazundaung', variants: ['pazundaung', 'ပုဇွန်တောင်'] },
  { canonical: 'Kyauktada', variants: ['kyauktada', 'ကျောက်တံတား'] },
  { canonical: 'Botahtaung', variants: ['botahtaung', 'ဗိုလ်တထောင်'] },
];

const ADDRESS_TOKEN_PATTERN =
  /(?:street|st\b|road|rd\b|lane|house|no\.?|block|floor|room|ward|near|opposite|behind|apt|apartment|yangon|myanmar|လမ်း|အိမ်|အမှတ်|ရပ်ကွက်|အနီး|တိုက်|အခန်း|ရန်ကုန်)/i;

const ITEM_LINE_PATTERN =
  /^(?:\d+\s*(?:x|pcs?|pc|pieces?|qty|ခု|ထည်|set)\b|.+\s+x\s*\d+\s+[0-9][0-9,]*(?:\.\d+)?\s*[kK]?(?:\s*(?:mmk|ks|kyats?|ကျပ်))?$|.+\s+\d+\s*(?:pcs?|pc|qty|ခု|ထည်|set)\s+[0-9][0-9,]*(?:\.\d+)?\s*[kK]?(?:\s*(?:mmk|ks|kyats?|ကျပ်))?$)/i;

const ORDER_FIELD_PATTERN =
  /^(?:customer\s+name|customer\s*name|name|customer|fb\s*name|နာမည်|အမည်|phone(?:\s*number)?|phone\s*no\.?|tel|ph|contact|viber|ဖုန်း(?:နံပါတ်)?|township|town|tsp|မြို့နယ်|address|addr|delivery\s+address|လိပ်စာ|နေရပ်|product(?:\s*name)?|item|order(?:\s*item)?|ပစ္စည်း|ကုန်ပစ္စည်း|qty|quantity|qty\.|pcs?|pieces?|count|အရေအတွက်|unit\s*price|price|amount|rate|cost|ဈေး|စျေး|ကျသင့်ငွေ|delivery(?:\s*fee)?|deli(?:very)?(?:\s*fee)?|cod\s*deli(?:very)?|ပို့ခ|အိမ်အရောက်ခ|note|remark|remarks?|မှတ်ချက်)\s*(?:[:\-]|=)?/i;

const TOWNSHIP_EXTRACT_PATTERNS = [
  /\b([a-z][a-z\s]+?)\s+(?:tsp|township)\b/i,
  /\b([က-အ][က-အ\s]+?)\s*မြို့နယ်/u,
] as const;

export type AddressExtraction = {
  value: string;
  lineIndex: number;
  raw: string;
  parser: string;
  consumedLineIndexes: number[];
};

export function normalizeTownshipValue(value: string): string | null {
  const cleaned = sanitizeTownshipCandidate(value);
  if (!cleaned) {
    return null;
  }

  const normalized = normalizeTownshipKey(cleaned);

  for (const entry of TOWNSHIP_ALIASES) {
    if (
      entry.variants.some(
        (variant) => normalizeTownshipKey(variant) === normalized,
      )
    ) {
      return entry.canonical;
    }
  }

  return cleaned;
}

export function extractTownshipFromText(value: string): string | null {
  for (const pattern of TOWNSHIP_EXTRACT_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return normalizeTownshipValue(match[1]);
    }
  }

  return findTownshipAliasInText(value);
}

export function extractAddressCandidate(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): AddressExtraction | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || consumedLineIndexes.has(line.index)) {
      continue;
    }

    if (!isAddressLikeLine(line.raw)) {
      continue;
    }

    const segments = [line.raw];
    const rawSegments = [line.raw];
    const matchedIndexes = [line.index];

    for (let offset = index + 1; offset < lines.length; offset += 1) {
      const nextLine = lines[offset];
      if (!nextLine || consumedLineIndexes.has(nextLine.index)) {
        break;
      }

      if (looksLikeOrderFieldLine(nextLine.raw)) {
        break;
      }

      if (!isAddressContinuationLine(nextLine.raw)) {
        break;
      }

      segments.push(nextLine.raw);
      rawSegments.push(nextLine.raw);
      matchedIndexes.push(nextLine.index);

      if (matchedIndexes.length >= 3) {
        break;
      }
    }

    return {
      value: normalizeAddressValue(segments),
      lineIndex: line.index,
      raw: rawSegments.join('\n'),
      parser:
        matchedIndexes.length > 1 ? 'address_multiline' : 'address_fallback',
      consumedLineIndexes: matchedIndexes,
    };
  }

  return null;
}

export function extendAddressFromLine(
  lines: LineInfo[],
  startLineIndex: number,
  initialValue: string,
  consumedLineIndexes: Set<number>,
): AddressExtraction {
  const baseLine = lines.find((line) => line.index === startLineIndex);
  const segments = [initialValue];
  const rawSegments = [baseLine?.raw ?? initialValue];
  const matchedIndexes = [startLineIndex];
  const startPosition = lines.findIndex(
    (line) => line.index === startLineIndex,
  );

  if (startPosition >= 0) {
    for (let offset = startPosition + 1; offset < lines.length; offset += 1) {
      const nextLine = lines[offset];
      if (!nextLine || consumedLineIndexes.has(nextLine.index)) {
        break;
      }

      if (looksLikeOrderFieldLine(nextLine.raw)) {
        break;
      }

      if (!isAddressContinuationLine(nextLine.raw)) {
        break;
      }

      segments.push(nextLine.raw);
      rawSegments.push(nextLine.raw);
      matchedIndexes.push(nextLine.index);

      if (matchedIndexes.length >= 3) {
        break;
      }
    }
  }

  return {
    value: normalizeAddressValue(segments),
    lineIndex: startLineIndex,
    raw: rawSegments.join('\n'),
    parser:
      matchedIndexes.length > 1
        ? 'labeled_address_multiline'
        : 'labeled_address',
    consumedLineIndexes: matchedIndexes,
  };
}

function isAddressLikeLine(value: string) {
  return (
    ADDRESS_TOKEN_PATTERN.test(value) ||
    (!looksLikeItemLine(value) && value.includes(',') && value.length >= 12)
  );
}

function isAddressContinuationLine(value: string) {
  if (looksLikeOrderFieldLine(value)) {
    return false;
  }

  if (looksLikeItemLine(value)) {
    return false;
  }

  if (
    ADDRESS_TOKEN_PATTERN.test(value) ||
    extractTownshipFromText(value) !== null
  ) {
    return true;
  }

  return value.includes(',') || /^[a-z0-9က-အ].{3,40}$/iu.test(value);
}

function looksLikeOrderFieldLine(value: string) {
  return ORDER_FIELD_PATTERN.test(value);
}

function looksLikeItemLine(value: string) {
  return ITEM_LINE_PATTERN.test(value);
}

function sanitizeTownshipCandidate(value: string) {
  const cleaned = value
    .replace(/\byangon\b/gi, '')
    .replace(/ရန်ကုန်/g, '')
    .replace(/\b(tsp|township|township\.)\b/gi, '')
    .replace(/မြို့နယ်/g, '')
    .replace(/[,:/|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function normalizeTownshipKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function findTownshipAliasInText(value: string): string | null {
  const normalizedText = normalizeTownshipKey(value);

  for (const entry of TOWNSHIP_ALIASES) {
    for (const variant of entry.variants) {
      const normalizedVariant = normalizeTownshipKey(variant);
      if (
        normalizedText === normalizedVariant ||
        normalizedText.includes(` ${normalizedVariant} `) ||
        normalizedText.startsWith(`${normalizedVariant} `) ||
        normalizedText.endsWith(` ${normalizedVariant}`)
      ) {
        return entry.canonical;
      }
    }
  }

  return null;
}

function normalizeAddressValue(segments: string[]) {
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}
