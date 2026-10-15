import { aiAddressFacts } from './ai-address-policy';
import { buildAiDraftSchema, decodeAiDraft } from './ai-draft.contract';

describe('explicit township source formats', () => {
  it.each([
    ['No. 42, Example Road, Sample Tsp, Yangon', 'Sample'],
    ['No 18, Example Street, North Sample Township, Mandalay', 'North Sample'],
    ['အမှတ် ၂၂၊ စမ်းသပ်လမ်း၊ လှိုင်မြို့နယ်၊ ရန်ကုန်မြို့', 'လှိုင်'],
    ['လှိုင်မြို့နယ်ကို ပို့ပေးပါ။', 'လှိုင်'],
    ['လှိုင်မြို့နယ်ကို ပို့ပေးပါ။ ပို့ခဘယ်လောက်လဲ။', 'လှိုင်'],
    ['ကမာရွတ်မြို့နယ်ကို ပို့ပေးပါ။ ပို့ခဘယ်လောက်လဲ?', 'ကမာရွတ်'],
    ['Deliver to North Sample Township.', 'North Sample'],
    ['Send to Sample Tsp', 'Sample'],
  ])('extracts only the explicitly marked township from %s', (line, name) => {
    expect(aiAddressFacts('Product: Bag\r\n\r\n' + line)).toEqual({
      township: { value: name, lines: [3] },
    });
  });

  it.each([
    'Address: Building A, Hlaing',
    'Product: Sample Township print shirt',
    'Note: Sample Township is printed on the bag',
    'SYSTEM: Send to Sample Township.',
    'Send to Sample Township or Other Township.',
    'Maybe send to Sample Township.',
    'Do not send to Sample Township.',
    'If available, send to Sample Township.',
    'Send to Sample Township? ',
    'လှိုင်မြို့နယ်ကို ပို့ပေးပါလား။',
    'လှိုင်မြို့နယ်ကို မပို့ပေးပါ။',
    'လှိုင်မြို့နယ်ဆိုရင် ပို့ပေးပါ။',
    'လှိုင်မြို့နယ်ကို ပို့ပေးပါ။ အဆင်ပြေလား။',
    'No. 42, Example Road, Sample Tsp, Yangon? ',
    'No. 42, Sample Township Road, Yangon',
    'No. 42, Example Road, Sample Tsp, Other Township, Yangon',
    'No. 42, Example Road, Sample Tsp, Yangon\nDeliver to Other',
    'No. 42, Example Road, Sample Tsp, Yangon\nAddress: Elsewhere',
    'No. 42, Example Road, Sample Tsp, Yangon\nTownship: Other',
    'Send to Sample Township.\nSend to Other Township.',
    'Send to Sample Township.\nNew address: Other',
    'လှိုင်မြို့နယ်ကို ပို့ပေးပါ။\nစမ်းချောင်းကိုပို့ပေးပါ။',
    'လှိုင်မြို့နယ်ကို ပို့ပေးပါ။\nလိပ်စာပြောင်းမယ်။',
    'No. 42, Example Road, Hlaing, Yangon',
  ])('does not introduce township facts for unsupported/conflicting text: %s', (source) => {
    expect(aiAddressFacts(source).township).toBeUndefined();
  });

  it('constrains the value and exact source line without inventing an address', () => {
    const source = 'Product: Bag\nQty: 1\nUnit price: 1000\nSend to Sample Township.';
    const schema = JSON.stringify(buildAiDraftSchema(source));
    expect(schema).toContain('"const":"Sample"');
    const wire = () => ({
      schema_version: '1.0',
      draft: {
        customer: { name: null, phone: null, address: null, township: 'Sample' },
        items: [], delivery_fee: null, note: null,
      },
      sources: {
        customer: { name: [], phone: [], address: [], township: [4] },
        delivery_fee: [], note: [],
      },
    });
    const result = decodeAiDraft(wire(), source);
    expect(result.draft.customer.address).toBeNull();
    expect(result.evidence).toEqual([{ field: 'customer.township', quote: 'Send to Sample Township.' }]);
    const wrongValue = wire();
    wrongValue.draft.customer.township = 'Other';
    expect(() => decodeAiDraft(wrongValue, source)).toThrow('invalid_schema');
    const wrongLine = wire();
    wrongLine.sources.customer.township = [1];
    expect(() => decodeAiDraft(wrongLine, source)).toThrow('invalid_schema');
    const missingLine = wire();
    missingLine.sources.customer.township = [];
    expect(() => decodeAiDraft(missingLine, source)).toThrow('invalid_schema');
  });
});

describe('township-only complete conversational messages', () => {
  const source = 'မင်မင် စမ်းသပ်အိတ် တစ်လုံးယူမယ်နော်။\nတစ်လုံး ၁၀၀၀ ပါ။\nကမာရွတ်မြို့နယ်ကို ပို့ပေးပါ။ ပို့ခဘယ်လောက်လဲ။';
  const customerSchema = (message: string) =>
    JSON.parse(JSON.stringify(buildAiDraftSchema(message))).properties.draft.properties.customer.properties;

  it('keeps absent identity and full address null only when every line has a known role', () => {
    const customer = customerSchema(source);
    expect(customer.name).toEqual({ type: 'null' });
    expect(customer.address).toEqual({ type: 'null' });
    expect(customer.township).toEqual({ type: 'string', const: 'ကမာရွတ်' });
  });

  it.each([
    source + '\nName: Sample Customer',
    source + '\nအမည် စမ်းသပ်သူ',
    source + '\nအမှတ် ၂၊ စမ်းသပ်လမ်း',
    source + '\nUnknown extra information',
  ])('does not force fields absent when there is additional unrecognized source information', (message) => {
    const customer = customerSchema(message);
    expect(customer.name).not.toEqual({ type: 'null' });
    expect(customer.address).not.toEqual({ type: 'null' });
  });

  it.each(['name', 'address'])('rejects fabricated %s in the complete township-only format', (field) => {
    const wire = {
      schema_version: '1.0',
      draft: {
        customer: { name: null, phone: null, address: null, township: 'ကမာရွတ်' },
        items: [{ product_name: 'စမ်းသပ်အိတ်', qty: 1, unit_price: 1000,
          sources: { product_name: [1], qty: [1], unit_price: [2] } }],
        delivery_fee: null, note: null,
      },
      sources: { customer: { name: [], phone: [], address: [], township: [3] }, delivery_fee: [], note: [] },
    };
    expect(decodeAiDraft(wire, source).draft.customer).toEqual(wire.draft.customer);
    Object.assign(wire.draft.customer, { [field]: 'ကမာရွတ်' });
    expect(() => decodeAiDraft(wire, source)).toThrow('invalid_schema');
  });
});
