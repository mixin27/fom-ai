import type {
  ParseConfidenceBreakdown,
  ParsedCustomerDraft,
  ParsedItemDraft,
} from './order-message-parser.types';

export function buildParseWarnings(
  customer: ParsedCustomerDraft,
  items: ParsedItemDraft[],
): string[] {
  const warnings: string[] = [];

  if (!customer.name) {
    warnings.push('Customer name was not detected.');
  }
  if (!customer.phone) {
    warnings.push('Phone number was not detected.');
  }
  if (items.length === 0 || items.some((item) => !item.product_name)) {
    warnings.push('Product name was not detected.');
  }
  if (items.length > 0 && items.some((item) => item.unit_price === null)) {
    warnings.push('One or more item prices were not detected.');
  }
  if (
    items.length > 0 &&
    items.some((item) => item.qty === null || item.qty <= 0)
  ) {
    warnings.push('One or more item quantities were not detected.');
  }

  return warnings;
}

export function listMissingRequiredFields(
  customer: ParsedCustomerDraft,
  items: ParsedItemDraft[],
): string[] {
  const missingFields: string[] = [];

  if (!customer.name) {
    missingFields.push('customer.name');
  }
  if (!customer.phone) {
    missingFields.push('customer.phone');
  }
  if (items.length === 0) {
    missingFields.push('items');
  }

  items.forEach((item, index) => {
    if (!item.product_name) {
      missingFields.push(`items.${index}.product_name`);
    }
    if (item.qty === null || item.qty <= 0) {
      missingFields.push(`items.${index}.qty`);
    }
    if (item.unit_price === null) {
      missingFields.push(`items.${index}.unit_price`);
    }
  });

  return missingFields;
}

export function calculateParseConfidence(
  customer: ParsedCustomerDraft,
  items: ParsedItemDraft[],
  deliveryFee: number | null,
): ParseConfidenceBreakdown {
  const customerScore =
    (Number(Boolean(customer.name)) * 0.35 +
      Number(Boolean(customer.phone)) * 0.35 +
      Number(Boolean(customer.address)) * 0.15 +
      Number(Boolean(customer.township)) * 0.15) /
    1;

  const itemCompleteness = items.length
    ? items.map(calculateItemCompleteness)
    : [0];
  const itemsScore = average(itemCompleteness);

  const pricingScore =
    items.length === 0
      ? 0
      : average(
          items.map((item) =>
            Number(
              item.unit_price !== null &&
                item.qty !== null &&
                item.qty > 0 &&
                item.line_total !== null,
            ),
          ),
        );

  const deliveryScore = deliveryFee !== null ? 1 : 0.5;

  const overall =
    customerScore * 0.35 +
    itemsScore * 0.4 +
    pricingScore * 0.2 +
    deliveryScore * 0.05;

  return {
    customer: roundScore(customerScore),
    items: roundScore(itemsScore),
    pricing: roundScore(pricingScore),
    delivery: roundScore(deliveryScore),
    overall: roundScore(overall),
  };
}

function calculateItemCompleteness(item: ParsedItemDraft) {
  return (
    Number(Boolean(item.product_name)) * 0.4 +
    Number(item.qty !== null && item.qty > 0) * 0.2 +
    Number(item.unit_price !== null) * 0.4
  );
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number) {
  return Number.parseFloat(value.toFixed(2));
}
