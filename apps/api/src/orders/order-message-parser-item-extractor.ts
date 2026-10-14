import type { LineInfo, ParsedItemDraft } from './order-message-parser.types';

const PRODUCT_LABEL_PATTERNS = [
  /^(?:product(?:\s*name)?|item|order(?:\s*item)?|ပစ္စည်း|ကုန်ပစ္စည်း)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const QTY_LABEL_PATTERNS = [
  /^(?:qty|quantity|qty\.|pcs?|pieces?|count|အရေအတွက်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const PRICE_LABEL_PATTERNS = [
  /^(?:unit\s*price|price|amount|rate|cost|ဈေး|စျေး|ကျသင့်ငွေ)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const DELIVERY_FEE_LABEL_PATTERNS = [
  /^(?:delivery(?:\s*fee)?|deli(?:very)?(?:\s*fee)?|cod\s*deli(?:very)?|ပို့ခ|အိမ်အရောက်ခ)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const COLOR_LABEL_PATTERNS = [
  /^(?:color|colour|အရောင်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const SIZE_LABEL_PATTERNS = [
  /^(?:size|ဆိုဒ်|အရွယ်|အရွယ်အစား)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

type ItemFieldKey = 'product_name' | 'qty' | 'unit_price';

export type ItemFieldEvidence = {
  parser: string;
  lineIndex: number | null;
  raw: string | null;
};

export type ParsedItemExtraction = {
  item: ParsedItemDraft;
  evidence: Partial<Record<ItemFieldKey, ItemFieldEvidence>>;
  warnings: string[];
};

type ExtractedScalarValue<T extends number | string> = {
  value: T;
  parser: string;
  ambiguous: boolean;
};

export function extractItemsFromLabeledProductBlocks(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): ParsedItemExtraction[] {
  const items: ParsedItemExtraction[] = [];

  let currentItem: {
    product_name: string;
    qty: number | null;
    unit_price: number | null;
    descriptors: string[];
    evidence: Partial<Record<ItemFieldKey, ItemFieldEvidence>>;
    warnings: string[];
  } | null = null;

  const flushCurrentItem = () => {
    if (!currentItem) {
      return;
    }

    const qtyValue = currentItem.qty ?? 1;
    const warnings = [...currentItem.warnings];
    const evidence = { ...currentItem.evidence };

    if (currentItem.qty === null) {
      warnings.push(
        'One or more item quantities were not detected. Defaulted to 1.',
      );
      evidence.qty = evidence.qty ?? {
        parser: 'default_qty_from_labeled_product_block',
        lineIndex: evidence.product_name?.lineIndex ?? null,
        raw: evidence.product_name?.raw ?? null,
      };
    }

    items.push({
      item: {
        product_name: applyItemDescriptors(
          currentItem.product_name,
          currentItem.descriptors,
        ),
        qty: qtyValue,
        unit_price: currentItem.unit_price,
        line_total:
          currentItem.unit_price !== null
            ? qtyValue * currentItem.unit_price
            : null,
      },
      evidence,
      warnings: uniqueWarnings(warnings),
    });

    currentItem = null;
  };

  for (const line of lines) {
    const structuredItem = extractStructuredItemFromLine(line.raw, line.index);
    if (structuredItem) {
      flushCurrentItem();
      consumedLineIndexes.add(line.index);
      items.push(structuredItem);
      continue;
    }

    const productValue = matchLabeledValue(line.raw, PRODUCT_LABEL_PATTERNS);
    if (productValue) {
      flushCurrentItem();
      consumedLineIndexes.add(line.index);

      const multiInlineItems = extractMultipleInlineItemsFromLine(
        productValue,
        line.index,
      );
      if (multiInlineItems.length > 1) {
        items.push(...multiInlineItems);
        continue;
      }

      const productName = cleanProductName(productValue);
      if (!productName) {
        continue;
      }

      const inlineQty = extractQuantityFromText(productValue);
      const inlinePrice = extractPriceFromText(
        productValue,
        inlineQty?.value ?? null,
      );

      currentItem = {
        product_name: productName,
        qty: inlineQty?.value ?? null,
        unit_price: inlinePrice?.value ?? null,
        descriptors: [],
        evidence: {
          product_name: {
            parser: 'labeled_product_block',
            lineIndex: line.index,
            raw: line.raw,
          },
          ...(inlineQty
            ? {
                qty: {
                  parser: inlineQty.parser,
                  lineIndex: line.index,
                  raw: line.raw,
                },
              }
            : {}),
          ...(inlinePrice
            ? {
                unit_price: {
                  parser: inlinePrice.parser,
                  lineIndex: line.index,
                  raw: line.raw,
                },
              }
            : {}),
        },
        warnings: [
          ...(inlinePrice?.ambiguous
            ? [
                'A product line contained multiple money values. The parser used the last one as the unit price.',
              ]
            : []),
        ],
      };
      continue;
    }

    if (!currentItem) {
      continue;
    }

    const colorValue = matchLabeledValue(line.raw, COLOR_LABEL_PATTERNS);
    if (colorValue) {
      currentItem.descriptors.push(colorValue);
      consumedLineIndexes.add(line.index);
      continue;
    }

    const sizeValue = matchLabeledValue(line.raw, SIZE_LABEL_PATTERNS);
    if (sizeValue) {
      currentItem.descriptors.push(
        /^size\b/i.test(sizeValue) ? sizeValue : `Size ${sizeValue}`,
      );
      consumedLineIndexes.add(line.index);
      continue;
    }

    const qtyValue = matchLabeledValue(line.raw, QTY_LABEL_PATTERNS);
    if (qtyValue && currentItem.qty === null) {
      const parsedQty = parseQuantity(qtyValue);
      if (parsedQty !== null) {
        currentItem.qty = parsedQty;
        currentItem.evidence.qty = {
          parser: 'labeled_qty_line',
          lineIndex: line.index,
          raw: line.raw,
        };
      }
      consumedLineIndexes.add(line.index);
      continue;
    }

    const priceValue = matchLabeledValue(line.raw, PRICE_LABEL_PATTERNS);
    if (priceValue && currentItem.unit_price === null) {
      const parsedPrice = parseMoney(priceValue);
      if (parsedPrice !== null) {
        currentItem.unit_price = parsedPrice;
        currentItem.evidence.unit_price = {
          parser: 'labeled_price_line',
          lineIndex: line.index,
          raw: line.raw,
        };
      }
      consumedLineIndexes.add(line.index);
    }
  }

  flushCurrentItem();

  return items;
}

export function tryParseItemLine(
  line: string,
  lineIndex: number | null = null,
): ParsedItemExtraction | null {
  const cleaned = line
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[\).]\s*/, '')
    .trim();

  const combinedPatterns: RegExp[] = [
    /^(\d+)\s*[x]\s*(.*?)\s*[-–—]?\s*([0-9][0-9,]*(?:\.\d+)?\s*[kK]?)\s*(?:mmk|ks|kyats?|ကျပ်)?$/i,
    /^(\d+)\s*(?:pcs?|pc|pieces?|qty|ခု|ထည်|set)s?\s*(.*?)\s*[-–—]?\s*([0-9][0-9,]*(?:\.\d+)?\s*[kK]?)\s*(?:mmk|ks|kyats?|ကျပ်)?$/i,
    /^(.*?)\s*[x]\s*(\d+)\s*[-–—]?\s*([0-9][0-9,]*(?:\.\d+)?\s*[kK]?)\s*(?:mmk|ks|kyats?|ကျပ်)?$/i,
    /^(.*?)\s+(\d+)\s*(?:pcs?|pc|qty|ခု|ထည်|set)s?\s+([0-9][0-9,]*(?:\.\d+)?\s*[kK]?)\s*(?:mmk|ks|kyats?|ကျပ်)?$/i,
    /^(.*?)\s*[-–—]\s*(?:qty\s*[:\-]?\s*)?(\d+)\s*(?:pcs?|pc|pieces?|qty|ခု|ထည်|set)s?\s*[-–—]\s*(?:price\s*[:\-]?\s*)?([0-9][0-9,]*(?:\.\d+)?\s*[kK]?)\s*(?:mmk|ks|kyats?|ကျပ်)?$/i,
    /^(.*?)\s*[-–—]\s*([0-9][0-9,]*(?:\.\d+)?\s*[kK]?)\s*(?:mmk|ks|kyats?|ကျပ်)?$/i,
  ];

  for (const pattern of combinedPatterns) {
    const match = cleaned.match(pattern);
    if (!match) {
      continue;
    }

    const quantityFirstPattern =
      pattern === combinedPatterns[0] || pattern === combinedPatterns[1];
    const productName = cleanProductName(
      quantityFirstPattern ? (match[2] ?? '') : (match[1] ?? ''),
    );
    if (!productName) {
      continue;
    }

    if (match.length >= 4) {
      const qty = parseQuantity(
        quantityFirstPattern ? (match[1] ?? '') : (match[2] ?? ''),
      );
      const unitPrice = parseMoney(match[3] ?? '');
      if (qty === null || unitPrice === null || unitPrice < 500) {
        continue;
      }

      return {
        item: {
          product_name: productName,
          qty,
          unit_price: unitPrice,
          line_total: qty * unitPrice,
        },
        evidence: {
          product_name: {
            parser: 'inline_item_line',
            lineIndex,
            raw: line,
          },
          qty: {
            parser: 'inline_item_line',
            lineIndex,
            raw: line,
          },
          unit_price: {
            parser: 'inline_item_line',
            lineIndex,
            raw: line,
          },
        },
        warnings: [],
      };
    }

    const unitPrice = parseMoney(match[2] ?? '');
    if (unitPrice === null || unitPrice < 500) {
      continue;
    }

    return {
      item: {
        product_name: productName,
        qty: 1,
        unit_price: unitPrice,
        line_total: unitPrice,
      },
      evidence: {
        product_name: {
          parser: 'inline_item_line',
          lineIndex,
          raw: line,
        },
        qty: {
          parser: 'default_qty_from_inline_item_line',
          lineIndex,
          raw: line,
        },
        unit_price: {
          parser: 'inline_item_line',
          lineIndex,
          raw: line,
        },
      },
      warnings: [
        'One or more item quantities were not detected. Defaulted to 1.',
      ],
    };
  }

  return null;
}

export function extractStructuredItemFromLine(
  line: string,
  lineIndex: number | null = null,
): ParsedItemExtraction | null {
  const segments = splitInlineItemSegments(line);
  if (segments.length < 2) {
    return null;
  }

  let productName: string | null = null;
  let qty: number | null = null;
  let unitPrice: number | null = null;
  const descriptors: string[] = [];
  const warnings: string[] = [];

  for (const segment of segments) {
    const productValue = matchLabeledValue(segment, PRODUCT_LABEL_PATTERNS);
    if (productValue) {
      productName = cleanProductName(productValue);
      const inlineQty = extractQuantityFromText(productValue);
      const inlinePrice = extractPriceFromText(
        productValue,
        inlineQty?.value ?? null,
      );
      qty ??= inlineQty?.value ?? null;
      unitPrice ??= inlinePrice?.value ?? null;

      if (inlinePrice?.ambiguous) {
        warnings.push(
          'A product line contained multiple money values. The parser used the last one as the unit price.',
        );
      }
      continue;
    }

    const colorValue = matchLabeledValue(segment, COLOR_LABEL_PATTERNS);
    if (colorValue) {
      descriptors.push(colorValue);
      continue;
    }

    const sizeValue = matchLabeledValue(segment, SIZE_LABEL_PATTERNS);
    if (sizeValue) {
      descriptors.push(
        /^size\b/i.test(sizeValue) ? sizeValue : `Size ${sizeValue}`,
      );
      continue;
    }

    const qtyValue = matchLabeledValue(segment, QTY_LABEL_PATTERNS);
    if (qtyValue && qty === null) {
      qty = parseQuantity(qtyValue);
      continue;
    }

    const priceValue = matchLabeledValue(segment, PRICE_LABEL_PATTERNS);
    if (priceValue && unitPrice === null) {
      unitPrice = parseMoney(priceValue);
    }
  }

  if (!productName) {
    return null;
  }

  const normalizedQty = qty ?? 1;
  if (qty === null) {
    warnings.push(
      'One or more item quantities were not detected. Defaulted to 1.',
    );
  }

  return {
    item: {
      product_name: applyItemDescriptors(productName, descriptors),
      qty: normalizedQty,
      unit_price: unitPrice,
      line_total: unitPrice !== null ? normalizedQty * unitPrice : null,
    },
    evidence: {
      product_name: {
        parser: 'structured_item_line',
        lineIndex,
        raw: line,
      },
      qty: {
        parser:
          qty === null
            ? 'default_qty_from_structured_item_line'
            : 'structured_item_line',
        lineIndex,
        raw: line,
      },
      ...(unitPrice !== null
        ? {
            unit_price: {
              parser: 'structured_item_line',
              lineIndex,
              raw: line,
            },
          }
        : {}),
    },
    warnings: uniqueWarnings(warnings),
  };
}

export function extractMultipleInlineItemsFromLine(
  line: string,
  lineIndex: number | null = null,
): ParsedItemExtraction[] {
  const segments = line
    .split(/\s*,\s*(?=[^\d,].*(?:x\s*\d+|\d{3,}))/i)
    .flatMap((segment) => segment.split(/\s*(?:;|\|)\s*/g))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) {
    return [];
  }

  const items = segments
    .map((segment) => tryParseItemLine(segment, lineIndex))
    .filter((item): item is ParsedItemExtraction => item !== null);

  return items.length >= 2 ? items : [];
}

export function extractFallbackProductLine(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): { index: number; value: string } | null {
  for (const line of lines) {
    if (consumedLineIndexes.has(line.index)) {
      continue;
    }

    if (
      /\d{3,}/.test(line.raw) ||
      /(?:street|road|lane|address|လိပ်စာ|ပို့ခ|delivery|phone|qty|price)/i.test(
        line.lower,
      )
    ) {
      continue;
    }

    if (line.raw.length < 3) {
      continue;
    }

    return {
      index: line.index,
      value: cleanProductName(line.raw),
    };
  }

  return null;
}

export function extractFallbackQuantity(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): { index: number; value: number; raw: string } | null {
  for (const line of lines) {
    if (consumedLineIndexes.has(line.index)) {
      continue;
    }

    const parsed = parseQuantity(line.raw);
    if (parsed === null) {
      continue;
    }

    if (parsed < 1 || parsed > 99) {
      continue;
    }

    return {
      index: line.index,
      value: parsed,
      raw: line.raw,
    };
  }

  return null;
}

export function extractFallbackPrice(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): { index: number; value: number; raw: string } | null {
  for (const line of lines) {
    if (consumedLineIndexes.has(line.index)) {
      continue;
    }

    const parsed = parseMoney(line.raw);
    if (parsed === null || parsed < 500) {
      continue;
    }

    return {
      index: line.index,
      value: parsed,
      raw: line.raw,
    };
  }

  return null;
}

export function extractFallbackDeliveryFee(
  lines: LineInfo[],
  consumedLineIndexes: Set<number>,
): { index: number; value: number; raw: string } | null {
  for (const line of lines) {
    if (consumedLineIndexes.has(line.index)) {
      continue;
    }

    if (!/(?:deli|delivery|ပို့ခ|အိမ်အရောက်)/i.test(line.raw)) {
      continue;
    }

    const parsed = parseMoney(line.raw);
    if (parsed !== null) {
      consumedLineIndexes.add(line.index);
      return {
        index: line.index,
        value: parsed,
        raw: line.raw,
      };
    }
  }

  return null;
}

export function parseQuantity(value: string): number | null {
  const match = value.match(/(?:x\s*)?(\d{1,3})/i);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMoney(value: string): number | null {
  const normalized = value
    .toLowerCase()
    .replace(/mmk|ks|kyats?|ကျပ်/g, '')
    .trim();
  const match = normalized.match(/(\d[\d,]*(?:\.\d+)?)(\s*[k])?/i);
  if (!match?.[1]) {
    return null;
  }

  const numeric = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return match[2] ? Math.round(numeric * 1000) : Math.round(numeric);
}

function extractQuantityFromText(
  value: string,
): ExtractedScalarValue<number> | null {
  const quantityMatch =
    value.match(/[x]\s*(\d{1,3})/i) ??
    value.match(/(?:qty|quantity)\s*[:\-]?\s*(\d{1,3})/i) ??
    value.match(/(?:အရေအတွက်)\s*[:\-]?\s*(\d{1,3})/u) ??
    value.match(/(\d{1,3})\s*(?:pcs?|pc|pieces?|ခု|ထည်|set)\b/i);
  if (!quantityMatch?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(quantityMatch[1], 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return {
    value: parsed,
    parser: 'inline_quantity_token',
    ambiguous: false,
  };
}

function extractPriceFromText(
  value: string,
  quantityHint: number | null = null,
): ExtractedScalarValue<number> | null {
  const moneyCandidates = [...value.matchAll(/(\d[\d,]*(?:\.\d+)?)(\s*[kK])?/g)]
    .map((match) => parseMoney(match[0]))
    .filter(
      (candidate): candidate is number =>
        candidate !== null && candidate >= 500,
    );

  const uniqueCandidates = [...new Set(moneyCandidates)];

  if (
    uniqueCandidates.length > 1 &&
    quantityHint !== null &&
    quantityHint > 1
  ) {
    for (const candidate of uniqueCandidates) {
      const totalCandidate = candidate * quantityHint;
      if (uniqueCandidates.includes(totalCandidate)) {
        return {
          value: candidate,
          parser: 'price_from_quantity_total_pair',
          ambiguous: false,
        };
      }
    }
  }

  if (uniqueCandidates.length > 0) {
    const chosen =
      uniqueCandidates.length > 1
        ? uniqueCandidates[uniqueCandidates.length - 1]
        : uniqueCandidates[0];
    return {
      value: chosen ?? null,
      parser:
        uniqueCandidates.length > 1
          ? 'price_from_last_money_token'
          : 'inline_price_token',
      ambiguous: uniqueCandidates.length > 1,
    };
  }

  const parsed = parseMoney(value);
  if (parsed === null) {
    return null;
  }

  return {
    value: parsed,
    parser: 'inline_price_fallback',
    ambiguous: false,
  };
}

function cleanProductName(value: string): string {
  return value
    .replace(/[x]\s*\d{1,3}\b.*$/i, '')
    .replace(/\b\d[\d,]*(?:\.\d+)?\s*(?:mmk|ks|kyats?|k|ကျပ်)?\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[-–—,\s]+$/g, '')
    .trim();
}

function applyItemDescriptors(
  productName: string,
  descriptors: string[],
): string {
  if (descriptors.length === 0) {
    return productName;
  }

  const uniqueDescriptors = [
    ...new Set(
      descriptors
        .map((descriptor) => descriptor.trim())
        .filter((descriptor) => descriptor.length > 0),
    ),
  ].filter(
    (descriptor) =>
      !productName.toLowerCase().includes(descriptor.toLowerCase()),
  );

  if (uniqueDescriptors.length === 0) {
    return productName;
  }

  return `${productName} (${uniqueDescriptors.join(', ')})`;
}

function splitInlineItemSegments(value: string): string[] {
  return value
    .split(/\s*(?:\/|;|\|)\s*/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
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

function uniqueWarnings(warnings: string[]) {
  return [...new Set(warnings)];
}
