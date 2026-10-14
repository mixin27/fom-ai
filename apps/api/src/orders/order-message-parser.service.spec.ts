import { OrderMessageParserService } from './order-message-parser.service';

describe('OrderMessageParserService', () => {
  const service = new OrderMessageParserService();

  it('parses labeled Messenger text into a ready order draft', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Address: No. 12, Example Road, Sanchaung Tsp, Yangon',
        'Product: Silk Longyi Set (Green, Size M)',
        'Qty: 2',
        'Price: 18,000 MMK',
        'Deli: 3,000',
      ].join('\n'),
    );

    expect(result.suggested_order).toEqual(
      expect.objectContaining({
        customer: expect.objectContaining({
          name: 'May Sample',
          phone: '09 0001 2345',
          township: 'Sanchaung',
          address: 'No. 12, Example Road, Sanchaung Tsp, Yangon',
        }),
        delivery_fee: 3000,
        subtotal: 36000,
        total_price: 39000,
        source: 'messenger',
        status: 'new',
      }),
    );
    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Silk Longyi Set (Green, Size M)',
        qty: 2,
        unit_price: 18000,
        line_total: 36000,
      }),
    ]);
    expect(result.parse_meta.is_ready_to_create).toBe(true);
    expect(result.parse_meta.warnings).toEqual([]);
  });

  it('supports Myanmar digits and payment keywords', () => {
    const result = service.parseMessage(
      [
        'နာမည်: မေစမ်းသပ်',
        'ဖုန်း: ၀၉ ၀၀၀၁ ၂၃၄၅',
        'လိပ်စာ: အမှတ် ၁၂, စမ်းသပ်လမ်း, Sanchaung Tsp, Yangon',
        'ပစ္စည်း: Longyi Set x၂ ၁၈,၀၀၀',
        'ပို့ခ: ၃,၀၀၀',
        'ငွေလွှဲပြီး',
      ].join('\n'),
    );

    expect(result.suggested_order.customer).toEqual(
      expect.objectContaining({
        name: 'မေစမ်းသပ်',
        phone: '09 0001 2345',
        township: 'Sanchaung',
      }),
    );
    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Longyi Set',
        qty: 2,
        unit_price: 18000,
      }),
    ]);
    expect(result.suggested_order.delivery_fee).toBe(3000);
    expect(result.suggested_order.status).toBe('confirmed');
    expect(result.parse_meta.is_ready_to_create).toBe(true);
  });

  it('parses multiple unlabeled item lines into items array', () => {
    const result = service.parseMessage(
      [
        'May Sample',
        '09 0001 2345',
        'No. 12, Example Road, Sanchaung Tsp, Yangon',
        'Silk Longyi Set x2 18000',
        'Handbag x1 25000',
        'Deli 3000',
      ].join('\n'),
    );

    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Silk Longyi Set',
        qty: 2,
        unit_price: 18000,
        line_total: 36000,
      }),
      expect.objectContaining({
        product_name: 'Handbag',
        qty: 1,
        unit_price: 25000,
        line_total: 25000,
      }),
    ]);
    expect(result.suggested_order.subtotal).toBe(61000);
    expect(result.suggested_order.total_price).toBe(64000);
    expect(result.parse_meta.is_ready_to_create).toBe(true);
  });

  it('parses repeated labeled product blocks as multiple items', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Product: Silk Longyi Set',
        'Color: Green',
        'Size: M',
        'Qty: 2',
        'Price: 18,000',
        'Product: Handbag',
        'Color: Black',
        'Qty: 1',
        'Price: 25,000',
        'Deli: 3,000',
      ].join('\n'),
    );

    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Silk Longyi Set (Green, Size M)',
        qty: 2,
        unit_price: 18000,
        line_total: 36000,
      }),
      expect.objectContaining({
        product_name: 'Handbag (Black)',
        qty: 1,
        unit_price: 25000,
        line_total: 25000,
      }),
    ]);
    expect(result.suggested_order.subtotal).toBe(61000);
    expect(result.suggested_order.total_price).toBe(64000);
    expect(result.parse_meta.is_ready_to_create).toBe(true);
  });

  it('parses comma-separated mixed items on one line', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Product: Silk Longyi Set x2 18000, Handbag x1 25000, Shirt x3 12000',
        'Deli: 3,000',
      ].join('\n'),
    );

    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Silk Longyi Set',
        qty: 2,
        unit_price: 18000,
        line_total: 36000,
      }),
      expect.objectContaining({
        product_name: 'Handbag',
        qty: 1,
        unit_price: 25000,
        line_total: 25000,
      }),
      expect.objectContaining({
        product_name: 'Shirt',
        qty: 3,
        unit_price: 12000,
        line_total: 36000,
      }),
    ]);
    expect(result.suggested_order.subtotal).toBe(97000);
    expect(result.suggested_order.total_price).toBe(100000);
    expect(result.parse_meta.is_ready_to_create).toBe(true);
  });

  it('supports labels without punctuation and quantity-first item lines', () => {
    const result = service.parseMessage(
      [
        'Customer Name May Sample',
        'Ph 09 0001 2345',
        'Township Sanchaung',
        'Address No. 12, Example Road, Yangon',
        '2 x Premium Shirt 25000',
        '1 pc Handbag 18000',
        'Delivery Fee 3000',
      ].join('\n'),
    );

    expect(result.suggested_order.customer).toEqual(
      expect.objectContaining({
        name: 'May Sample',
        phone: '09 0001 2345',
        township: 'Sanchaung',
        address: 'No. 12, Example Road, Yangon',
      }),
    );
    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Premium Shirt',
        qty: 2,
        unit_price: 25000,
        line_total: 50000,
      }),
      expect.objectContaining({
        product_name: 'Handbag',
        qty: 1,
        unit_price: 18000,
        line_total: 18000,
      }),
    ]);
    expect(result.suggested_order.delivery_fee).toBe(3000);
    expect(result.parse_meta.is_ready_to_create).toBe(true);
  });

  it('parses compact structured item fragments on a single line', () => {
    const result = service.parseMessage(
      [
        'နာမည် မေစမ်းသပ်',
        'ဖုန်း ၀၉ ၀၀၀၁ ၂၃၄၅',
        'လိပ်စာ အမှတ် ၁၂, စမ်းသပ်လမ်း, Sanchaung Tsp, Yangon',
        'ပစ္စည်း Dress / အရောင် Black / အရွယ် XL / အရေအတွက် 2 / ဈေး 25,000',
        'Product Handbag / Qty 1 / Price 18,000',
        'ပို့ခ ၃,၀၀၀',
        'ငွေလွှဲထား',
      ].join('\n'),
    );

    expect(result.suggested_order.customer).toEqual(
      expect.objectContaining({
        name: 'မေစမ်းသပ်',
        phone: '09 0001 2345',
        township: 'Sanchaung',
      }),
    );
    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Dress (Black, Size XL)',
        qty: 2,
        unit_price: 25000,
        line_total: 50000,
      }),
      expect.objectContaining({
        product_name: 'Handbag',
        qty: 1,
        unit_price: 18000,
        line_total: 18000,
      }),
    ]);
    expect(result.suggested_order.delivery_fee).toBe(3000);
    expect(result.suggested_order.status).toBe('confirmed');
    expect(result.parse_meta.is_ready_to_create).toBe(true);
  });

  it('lowers confidence and records missing fields when later items are incomplete', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Address: No. 12, Example Road, Sanchaung Tsp, Yangon',
        'Product: Silk Longyi Set',
        'Qty: 2',
        'Price: 18,000',
        'Product: Handbag',
        'Qty: 1',
        'Deli: 3,000',
      ].join('\n'),
    );

    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Silk Longyi Set',
        qty: 2,
        unit_price: 18000,
        line_total: 36000,
      }),
      expect.objectContaining({
        product_name: 'Handbag',
        qty: 1,
        unit_price: null,
        line_total: null,
      }),
    ]);
    expect(result.parse_meta.is_ready_to_create).toBe(false);
    expect(result.parse_meta.confidence).toBeLessThan(0.9);
    expect(result.parse_meta.confidence_breakdown.items).toBeLessThan(1);
    expect(result.parse_meta.missing_required_fields).toContain(
      'items.1.unit_price',
    );
    expect(result.parse_meta.field_evidence['customer.phone']).toEqual(
      expect.objectContaining({
        parser: 'labeled_phone',
        line_index: 1,
        source: 'message',
      }),
    );
  });

  it('prefers unit price over total when quantity and total appear on the same product line', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Product: Silk Longyi Set x2 18,000 total 36,000',
        'Deli: 3,000',
      ].join('\n'),
    );

    expect(result.suggested_order.items).toEqual([
      expect.objectContaining({
        product_name: 'Silk Longyi Set',
        qty: 2,
        unit_price: 18000,
        line_total: 36000,
      }),
    ]);
    expect(result.parse_meta.field_evidence['items.0.unit_price']).toEqual(
      expect.objectContaining({
        parser: 'price_from_quantity_total_pair',
        line_index: 2,
      }),
    );
  });

  it('normalizes township aliases from explicit township lines', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Township: San Chaung Township, Yangon',
        'Address: No. 12, Example Road',
        'Product: Handbag',
        'Qty: 1',
        'Price: 25,000',
      ].join('\n'),
    );

    expect(result.suggested_order.customer).toEqual(
      expect.objectContaining({
        township: 'Sanchaung',
      }),
    );
    expect(result.parse_meta.field_evidence['customer.township']).toEqual(
      expect.objectContaining({
        parser: 'labeled_township',
        line_index: 2,
      }),
    );
  });

  it('joins multi-line addresses and derives township from continuation lines', () => {
    const result = service.parseMessage(
      [
        'Name: May Sample',
        'Phone: 09 0001 2345',
        'Address: No. 12, Example Road',
        'San Chaung Township, Yangon',
        'Product: Handbag',
        'Qty: 1',
        'Price: 25,000',
      ].join('\n'),
    );

    expect(result.suggested_order.customer).toEqual(
      expect.objectContaining({
        township: 'Sanchaung',
        address: 'No. 12, Example Road, San Chaung Township, Yangon',
      }),
    );
    expect(result.parse_meta.field_evidence['customer.address']).toEqual(
      expect.objectContaining({
        parser: 'labeled_address_multiline',
        line_index: 2,
      }),
    );
    expect(result.parse_meta.field_evidence['customer.township']).toEqual(
      expect.objectContaining({
        parser: 'township_from_address',
      }),
    );
  });
});
