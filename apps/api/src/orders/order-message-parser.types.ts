export type FieldSource = 'message' | 'customer_match' | 'default';

export type ParsedOrderStatus = 'new' | 'confirmed';

export type ParseFieldEvidence = {
  field: string;
  value: string | number | null;
  source: FieldSource;
  parser: string;
  line_index: number | null;
  raw: string | null;
};

export type ParseConfidenceBreakdown = {
  customer: number;
  items: number;
  pricing: number;
  delivery: number;
  overall: number;
};

export type ParsedItemDraft = {
  product_name: string | null;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
};

export type ParsedCustomerDraft = {
  name: string | null;
  phone: string | null;
  township: string | null;
  address: string | null;
};

export type ParsedOrderDraft = {
  customer: ParsedCustomerDraft;
  items: ParsedItemDraft[];
  delivery_fee: number | null;
  subtotal: number;
  total_price: number;
  currency: 'MMK';
  status: ParsedOrderStatus;
  source: 'messenger';
  note: string | null;
};

export type ParseMeta = {
  is_ready_to_create: boolean;
  confidence: number;
  confidence_breakdown: ParseConfidenceBreakdown;
  matched_fields: string[];
  field_sources: Record<string, FieldSource>;
  field_evidence: Record<string, ParseFieldEvidence>;
  missing_required_fields: string[];
  warnings: string[];
  unparsed_lines: string[];
};

export type ParseResult = {
  suggested_order: ParsedOrderDraft;
  parse_meta: ParseMeta;
};

export type LineInfo = {
  index: number;
  raw: string;
  normalized: string;
  lower: string;
};
