import { aiNoteFact } from './ai-note-policy';
import {
  aiQuantity,
  aiWordQuantitySupported,
  aiMyanmarUnitPriceSupported,
} from './ai-language-policy';
import { aiSourceItems } from './ai-item-policy';
import {
  decodeAiDraft,
  prepareAiDraftForReview,
  validateAiExtraction,
} from './ai-draft.contract';
import { aiAddressFacts } from './ai-address-policy';

const bundle =
  'ချည်သားတီရှပ် M ဆိုဒ် နှစ်ထည်ယူမယ်။\nအဖြူတစ်ထည် အနက်တစ်ထည်ပါ။\nနှစ်ထည်ပေါင်း ၁၄၀၀၀ ကျပါတယ်။\nပို့ခက သီးသန့်ပါ။';
const emptyCustomer = {
  name: null,
  phone: null,
  address: null,
  township: null,
};

describe('Myanmar quantities and variants', () => {
  it.each([
    ['တစ်ထည်', 1],
    ['နှစ်', 2],
    ['သုံးထုပ်', 3],
    ['၂ အုပ်', 2],
    ['ဆယ်ဘူး', 10],
    ['10000', 10000],
  ])('reads explicit count %s', (text, expected) => {
    expect(aiQuantity(String(text))).toBe(expected);
  });
  it.each([
    '0',
    '10001',
    '-1',
    '1.5',
    'နှစ်ဆယ်',
    '၂ထုပ် ၄ခုပါ',
    'တစ်ထုပ် 2500',
    'နှစ်ထည်လား',
    'နှစ်ထည်ဆိုရင်',
  ])('declines ambiguous or unsupported count %s', (text) =>
    expect(aiQuantity(text)).toBeNull(),
  );
  it('recognizes words only as quantity evidence, not pack contents or unit price', () => {
    expect(aiWordQuantitySupported('အရေအတွက်: နှစ်ထည်', 2)).toBe(true);
    expect(aiWordQuantitySupported('အင်္ကျီ တစ်ထည်ယူမယ်နော်။', 1)).toBe(true);
    expect(aiWordQuantitySupported('အဖြူတစ်ထည် အနက်တစ်ထည်ပါ။', 1)).toBe(true);
    for (const text of [
      'တစ်ထုပ် ၂၅၀၀ ပါ။',
      'လေးခုပါတဲ့အထုပ်',
      'နှစ်ထည်ဆိုရင်',
      'တစ်ထည်မယူပါ',
    ])
      expect(aiWordQuantitySupported(text, 1)).toBe(false);
  });
  it('keeps shared product/size with each colour without allocating a bundle total', () => {
    const items = aiSourceItems(bundle)!;
    expect(items.map((i) => [i.product_name, i.qty, i.unit_price])).toEqual([
      ['ချည်သားတီရှပ် M ဆိုဒ် အဖြူ', 1, null],
      ['ချည်သားတီရှပ် M ဆိုဒ် အနက်', 1, null],
    ]);
    const result = decodeAiDraft(
      {
        schema_version: '1.0',
        draft: {
          customer: emptyCustomer,
          items: items.map((i) => ({
            product_name: i.product_name,
            qty: i.qty,
            unit_price: i.unit_price,
            sources: {
              product_name: i.name_lines,
              qty: i.qty_lines,
              unit_price: [],
            },
          })),
          delivery_fee: null,
          note: null,
        },
        sources: {
          customer: { name: [], phone: [], address: [], township: [] },
          delivery_fee: [],
          note: [],
        },
      },
      bundle,
    );
    expect(
      result.evidence.filter((e) => e.field === 'items.1.qty')[0].quote,
    ).toBe('အဖြူတစ်ထည် အနက်တစ်ထည်ပါ။');
  });
  it.each([
    bundle.replace('နှစ်ထည်ယူ', 'သုံးထည်ယူ'),
    bundle.replace('အနက်တစ်ထည်', 'အနက်နှစ်ထည်'),
    bundle.replace('အနက်တစ်ထည်', 'အနက်တစ်ဘူး'),
    bundle.replace('အနက်တစ်ထည်', 'အဖြူတစ်ထည်'),
    bundle.replace('အနက်တစ်ထည်', 'သို့မဟုတ် အနက်တစ်ထည်'),
    bundle.replace('နှစ်ထည်ပေါင်း', 'သုံးထည်ပေါင်း'),
    bundle.replace('နှစ်ထည်ပေါင်း', 'နှစ်ဘူးပေါင်း'),
    bundle + '\nနောက်မှအတည်ပြုမယ်။',
    bundle + '\nProduct: Bag',
  ])('declines conflicting allocations or incomplete coverage', (text) =>
    expect(aiSourceItems(text)).toBeNull(),
  );
  it('supports numeric evidence for a word-labelled quantity without changing source quotes', () => {
    const quote = 'အရေအတွက်: သုံးထုပ်';
    const result = validateAiExtraction(
      {
        schema_version: '1.0',
        draft: {
          customer: emptyCustomer,
          items: [{ product_name: null, qty: 3, unit_price: null }],
          delivery_fee: null,
          note: null,
        },
        evidence: [{ field: 'items.0.qty', quote }],
      },
      quote,
    );
    expect(result.draft.items[0].qty).toBe(3);
    expect(result.evidence[0].quote).toBe(quote);
  });
  it('preserves per-pack/per-book prices but not a different total on the same line', () => {
    for (const quote of [
      'တစ်ထုပ် ၂၅၀၀ ပါ။',
      'တစ်အုပ်ဈေး: ၂,၅၀၀ ကျပ်',
      '၂အုပ် တစ်အုပ် ၂၅၀၀',
    ]) {
      expect(aiMyanmarUnitPriceSupported(quote, 2500)).toBe(true);
      const extraction = {
        schema_version: '1.0' as const,
        draft: {
          customer: emptyCustomer,
          items: [{ product_name: null, qty: 2, unit_price: 2500 }],
          delivery_fee: null,
          note: null,
        },
        evidence: [{ field: 'items.0.unit_price', quote }],
      };
      expect(
        prepareAiDraftForReview(extraction).draft.items[0].unit_price,
      ).toBe(2500);
    }
    expect(aiMyanmarUnitPriceSupported('တစ်ထုပ် ၂၅၀၀ ပေါင်း ၇၅၀၀', 7500)).toBe(
      false,
    );
    expect(aiMyanmarUnitPriceSupported('၃ထုပ်ပေါင်း ၇၅၀၀', 7500)).toBe(false);
  });
});

describe('source policy contrast cases', () => {
  it('withholds a line total even if its evidence also contains a per-unit label', () => {
    const result = prepareAiDraftForReview({
      schema_version: '1.0',
      draft: {
        customer: emptyCustomer,
        items: [{ product_name: null, qty: 3, unit_price: 7500 }],
        delivery_fee: null,
        note: null,
      },
      evidence: [
        { field: 'items.0.unit_price', quote: 'တစ်ခုဈေး: ၂၅၀၀ ပေါင်း ၇၅၀၀' },
      ],
    });
    expect(result.draft.items[0].unit_price).toBeNull();
  });
  it('does not invent a township from a street fragment or override a separate township', () => {
    expect(
      aiAddressFacts('Address: No 5 Hlaing Township').township,
    ).toBeUndefined();
    expect(
      aiAddressFacts('Township: Other\nAddress: Road, Hlaing Township')
        .township,
    ).toBeUndefined();
  });
});

describe('address source completeness', () => {
  const source =
    'လိပ်စာ: အမှတ် ၁၂၊ စမ်းသပ်လမ်း\nလှိုင်မြို့နယ်\nရန်ကုန်\nပစ္စည်း: ပတ္တူအိတ်';
  const wire = () => ({
    schema_version: '1.0',
    draft: {
      customer: {
        ...emptyCustomer,
        address: 'အမှတ် ၁၂၊ စမ်းသပ်လမ်း\nလှိုင်မြို့နယ်\nရန်ကုန်',
        township: 'လှိုင်',
      },
      items: [],
      delivery_fee: null,
      note: null,
    },
    sources: {
      customer: { name: [], phone: [], address: [1, 2, 3], township: [2] },
      delivery_fee: [],
      note: [],
    },
  });
  it('retains all continuation lines and extracts only an explicit township marker', () => {
    expect(aiAddressFacts(source)).toEqual({
      address: { value: wire().draft.customer.address, lines: [1, 2, 3] },
      township: { value: 'လှိုင်', lines: [2] },
    });
    expect(
      aiAddressFacts('Address: No. 12, Road, Sanchaung Tsp, Yangon').township
        ?.value,
    ).toBe('Sanchaung');
    expect(
      aiAddressFacts('Address: Building A, Hlaing').township,
    ).toBeUndefined();
    expect(decodeAiDraft(wire(), source).draft.customer.address).toBe(
      wire().draft.customer.address,
    );
    const missing = wire();
    missing.sources.customer.address = [1];
    expect(() => decodeAiDraft(missing, source)).toThrow(
      'address_source_mismatch',
    );
    const shortened = wire();
    shortened.draft.customer.address = 'အမှတ် ၁၂၊ စမ်းသပ်လမ်း';
    expect(() => decodeAiDraft(shortened, source)).toThrow('invalid_schema');
  });
  it.each([
    'Address: First\nAddress: Second',
    'Address: First\nCorrect address: Second',
    'လိပ်စာ: အဟောင်း\nလိပ်စာပြောင်းမယ်',
    'Address: First\nAn unrecognized continuation street',
    'Address: If available, First',
  ])('does not freeze conflicting or unknown address structure', (text) =>
    expect(aiAddressFacts(text)).toEqual({}),
  );
});

describe('complete labelled note policy', () => {
  it('leaves ordinary messages and standalone fulfillment notes on the unchanged path', () => {
    expect(aiNoteFact('Product: Bag\nQty: 1')).toBeUndefined();
    expect(
      aiNoteFact('Product: Bag\nNote: Call before delivery'),
    ).toBeUndefined();
  });
  it('enforces note content and complete original evidence at the output boundary', () => {
    const source = 'Product: Bag\nNote: Call before delivery\nငွေလွှဲပြီး';
    const value = {
      schema_version: '1.0',
      draft: {
        customer: emptyCustomer,
        items: [],
        delivery_fee: null,
        note: 'Call before delivery',
      },
      sources: {
        customer: { name: [], phone: [], township: [], address: [] },
        delivery_fee: [],
        note: [2],
      },
    };
    expect(decodeAiDraft(value, source).draft.note).toBe(
      'Call before delivery',
    );
    value.sources.note = [];
    expect(() => decodeAiDraft(value, source)).toThrow('missing_evidence');
    value.sources.note = [2];
    value.draft.note = 'Payment received';
    expect(() => decodeAiDraft(value, source)).toThrow('invalid_schema');
  });
  it('omits payment-only and correction-only prose while preserving a separate fulfillment note', () => {
    const source =
      'နာမည်: စမ်းသပ်သူ\nဖုန်း: ၀၉၀၀၀၀၀၀၀၀၅\nပစ္စည်း: အိတ်\nဖုန်းနံပါတ်ပြင်ပါမယ်။ အရင်နံပါတ်မသုံးတော့ပါ။ ၀၉၀၀၀၀၀၀၀၀၆ ကိုသုံးပေးပါ။';
    expect(aiNoteFact(source)).toEqual({ value: null, lines: [] });
    expect(aiNoteFact(source + '\nမှတ်ချက်: မရောက်ခင် ဖုန်းဆက်ပါ။')).toEqual({
      value: 'မရောက်ခင် ဖုန်းဆက်ပါ။',
      lines: [5],
    });
    expect(aiNoteFact('Product: Bag\nငွေလွှဲပြီး')).toEqual({
      value: null,
      lines: [],
    });
  });
  it('declines unknown fulfillment text or combined correction and fulfillment instructions', () => {
    expect(
      aiNoteFact('Product: Bag\nအားလုံးတစ်ခါတည်းပို့ပေးပါ။'),
    ).toBeUndefined();
    expect(
      aiNoteFact(
        'Product: Bag\nဖုန်းနံပါတ်ပြင်ပါမယ်။ မရောက်ခင်ဖုန်းဆက်ပါ။ ၀၉၀၀၀၀၀၀၀၀၆ ကိုသုံးပေးပါ။',
      ),
    ).toBeUndefined();
    expect(aiNoteFact('Note: ငွေလွှဲပြီး မပို့ခင်ဖုန်းဆက်ပါ')).toBeUndefined();
  });
});
