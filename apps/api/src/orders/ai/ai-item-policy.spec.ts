import { aiSourceItems } from './ai-item-policy';
import { decodeAiDraft, prepareAiDraftForReview } from './ai-draft.contract';

const blocks =
  'Name: Test\nProduct: Shirt\nColor: Green\nSize: M\nQty: 2\nPrice: 18000\nProduct: Bag\nColor: Black\nQty: 1\nPrice: 25000\nDeli: 0';
const compact = 'Product: Shirt x2 18,000, Bag x1 25,000, Socks x3 2,000';
const wire = () => ({
  schema_version: '1.0',
  draft: {
    customer: { name: null, phone: null, township: null, address: null },
    items: [
      {
        product_name: 'Shirt (Green, Size M)',
        qty: 2,
        unit_price: null,
        sources: {
          product_name: [2, 3, 4],
          qty: [5],
          unit_price: [] as number[],
        },
      },
      {
        product_name: 'Bag (Black)',
        qty: 1,
        unit_price: 25000,
        sources: { product_name: [7, 8], qty: [9], unit_price: [10] },
      },
    ],
    delivery_fee: null,
    note: null,
  },
  sources: {
    customer: { name: [], phone: [], township: [], address: [] },
    delivery_fee: [],
    note: [],
  },
});

describe('explicit item source maps', () => {
  it('keeps each variant with its own product and exact original line numbers', () => {
    expect(aiSourceItems(blocks)).toEqual([
      {
        product_name: 'Shirt (Green, Size M)',
        name_lines: [2, 3, 4],
        item_lines: [2, 3, 4, 5, 6],
        qty_lines: [5],
        price_lines: [6],
        qty: 2,
        unit_price: null,
      },
      {
        product_name: 'Bag (Black)',
        name_lines: [7, 8],
        item_lines: [7, 8, 9, 10],
        qty_lines: [9],
        price_lines: [10],
        qty: 1,
        unit_price: 25000,
      },
    ]);
    expect(aiSourceItems(blocks.replaceAll('\n', '\r\n'))).toEqual(
      aiSourceItems(blocks),
    );
  });

  it('separates compact items without splitting thousands or parenthesized variants', () => {
    expect(aiSourceItems(compact)?.map((i) => [i.product_name, i.qty])).toEqual(
      [
        ['Shirt', 2],
        ['Bag', 1],
        ['Socks', 3],
      ],
    );
    expect(
      aiSourceItems(
        'Product: Shirt (Green, Size M) x၂ ၁၈,၀၀၀, Bag x၁ ၂၅,၀၀၀',
      )?.map((i) => [i.product_name, i.qty]),
    ).toEqual([
      ['Shirt (Green, Size M)', 2],
      ['Bag', 1],
    ]);
  });

  it('constrains explicit prices, preserving unknown versus zero and attribute order', () => {
    for (const [price, qty, expected] of [
      ['Price: 25,000', 'Qty: 1', 25000],
      ['Price: 25,000', 'Qty: 2', null],
      ['Unit price: 0', 'Qty: 2', 0],
      ['တစ်ထည်ဈေး: ၁၅,၀၀၀ ကျပ်', 'Qty: ၂', 15000],
      ['Unit price: 25000', '', 25000],
      ['Price: 25000', '', null],
    ] as const) {
      expect(
        aiSourceItems(`Product: Shirt\nColor: White\n${price}\n${qty}`)?.[0]
          .unit_price,
      ).toBe(expected);
    }
    expect(aiSourceItems(compact)?.map((i) => i.unit_price)).toEqual([
      null,
      25000,
      null,
    ]);
    const omitted = wire();
    omitted.draft.items[1].unit_price = null;
    expect(() => decodeAiDraft(omitted, blocks)).toThrow('invalid_schema');
    const swapped = wire();
    swapped.draft.items[1].unit_price = 18000;
    expect(() => decodeAiDraft(swapped, blocks)).toThrow('invalid_schema');
  });

  it('preserves Myanmar variant words and treats a bundle title as one product', () => {
    expect(
      aiSourceItems(
        'ပစ္စည်း: အင်္ကျီ\nအရောင်: အဖြူ\nဆိုဒ်: L\nအရေအတွက်: ၂\nဈေး: ၁၈၀၀၀',
      )?.[0].product_name,
    ).toBe('အင်္ကျီ (အဖြူ, Size L)');
    expect(
      aiSourceItems(
        'Product: Combo (Shirt, Bag)\nQty: 1\nProduct: Hat\nQty: 2',
      ),
    ).toHaveLength(2);
  });

  it.each([
    'Shirt x2 18000, Bag x1 25000',
    'Product: Shirt, Bag\nQty: 2',
    'Product: Shirt x2 18000, Bag',
    'Product: Shirt (Green, Size M x2 18000, Bag x1 25000',
    'Product: Shirt\nColor: Red or Blue',
    'Product: Shirt\nColor: Red, Blue\nQty: 2',
    'Product: Shirt\nSize: M and L\nQty: 2',
    'Product: Shirt\nColor: Red\nColor: Blue',
    'Product: Shirt\nQty: 2\nQty: 3\nProduct: Bag',
    'Product: Shirt\nQty: 2 packs of 4\nProduct: Bag',
    'Product: Shirt\nProduct: Shirt',
    'Product: Shirt x0 18000, Bag x1 25000',
    'Product: Shirt x2 18000, Bag x1 25000\nQty: 5',
    'Product: Shirt\nNote: replace it with Bag\nProduct: Hat',
    'Product: Shirt\nNote: ဒီဟာမယူတော့ပါ\nProduct: Hat',
    'Product: Shirt\nAddress: Street\nColor: Green',
    'Product: Shirt\nSize: M\nThis is unrelated text.',
  ])(
    'does not partially constrain an ambiguous or unsupported format: %s',
    (source) => {
      expect(aiSourceItems(source)).toBeNull();
    },
  );

  it('keeps amounts unknown and returns exact source quotations for every variant', () => {
    const result = decodeAiDraft(wire(), blocks);
    expect(result.draft.items[0].unit_price).toBeNull();
    expect(
      result.evidence
        .filter((e) => e.field === 'items.0.product_name')
        .map((e) => e.quote),
    ).toEqual(['Product: Shirt', 'Color: Green', 'Size: M']);
    expect(
      prepareAiDraftForReview(result, blocks).draft.items[1].unit_price,
    ).toBe(25000);
    const reordered = wire();
    reordered.draft.items.reverse();
    expect(decodeAiDraft(reordered, blocks).draft.items[0].product_name).toBe(
      'Bag (Black)',
    );
  });

  it('rejects dropped items, duplicated products and lost or crossed variant evidence', () => {
    const missing = wire();
    missing.draft.items.pop();
    expect(() => decodeAiDraft(missing, blocks)).toThrow('invalid_schema');
    const lost = wire();
    lost.draft.items[0].product_name = 'Shirt';
    expect(() => decodeAiDraft(lost, blocks)).toThrow('invalid_schema');
    const duplicate = wire();
    duplicate.draft.items[1] = duplicate.draft.items[0];
    expect(() => decodeAiDraft(duplicate, blocks)).toThrow(
      'item_source_mismatch',
    );
    for (const refs of [[2], [2, 3, 4, 8]]) {
      const bad = wire();
      bad.draft.items[0].sources.product_name = refs;
      expect(() => decodeAiDraft(bad, blocks)).toThrow('item_source_mismatch');
    }
    const wrongQty = wire();
    wrongQty.draft.items[0].qty = 1;
    expect(() => decodeAiDraft(wrongQty, blocks)).toThrow('invalid_schema');
    const crossPrice = wire();
    crossPrice.draft.items[1].sources.unit_price = [6];
    expect(() => decodeAiDraft(crossPrice, blocks)).toThrow(
      'item_source_mismatch',
    );
  });
});
