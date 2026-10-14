import { Injectable } from '@nestjs/common';
import {
  detectParsedOrderStatus,
  extractCustomerDraft,
} from './order-message-parser-customer-extractor';
import {
  extractFallbackDeliveryFee,
  extractFallbackPrice,
  extractFallbackProductLine,
  extractFallbackQuantity,
  extractItemsFromLabeledProductBlocks,
  type ItemFieldEvidence,
  extractMultipleInlineItemsFromLine,
  extractStructuredItemFromLine,
  parseMoney,
  parseQuantity,
  tryParseItemLine,
} from './order-message-parser-item-extractor';
import {
  buildParseWarnings,
  calculateParseConfidence,
  listMissingRequiredFields,
} from './order-message-parser-scoring';
import type {
  FieldSource,
  LineInfo,
  ParseFieldEvidence,
  ParsedCustomerDraft,
  ParsedItemDraft,
  ParseMeta,
  ParseResult,
} from './order-message-parser.types';

const MYANMAR_DIGIT_MAP: Record<string, string> = {
  '၀': '0',
  '၁': '1',
  '၂': '2',
  '၃': '3',
  '၄': '4',
  '၅': '5',
  '၆': '6',
  '၇': '7',
  '၈': '8',
  '၉': '9',
};

const QTY_LABEL_PATTERNS = [
  /^(?:qty|quantity|qty\.|pcs?|pieces?|count|အရေအတွက်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const PRICE_LABEL_PATTERNS = [
  /^(?:unit\s*price|price|amount|rate|cost|ဈေး|စျေး|ကျသင့်ငွေ)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const DELIVERY_FEE_LABEL_PATTERNS = [
  /^(?:delivery(?:\s*fee)?|deli(?:very)?(?:\s*fee)?|cod\s*deli(?:very)?|ပို့ခ|အိမ်အရောက်ခ)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

const NOTE_LABEL_PATTERNS = [
  /^(?:note|remark|remarks?|မှတ်ချက်)\s*(?:[:\-]|=)?\s+(.+)$/i,
] as const;

@Injectable()
export class OrderMessageParserService {
  parseMessage(message: string): ParseResult {
    const lines = this.toLines(message);
    const matchedFields = new Set<string>();
    const fieldSources: Record<string, FieldSource> = {};
    const fieldEvidence: Record<string, ParseFieldEvidence> = {};
    const warnings: string[] = [];

    const {
      customer,
      matches: customerMatches,
      consumedLineIndexes,
    } = extractCustomerDraft(lines);

    const setField = (
      fieldPath: string,
      value: string | number | null,
      source: FieldSource,
      evidence?: {
        parser: string;
        lineIndex: number | null;
        raw: string | null;
      },
    ) => {
      if (value === null || value === '') {
        return;
      }

      matchedFields.add(fieldPath);
      fieldSources[fieldPath] = source;
      fieldEvidence[fieldPath] = {
        field: fieldPath,
        value,
        source,
        parser: evidence?.parser ?? 'unknown',
        line_index: evidence?.lineIndex ?? null,
        raw: evidence?.raw ?? null,
      };
    };

    if (customerMatches.name) {
      setField('customer.name', customer.name, 'message', {
        parser: customerMatches.name.parser,
        lineIndex: customerMatches.name.lineIndex,
        raw: customerMatches.name.raw,
      });
    }
    if (customerMatches.phone) {
      setField('customer.phone', customer.phone, 'message', {
        parser: customerMatches.phone.parser,
        lineIndex: customerMatches.phone.lineIndex,
        raw: customerMatches.phone.raw,
      });
    }
    if (customerMatches.township) {
      setField('customer.township', customer.township, 'message', {
        parser: customerMatches.township.parser,
        lineIndex:
          customerMatches.township.lineIndex >= 0
            ? customerMatches.township.lineIndex
            : null,
        raw: customerMatches.township.raw,
      });
    }
    if (customerMatches.address) {
      setField('customer.address', customer.address, 'message', {
        parser: customerMatches.address.parser,
        lineIndex: customerMatches.address.lineIndex,
        raw: customerMatches.address.raw,
      });
    }

    const labeledQty = this.extractLabeledValue(lines, QTY_LABEL_PATTERNS);
    const labeledPrice = this.extractLabeledValue(lines, PRICE_LABEL_PATTERNS);
    const labeledDeliveryFee = this.extractLabeledValue(
      lines,
      DELIVERY_FEE_LABEL_PATTERNS,
    );
    const labeledNote = this.extractLabeledValue(lines, NOTE_LABEL_PATTERNS);

    const extractedItems = extractItemsFromLabeledProductBlocks(
      lines,
      consumedLineIndexes,
    );
    const items: ParsedItemDraft[] = extractedItems.map(
      (extractedItem) => extractedItem.item,
    );
    warnings.push(
      ...extractedItems.flatMap((extractedItem) => extractedItem.warnings),
    );

    if (labeledDeliveryFee) {
      consumedLineIndexes.add(labeledDeliveryFee.index);
    }
    if (labeledNote) {
      consumedLineIndexes.add(labeledNote.index);
    }

    for (const line of lines) {
      if (consumedLineIndexes.has(line.index)) {
        continue;
      }

      const inlineItems = extractMultipleInlineItemsFromLine(
        line.raw,
        line.index,
      );
      if (inlineItems.length > 1) {
        extractedItems.push(...inlineItems);
        items.push(...inlineItems.map((item) => item.item));
        warnings.push(...inlineItems.flatMap((item) => item.warnings));
        consumedLineIndexes.add(line.index);
        continue;
      }

      const structuredItem = extractStructuredItemFromLine(
        line.raw,
        line.index,
      );
      if (structuredItem) {
        extractedItems.push(structuredItem);
        items.push(structuredItem.item);
        warnings.push(...structuredItem.warnings);
        consumedLineIndexes.add(line.index);
        continue;
      }

      const parsedItem = tryParseItemLine(line.raw, line.index);
      if (!parsedItem) {
        continue;
      }

      extractedItems.push(parsedItem);
      items.push(parsedItem.item);
      warnings.push(...parsedItem.warnings);
      consumedLineIndexes.add(line.index);
    }

    if (items.length === 0) {
      const fallbackProduct = extractFallbackProductLine(
        lines,
        consumedLineIndexes,
      );
      if (fallbackProduct) {
        const fallbackQty = labeledQty
          ? {
              index: labeledQty.index,
              value: parseQuantity(labeledQty.value),
              raw: this.getLineRaw(lines, labeledQty.index) ?? labeledQty.value,
            }
          : extractFallbackQuantity(lines, consumedLineIndexes);
        const fallbackPrice = labeledPrice
          ? {
              index: labeledPrice.index,
              value: parseMoney(labeledPrice.value),
              raw:
                this.getLineRaw(lines, labeledPrice.index) ??
                labeledPrice.value,
            }
          : extractFallbackPrice(lines, consumedLineIndexes);

        const qtyValue = fallbackQty?.value ?? null;
        const priceValue = fallbackPrice?.value ?? null;

        const fallbackItem: ParsedItemDraft = {
          product_name: fallbackProduct.value,
          qty: qtyValue ?? 1,
          unit_price: priceValue,
          line_total: priceValue !== null ? (qtyValue ?? 1) * priceValue : null,
        };
        items.push(fallbackItem);
        extractedItems.push({
          item: fallbackItem,
          evidence: {
            product_name: {
              parser: 'fallback_product_line',
              lineIndex: fallbackProduct.index,
              raw: this.getLineRaw(lines, fallbackProduct.index),
            },
            qty:
              qtyValue !== null
                ? {
                    parser:
                      labeledQty !== null
                        ? 'labeled_qty_line'
                        : 'fallback_qty_line',
                    lineIndex: fallbackQty?.index ?? fallbackProduct.index,
                    raw:
                      fallbackQty?.raw ??
                      this.getLineRaw(lines, fallbackProduct.index),
                  }
                : {
                    parser: 'default_qty_from_fallback_product_line',
                    lineIndex: fallbackProduct.index,
                    raw: this.getLineRaw(lines, fallbackProduct.index),
                  },
            ...(priceValue !== null
              ? {
                  unit_price: {
                    parser:
                      labeledPrice !== null
                        ? 'labeled_price_line'
                        : 'fallback_price_line',
                    lineIndex: fallbackPrice?.index ?? fallbackProduct.index,
                    raw:
                      fallbackPrice?.raw ??
                      this.getLineRaw(lines, fallbackProduct.index),
                  },
                }
              : {}),
          },
          warnings:
            qtyValue === null
              ? ['Quantity was not detected. Defaulted to 1.']
              : [],
        });
        consumedLineIndexes.add(fallbackProduct.index);

        if (qtyValue === null) {
          warnings.push('Quantity was not detected. Defaulted to 1.');
        }
      }
    }

    const deliveryFee = labeledDeliveryFee
      ? {
          index: labeledDeliveryFee.index,
          value: parseMoney(labeledDeliveryFee.value),
          raw:
            this.getLineRaw(lines, labeledDeliveryFee.index) ??
            labeledDeliveryFee.value,
        }
      : extractFallbackDeliveryFee(lines, consumedLineIndexes);
    if (deliveryFee?.value !== null && deliveryFee !== null) {
      setField('delivery_fee', deliveryFee.value, 'message', {
        parser:
          labeledDeliveryFee !== null
            ? 'labeled_delivery_fee'
            : 'fallback_delivery_fee',
        lineIndex: deliveryFee.index,
        raw: deliveryFee.raw,
      });
    }

    const note = labeledNote?.value ?? null;
    if (note) {
      setField('note', note, 'message', {
        parser: 'labeled_note',
        lineIndex: labeledNote?.index ?? null,
        raw: labeledNote ? this.getLineRaw(lines, labeledNote.index) : null,
      });
    }

    for (const [index, extractedItem] of extractedItems.entries()) {
      this.setParsedItemFields(
        index,
        extractedItem.evidence,
        extractedItem.item,
        setField,
      );
    }

    const statusDetection = detectParsedOrderStatus(message);
    const status = statusDetection.status;
    setField('status', status, status === 'new' ? 'default' : 'message', {
      parser: statusDetection.parser,
      lineIndex: null,
      raw: null,
    });
    setField('source', 'messenger', 'default', {
      parser: 'default_source',
      lineIndex: null,
      raw: null,
    });

    const subtotal = items.reduce(
      (sum, item) => sum + (item.line_total ?? 0),
      0,
    );
    const totalPrice = subtotal + (deliveryFee?.value ?? 0);

    warnings.push(...buildParseWarnings(customer, items));

    const confidenceBreakdown = calculateParseConfidence(
      customer,
      items,
      deliveryFee?.value ?? null,
    );

    const parseMeta: ParseMeta = {
      is_ready_to_create: this.isReadyToCreate(customer, items),
      confidence: confidenceBreakdown.overall,
      confidence_breakdown: confidenceBreakdown,
      matched_fields: [...matchedFields].sort(),
      field_sources: fieldSources,
      field_evidence: fieldEvidence,
      missing_required_fields: listMissingRequiredFields(customer, items),
      warnings: this.uniqueWarnings(warnings),
      unparsed_lines: lines
        .filter((line) => !consumedLineIndexes.has(line.index))
        .map((line) => line.raw)
        .filter((line) => line.length > 0),
    };

    return {
      suggested_order: {
        customer,
        items,
        delivery_fee: deliveryFee?.value ?? null,
        subtotal,
        total_price: totalPrice,
        currency: 'MMK',
        status,
        source: 'messenger',
        note,
      },
      parse_meta: parseMeta,
    };
  }

  backfillMissingCustomerFields(
    result: ParseResult,
    customerMatch: {
      name: string;
      phone: string;
      township: string | null;
      address: string | null;
    },
  ) {
    const assign = (
      fieldPath: keyof ParsedCustomerDraft,
      fallbackValue: string | null,
    ) => {
      if (!fallbackValue) {
        return;
      }

      if (!result.suggested_order.customer[fieldPath]) {
        result.suggested_order.customer[fieldPath] = fallbackValue;
        result.parse_meta.field_sources[`customer.${fieldPath}`] =
          'customer_match';
        result.parse_meta.field_evidence[`customer.${fieldPath}`] = {
          field: `customer.${fieldPath}`,
          value: fallbackValue,
          source: 'customer_match',
          parser: 'customer_match_backfill',
          line_index: null,
          raw: null,
        };
      }
    };

    assign('name', customerMatch.name);
    assign('phone', customerMatch.phone);
    assign('township', customerMatch.township);
    assign('address', customerMatch.address);

    result.parse_meta.matched_fields = Object.keys(
      result.parse_meta.field_sources,
    ).sort();
    result.parse_meta.is_ready_to_create = this.isReadyToCreate(
      result.suggested_order.customer,
      result.suggested_order.items,
    );
    result.parse_meta.confidence_breakdown = calculateParseConfidence(
      result.suggested_order.customer,
      result.suggested_order.items,
      result.suggested_order.delivery_fee,
    );
    result.parse_meta.confidence =
      result.parse_meta.confidence_breakdown.overall;
    result.parse_meta.missing_required_fields = listMissingRequiredFields(
      result.suggested_order.customer,
      result.suggested_order.items,
    );
    result.parse_meta.warnings = this.uniqueWarnings([
      ...result.parse_meta.warnings,
      ...buildParseWarnings(
        result.suggested_order.customer,
        result.suggested_order.items,
      ),
    ]);
  }

  private toLines(message: string): LineInfo[] {
    return this.normalizeText(message)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => ({
        index,
        raw: line,
        normalized: line,
        lower: line.toLowerCase(),
      }));
  }

  private normalizeText(value: string): string {
    return value
      .replace(/[၀-၉]/g, (digit) => MYANMAR_DIGIT_MAP[digit] ?? digit)
      .replace(/[၊]/g, ', ')
      .replace(/[။]/g, '. ')
      .replace(/[×]/g, 'x')
      .replace(/\r/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private extractLabeledValue(
    lines: LineInfo[],
    patterns: readonly RegExp[],
  ): { index: number; value: string } | null {
    return this.extractLabeledValues(lines, patterns)[0] ?? null;
  }

  private extractLabeledValues(
    lines: LineInfo[],
    patterns: readonly RegExp[],
  ): Array<{ index: number; value: string }> {
    const values: Array<{ index: number; value: string }> = [];

    for (const line of lines) {
      const value = this.matchLabeledValue(line.raw, patterns);
      if (!value) {
        continue;
      }

      values.push({
        index: line.index,
        value,
      });
    }

    return values;
  }

  private matchLabeledValue(
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

  private isReadyToCreate(
    customer: ParsedCustomerDraft,
    items: ParsedItemDraft[],
  ): boolean {
    return Boolean(
      customer.name &&
      customer.phone &&
      items.length > 0 &&
      items.every(
        (item) =>
          item.product_name &&
          item.qty !== null &&
          item.qty > 0 &&
          item.unit_price !== null,
      ),
    );
  }

  private setParsedItemFields(
    index: number,
    evidence: Partial<
      Record<'product_name' | 'qty' | 'unit_price', ItemFieldEvidence>
    >,
    item: ParsedItemDraft,
    setField: (
      fieldPath: string,
      value: string | number | null,
      source: FieldSource,
      evidence?: {
        parser: string;
        lineIndex: number | null;
        raw: string | null;
      },
    ) => void,
  ) {
    if (item.product_name) {
      setField(
        `items.${index}.product_name`,
        item.product_name,
        this.resolveFieldSource(evidence.product_name),
        evidence.product_name,
      );
    }

    if (item.qty !== null) {
      setField(
        `items.${index}.qty`,
        item.qty,
        this.resolveFieldSource(evidence.qty),
        evidence.qty,
      );
    }

    if (item.unit_price !== null) {
      setField(
        `items.${index}.unit_price`,
        item.unit_price,
        this.resolveFieldSource(evidence.unit_price),
        evidence.unit_price,
      );
    }
  }

  private resolveFieldSource(evidence?: ItemFieldEvidence): FieldSource {
    if (!evidence) {
      return 'message';
    }

    return evidence.parser.startsWith('default_') ? 'default' : 'message';
  }

  private getLineRaw(lines: LineInfo[], index: number) {
    return lines.find((line) => line.index === index)?.raw ?? null;
  }

  private uniqueWarnings(warnings: string[]) {
    return [...new Set(warnings)];
  }
}
