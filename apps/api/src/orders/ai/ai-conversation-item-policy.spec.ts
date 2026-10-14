import { aiSourceItems } from './ai-item-policy';
import {
  aiQuantityCorrection,
  aiWordQuantitySupported,
} from './ai-language-policy';
import { decodeAiDraft, prepareAiDraftForReview } from './ai-draft.contract';

const source =
  'အုန်းကရေကရာ ၂၅ကျပ်သားဘူး ၂ဘူးယူမယ်။\nတစ်ဘူး ၇၅၀၀ ပါ။\nအဲ မင်မင် ၂ဘူးမဟုတ်ဘူး ၃ဘူးလုပ်ပေးပါနော်။\nဒီအော်ဒါ ပို့ခအခမဲ့ပါ။';
const wire = (message: string) => ({
  schema_version: '1.0',
  draft: {
    customer: { name: null, phone: null, address: null, township: null },
    items: aiSourceItems(message)!.map((item) => ({
      product_name: item.product_name,
      qty: item.qty,
      unit_price: item.unit_price,
      sources: {
        product_name: item.name_lines,
        qty: item.qty_lines,
        unit_price: item.price_lines,
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
});

describe('complete single-product conversation constraints', () => {
  it('keeps package weight in the description and uses the corrected count and its source', () => {
    expect(aiSourceItems(source)).toEqual([
      {
        product_name: 'အုန်းကရေကရာ ၂၅ကျပ်သားဘူး',
        qty: 3,
        unit_price: 7500,
        name_lines: [1],
        qty_lines: [3],
        price_lines: [2],
        item_lines: [1, 2, 3],
      },
    ]);
    const result = decodeAiDraft(wire(source), source);
    expect(prepareAiDraftForReview(result).draft.items[0]).toEqual({
      product_name: 'အုန်းကရေကရာ ၂၅ကျပ်သားဘူး',
      qty: 3,
      unit_price: 7500,
    });
    expect(result.evidence.find((e) => e.field === 'items.0.qty')?.quote).toBe(
      source.split('\n')[2],
    );
    const stale = wire(source);
    stale.draft.items[0].qty = 2;
    expect(() => decodeAiDraft(stale, source)).toThrow('invalid_schema');
    const staleEvidence = wire(source);
    staleEvidence.draft.items[0].sources.qty = [1];
    expect(() => decodeAiDraft(staleEvidence, source)).toThrow(
      'item_source_mismatch',
    );
  });
  it('preserves pack contents, explicit zero prices, product codes and variants', () => {
    expect(
      aiSourceItems(
        'ငှက်ပျောမုန့် ၄ခုပါတဲ့အထုပ် ၃ထုပ်ယူပါမယ်။\nတစ်ထုပ် ၂၅၀၀ ပါ။\nပို့ခ ၂၀၀၀ နဲ့ အိမ်ရောက်ငွေချေပါမယ်။',
      )?.[0],
    ).toMatchObject({
      product_name: 'ငှက်ပျောမုန့် ၄ခုပါတဲ့အထုပ်',
      qty: 3,
      unit_price: 2500,
    });
    expect(
      aiSourceItems(
        'မင်မင် C321 ဂျာကင် အနီရောင် M ဆိုဒ် တစ်ထည်ယူမယ်နော်။\nတစ်ထည် ၀ ပါ။',
      )?.[0],
    ).toMatchObject({
      product_name: 'C321 ဂျာကင် အနီရောင် M ဆိုဒ်',
      qty: 1,
      unit_price: 0,
    });
  });
  it('supports count words and chained corrections only when the old count matches', () => {
    const words = source.replace(
      '၂ဘူးမဟုတ်ဘူး ၃ဘူး',
      'နှစ်ဘူးမဟုတ်ဘူး သုံးဘူး',
    );
    expect(decodeAiDraft(wire(words), words).draft.items[0].qty).toBe(3);
    expect(
      aiWordQuantitySupported('နှစ်ဘူးမဟုတ်ဘူး သုံးဘူးလုပ်ပေးပါ။', 3),
    ).toBe(true);
    expect(
      aiWordQuantitySupported('နှစ်ဘူးမဟုတ်ဘူး သုံးဘူးလုပ်ပေးပါ။', 2),
    ).toBe(false);
    expect(
      aiSourceItems(source + '\n၃ဘူးမဟုတ်ဘူး ၄ဘူးလုပ်ပေးပါ။')?.[0],
    ).toMatchObject({ qty: 4, qty_lines: [5] });
  });
  it.each([
    source.replace('၂ဘူးမဟုတ်ဘူး', '၁ဘူးမဟုတ်ဘူး'),
    source.replace('အုန်းကရေကရာ', 'မုန့် နှင့် အုန်းကရေကရာ'),
    source.replace('အုန်းကရေကရာ', 'မုန့်နဲ့ အုန်းကရေကရာ'),
    source.replace('၃ဘူးလုပ်', '၃ထုပ်လုပ်'),
    source.replace('တစ်ဘူး ၇၅၀၀', 'တစ်ထုပ် ၇၅၀၀'),
    source.replace('၃ဘူးလုပ်', '၀ဘူးလုပ်'),
    source.replace('လုပ်ပေးပါနော်။', 'လုပ်ပေးပါနော်လား။'),
    source.replace('လုပ်ပေးပါနော်။', 'လုပ်ပေးပါနော်။ မဟုတ်သေးဘူး။'),
    source + '\nမယူတော့ပါ။',
    source + '\nအိတ် ၁လုံးလည်းထည့်ပေးပါ။',
    source + '\n၂ဘူးမဟုတ်ဘူး ၄ဘူးလုပ်ပေးပါ။',
    source.replace('၇၅၀၀', '၇,၅၀'),
    source.replace('၂ဘူးယူမယ်', '၂ဘူးဆိုရင်ယူမယ်'),
    source.replace('၂ဘူးယူမယ်', '၁၀၀၀၁ဘူးယူမယ်'),
    source.replace('တစ်ဘူး ၇၅၀၀ ပါ။', 'နှစ်ဘူးပေါင်း ၇၅၀၀ ပါ။'),
    source.replace('တစ်ဘူး ၇၅၀၀ ပါ။', 'တစ်ဘူး ၇၅၀၀ ပါ။\nတစ်ဘူး ၈၀၀၀ ပါ။'),
  ])(
    'declines a conflict, alternative, extra order or unsupported line',
    (message) => expect(aiSourceItems(message)).toBeNull(),
  );
  it.each([
    'နှစ်ဘူးမဟုတ်ဘူး သုံးဘူးလုပ်ပေးပါ။ ဆိုရင်',
    'တစ်ဘူး ၇၅၀၀ ပါ။',
    'နှစ်ဘူးမဟုတ်ဘူး သုံးထုပ်လုပ်ပေးပါ။',
  ])('does not accept an incomplete/conditional correction', (line) =>
    expect(aiQuantityCorrection(line)).toBeNull(),
  );
  it('preserves original source offsets around blank lines and retains fulfillment instructions', () => {
    const spaced =
      '\n' + source.replaceAll('\n', '\r\n\r\n') + '\nမပို့ခင် ဖုန်းဆက်ပေးပါ။';
    expect(aiSourceItems(spaced)?.[0]).toMatchObject({
      name_lines: [2],
      price_lines: [4],
      qty_lines: [6],
    });
    expect(
      decodeAiDraft(wire(spaced), spaced).evidence.some((e) =>
        e.quote.includes('လုပ်ပေးပါ'),
      ),
    ).toBe(true);
  });
});
