import { aiCustomerNameFact } from './ai-customer-policy';
import { aiAddressFacts } from './ai-address-policy';
import { aiSourceItems } from './ai-item-policy';
import { analyzeAiPhoneSource } from './ai-phone-policy';

export type AiNoteFact = { value: string | null; lines: number[] };
const paymentOnly =
  /^(?:ငွေလွှဲပြီး|ငွေလွှဲထား|အိမ်ရောက်ငွေချေပါမယ်|ရောက်မှငွေရှင်းမယ်)[။.!]*$/;
const businessLabel =
  /^(?:name|customer name|customer|phone|ph|address|township|product|color|colour|size|qty|quantity|price|unit price|deli|delivery fee|နာမည်|ဖုန်း|လိပ်စာ|ပစ္စည်း|အရောင်|ဆိုဒ်|အရွယ်|အရေအတွက်|ဈေး|စျေး|တစ်ခုဈေး|တစ်ထည်ဈေး|တစ်ရံဈေး|ပို့ခ)\s*[:：]\s*.+$/i;

/** Complete labelled messages only. An unknown line may contain a genuine
 * fulfillment instruction, so it prevents a deterministic empty-note decision. */
export function aiNoteFact(message: string): AiNoteFact | undefined {
  const notes: string[] = [],
    refs: number[] = [];
  const phone = analyzeAiPhoneSource(message);
  // Colonless lines are excluded only when their role is independently known.
  // An arbitrary labelled-looking sentence must not erase a fulfillment note.
  const itemMap = aiSourceItems(message);
  const itemLines = new Set(itemMap?.flatMap((item) => item.item_lines) ?? []);
  const name = aiCustomerNameFact(message);
  const addressLines = new Set(aiAddressFacts(message).address?.lines ?? []);
  let excluded = false;
  for (const [index, raw] of message.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const note = /^(?:note|မှတ်ချက်)\s*[:：]\s*(.+)$/i.exec(line);
    if (note) {
      if (paymentOnly.test(note[1])) {
        excluded = true;
        continue;
      }
      // Mixed payment/correction and fulfillment prose needs interpretation.
      if (/ငွေ|ပြင်|ပြောင်း|\b(?:payment|paid|correction)\b/i.test(note[1]))
        return undefined;
      notes.push(note[1]);
      refs.push(index + 1);
      continue;
    }
    if (businessLabel.test(line)) continue;
    if (
      itemMap &&
      (itemLines.has(index + 1) ||
        name?.lines.includes(index + 1) ||
        addressLines.has(index + 1) ||
        /^(?:phone|ph|ဖုန်း)\s+[+0-9၀-၉][0-9၀-၉ \t().-]*[0-9၀-၉]$/i.test(
          line,
        ) ||
        /^(?:deli|delivery fee|ပို့ခ)\s+[0-9၀-၉]+(?:,[0-9၀-၉]{3})*(?:\s*(?:MMK|ကျပ်))?$/i.test(
          line,
        ))
    )
      continue;
    if (paymentOnly.test(line)) {
      excluded = true;
      continue;
    }
    // Exclude only the whole recognized directive, never a line that also asks
    // for a call before delivery or carries another fulfillment instruction.
    if (
      phone.status === 'corrected' &&
      phone.correctionLine === index + 1 &&
      /^ဖုန်းနံပါတ်(?:ပြင်ပါမယ်|ပြောင်းပါမယ်)[။\s]*(?:အရင်နံပါတ်မသုံးတော့ပါ[။\s]*)?[+0-9၀-၉][0-9၀-၉ \t().-]*\s*ကို(?:ပဲ)?(?:သုံးပေးပါ|ဆက်ပေးပါ)[။.!\s]*$/.test(
        line,
      )
    ) {
      excluded = true;
      continue;
    }
    return undefined;
  }
  // Avoid changing inference context for ordinary messages without excluded
  // prose. Explicit notes alone continue through the established model path.
  if (!excluded) return undefined;
  const value = notes.length ? notes.join('\n') : null;
  if (value && value.length > 1000) return undefined;
  return { value, lines: refs };
}
