import type {
  LineInfo,
  ParsedCustomerDraft,
  ParsedOrderStatus,
} from './order-message-parser.types';
import {
  extractAddressCandidate,
  extendAddressFromLine,
  extractTownshipFromText,
  normalizeTownshipValue,
} from './order-message-parser-location';

export type ExtractedLineValue<T extends string | number> = {
  value: T;
  lineIndex: number;
  raw: string;
  parser: string;
  consumedLineIndexes?: number[];
};

export type CustomerFieldMatches = Partial<{
  [K in keyof ParsedCustomerDraft]: ExtractedLineValue<string>;
}>;

const NAME_LABEL_PATTERNS = [
  /^(?:customer\s+name|customer\s*name|name|customer|fb\s*name|နာမည်|အမည်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const PHONE_LABEL_PATTERNS = [
  /^(?:phone(?:\s*number)?|phone\s*no\.?|tel|ph|contact|viber|ဖုန်း(?:နံပါတ်)?)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const TOWNSHIP_LABEL_PATTERNS = [
  /^(?:township|town|tsp|မြို့နယ်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const ADDRESS_LABEL_PATTERNS = [
  /^(?:address|addr|delivery\s+address|လိပ်စာ|နေရပ်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

export function extractCustomerDraft(lines: LineInfo[]): {
  customer: ParsedCustomerDraft;
  matches: CustomerFieldMatches;
  consumedLineIndexes: Set<number>;
} {
  const consumedLineIndexes = new Set<number>();
  const matches: CustomerFieldMatches = {};
  const customer: ParsedCustomerDraft = {
    name: null,
    phone: null,
    township: null,
    address: null,
  };

  const labeledName = extractLabeledValue(
    lines,
    NAME_LABEL_PATTERNS,
    'labeled_name',
  );
  if (labeledName) {
    customer.name = labeledName.value;
    matches.name = labeledName;
    consumedLineIndexes.add(labeledName.lineIndex);
  }

  const labeledPhone = extractLabeledValue(
    lines,
    PHONE_LABEL_PATTERNS,
    'labeled_phone',
  );
  if (labeledPhone) {
    customer.phone = normalizePhone(labeledPhone.value);
    matches.phone = {
      ...labeledPhone,
      value: customer.phone,
    };
    consumedLineIndexes.add(labeledPhone.lineIndex);
  } else {
    const phoneCandidate = extractPhone(lines);
    if (phoneCandidate) {
      customer.phone = phoneCandidate.value;
      matches.phone = phoneCandidate;
      consumedLineIndexes.add(phoneCandidate.lineIndex);
    }
  }

  const labeledTownship = extractLabeledValue(
    lines,
    TOWNSHIP_LABEL_PATTERNS,
    'labeled_township',
  );
  if (labeledTownship) {
    customer.township =
      normalizeTownshipValue(labeledTownship.value) ?? labeledTownship.value;
    matches.township = {
      ...labeledTownship,
      value: customer.township,
    };
    consumedLineIndexes.add(labeledTownship.lineIndex);
  }

  const labeledAddress = extractLabeledValue(
    lines,
    ADDRESS_LABEL_PATTERNS,
    'labeled_address',
  );
  if (labeledAddress) {
    const addressCandidate = extendAddressFromLine(
      lines,
      labeledAddress.lineIndex,
      labeledAddress.value,
      consumedLineIndexes,
    );
    customer.address = addressCandidate.value;
    matches.address = addressCandidate;
    for (const index of addressCandidate.consumedLineIndexes) {
      consumedLineIndexes.add(index);
    }
  } else {
    const addressCandidate = extractAddressCandidate(
      lines,
      consumedLineIndexes,
    );
    if (addressCandidate) {
      customer.address = addressCandidate.value;
      matches.address = addressCandidate;
      for (const index of addressCandidate.consumedLineIndexes) {
        consumedLineIndexes.add(index);
      }
    }
  }

  if (!customer.township && customer.address) {
    const township = extractTownshipFromText(customer.address);
    if (township) {
      customer.township = township;
      matches.township = {
        value: township,
        lineIndex: matches.address?.lineIndex ?? -1,
        raw: matches.address?.raw ?? customer.address,
        parser: 'township_from_address',
      };
    }
  }

  if (!customer.name) {
    const fallbackName = extractName(lines, consumedLineIndexes);
    if (fallbackName) {
      customer.name = fallbackName.value;
      matches.name = fallbackName;
      consumedLineIndexes.add(fallbackName.lineIndex);
    }
  }

  return {
    customer,
    matches,
    consumedLineIndexes,
  };
}

export function detectParsedOrderStatus(message: string): {
  status: ParsedOrderStatus;
  parser: string;
} {
  const confirmed =
    /(?:paid|payment\s*(?:sent|done|confirmed)|ငွေလွှဲ(?:ပြီး|ထား)|လွှဲပြီး|payment\s*screenshot)/i.test(
      message,
    );

  return {
    status: confirmed ? 'confirmed' : 'new',
    parser: confirmed ? 'payment_keyword' : 'default_status',
  };
}

function extractLabeledValue(
  lines: LineInfo[],
  patterns: readonly RegExp[],
  parser: string,
): ExtractedLineValue<string> | null {
  for (const line of lines) {
    const value = matchLabeledValue(line.raw, patterns);
    if (!value) {
      continue;
    }

    return {
      value,
      lineIndex: line.index,
      raw: line.raw,
      parser,
    };
  }

  return null;
}

function matchLabeledValue(
  value: string,
  patterns: readonly RegExp[],
): string | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const extracted = match[1].trim();
    if (extracted.length === 0) {
      continue;
    }

    return extracted;
  }

  return null;
}

function extractPhone(lines: LineInfo[]): ExtractedLineValue<string> | null {
  const phonePattern = /(?:\+?95|0)9[\d\s\-]{7,14}\d/g;

  for (const line of lines) {
    const match = line.raw.match(phonePattern)?.[0];
    if (!match) {
      continue;
    }

    return {
      value: normalizePhone(match),
      lineIndex: line.index,
      raw: line.raw,
      parser: 'inline_phone',
    };
  }

  return null;
}

function extractName(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): ExtractedLineValue<string> | null {
  for (const line of lines) {
    if (consumedLineIndexes.has(line.index)) {
      continue;
    }

    if (
      /\d/.test(line.raw) ||
      /(?:street|road|lane|address|လိပ်စာ|ပို့ခ|price|qty|product|item)/i.test(
        line.lower,
      )
    ) {
      continue;
    }

    if (line.raw.length < 3) {
      continue;
    }

    return {
      value: line.raw,
      lineIndex: line.index,
      raw: line.raw,
      parser: 'name_fallback',
    };
  }

  return null;
}

function normalizePhone(phone: string): string {
  return phone
    .replace(/\+?959/, '09')
    .replace(/[^\d]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
