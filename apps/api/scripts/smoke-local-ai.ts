// Explicit local inference check. Does not bootstrap Nest or access a database.
import { AiDraftService } from '../src/orders/ai/ai-draft.service';

type Sample = {
  name: string;
  message: string;
  phone: string;
  prices: (number | null)[];
  quantities: number[];
  fee: number | null;
  addressIncludes?: string[];
};
const samples: Sample[] = [
  {
    name: 'english',
    message:
      'Name: Test Customer\nPhone: 09123456789\nProduct: Green shirt\nQty: 2\nUnit price: 18000 MMK each\nDelivery fee: 0',
    phone: '09123456789',
    prices: [18000],
    quantities: [2],
    fee: 0,
  },
  {
    name: 'myanmar',
    message: `နာမည်: စမ်းသပ်ဝယ်သူ
ဖုန်း: ၀၉၇၀၀၀၀၀၀၂
လိပ်စာ: အမှတ် ၁၅၊ စမ်းသပ်လမ်း
လှိုင်မြို့နယ်၊ ရန်ကုန်မြို့

ပစ္စည်း: ချည်သားအင်္ကျီ
အရောင်: အဖြူ
ဆိုဒ်: L
အရေအတွက်: ၂ ထည်
တစ်ထည်ဈေး: ၁၅,၀၀၀ ကျပ်

ပို့ခ: ၂,၅၀၀ ကျပ်
မှတ်ချက်: မပို့ခင် ဖုန်းဆက်ပေးပါ။`,
    phone: '0970000002',
    prices: [15000],
    quantities: [2],
    fee: 2500,
    addressIncludes: ['အမှတ် ၁၅', 'လှိုင်မြို့နယ်', 'ရန်ကုန်မြို့'],
  },
  {
    name: 'mixed',
    message: `Customer: စမ်းသပ်ဝယ်သူ
Ph: 09 7000 0003
Address: အမှတ် ၂၀၊ Sample Street၊ တာမွေမြို့နယ်၊ Yangon

Black T-shirt / Size XL
Qty: 3
တစ်ထည်ဈေး: 12,000 MMK

White Sneakers / Size 40
Qty: 1
တစ်ရံဈေး: 35,000 MMK

Delivery fee: 0 MMK — free delivery
Note: စနေနေ့ မနက်ပိုင်း ပို့ပေးပါ။`,
    phone: '0970000003',
    prices: [12000, 35000],
    quantities: [3, 1],
    fee: 0,
  },
  {
    name: 'ambiguous-price',
    message: `Name: Test Customer
Phone: 0970000004
Address: No. 8, Sample Road, Yankin, Yangon
Product: Green Longyi
Qty: 2
Price: 18,000 MMK
Delivery fee: 3,000 MMK`,
    phone: '0970000004',
    prices: [null],
    quantities: [2],
    fee: 3000,
  },
  {
    name: 'corrections',
    message: `Name: Test Customer
Phone: 0970000005
Address: No. 10, Sample Street, Hlaing, Yangon

Product: USB-C Cable
Qty: 2

Correction: The phone number above is wrong.
Use 0970000006 instead.

Correction: Deliver to No. 22, Example Street,
Kamayut Township, Yangon instead of the first address.

Please call before delivery.`,
    phone: '0970000006',
    prices: [null],
    quantities: [2],
    fee: null,
    addressIncludes: ['No. 22', 'Example Street', 'Kamayut', 'Yangon'],
  },
];

async function main() {
  const selected = process.argv.includes('--all')
    ? samples
    : samples.filter(
        (sample) =>
          sample.name ===
          (process.argv.includes('--myanmar') ? 'myanmar' : 'english'),
      );
  let failures = 0;
  for (const sample of selected) {
    try {
      const result = await new AiDraftService().extract(sample.message);
      const { draft } = result;
      const errors = [
        ...(draft.customer.phone === sample.phone ? [] : ['phone']),
        ...(draft.items.length === sample.prices.length ? [] : ['item_count']),
        ...(draft.delivery_fee === sample.fee ? [] : ['delivery_fee']),
        ...sample.prices.flatMap((price, index) =>
          draft.items[index]?.unit_price === price
            ? []
            : [`items.${index}.unit_price`],
        ),
        ...sample.quantities.flatMap((qty, index) =>
          draft.items[index]?.qty === qty ? [] : [`items.${index}.qty`],
        ),
        ...((sample.addressIncludes ?? []).every((part) =>
          draft.customer.address?.includes(part),
        )
          ? []
          : ['address']),
        ...(sample.name === 'corrections' &&
        draft.note !== 'Please call before delivery.'
          ? ['correction_note']
          : []),
      ];
      if (errors.length) failures++;
      console.log(
        JSON.stringify({
          success: !errors.length,
          sample: sample.name,
          errors,
          model: result.model,
          elapsed_ms: result.elapsed_ms,
          evidence_fields: result.evidence.length,
          writes: 0,
        }),
      );
    } catch (error) {
      failures++;
      console.error(
        JSON.stringify({
          success: false,
          sample: sample.name,
          error: error instanceof Error ? error.message : 'Unknown failure',
          writes: 0,
        }),
      );
    }
  }
  if (failures)
    throw new Error(
      `${failures} synthetic development checks failed. No automatic retries.`,
    );
}
main().catch((error: unknown) => {
  if (error instanceof Error) console.error(error.message);
  console.error(
    'Local AI smoke check failed; no order was created. Check the launcher and rerun explicitly.',
  );
  process.exitCode = 1;
});
