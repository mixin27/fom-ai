import type { AiSourceItem } from './ai-item-policy';
import {
  aiQuantity,
  aiQuantityCorrection,
  myanmarCount,
  myanmarUnit,
} from './ai-language-policy';

/** Complete single-product order/price/correction messages only. */
export function aiConversationItem(message: string): AiSourceItem[] | null {
  const lines = message
    .split(/\r?\n/)
    .flatMap((text, index) =>
      text.trim() ? [{ text: text.trim(), line: index + 1 }] : [],
    );
  if (lines.length < 2) return null;
  const order = new RegExp(
    `^(?:မင်မင်\\s+)?(.+?)\\s+(${myanmarCount})\\s*(${myanmarUnit})ယူ(?:ပါ)?မယ်(?:နော်)?[။.!]*$`,
  ).exec(lines[0].text);
  if (
    !order ||
    order[1].length > 1000 ||
    /[,၊:："“”‘’`?？]|နှင့်|နဲ့|ဆိုရင်|သို့မဟုတ်|မယူ|မလို|မဟုတ်|\b(?:if|unless|not|or|and)\b/i.test(
      lines[0].text,
    )
  )
    return null;
  let qty = aiQuantity(order[2]);
  if (qty === null) return null;
  const price = new RegExp(
    `^တစ်(${myanmarUnit})(?:ဈေး|စျေး|လျှင်)?\\s*[:：]?\\s*([0-9၀-၉]+(?:,[0-9၀-၉]{3})*)(?:\\s*ကျပ်)?\\s*ပါ[။.!]*$`,
  ).exec(lines[1].text);
  if (!price || price[1] !== order[3]) return null;
  const unitPrice = Number(
    price[2]
      .replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040))
      .replace(/,/g, ''),
  );
  if (!Number.isSafeInteger(unitPrice) || unitPrice > 1000000000) return null;
  let qtyLine = lines[0].line;
  const itemLines = [lines[0].line, lines[1].line];
  for (const line of lines.slice(2)) {
    const correction = aiQuantityCorrection(line.text);
    if (correction) {
      if (correction.before !== qty || correction.unit !== order[3])
        return null;
      qty = correction.after;
      qtyLine = line.line;
      itemLines.push(line.line);
      continue;
    }
    // These closed ancillary forms contain no extra products or item choices.
    // They remain visible to the model for delivery/notes, not discarded.
    if (/^(?:ဒီအော်ဒါ\s*)?ပို့ခအခမဲ့ပါ[။.!]*$/.test(line.text)) continue;
    if (
      /^ပို့ခ\s*[0-9၀-၉]+(?:,[0-9၀-၉]{3})*\s*(?:ပါ|နဲ့\s*အိမ်ရောက်ငွေချေပါမယ်)[။.!]*$/.test(
        line.text,
      )
    )
      continue;
    if (
      /^[^,၊:：?？\s]+မြို့နယ်ကို\s*ပို့ပေးပါ။\s*ပို့ခဘယ်လောက်လဲ။$/.test(
        line.text,
      )
    )
      continue;
    if (
      /^(?:မှတ်ချက်\s*[:：]\s*)?(?:မရောက်ခင်|မပို့ခင်)\s*ဖုန်းဆက်(?:ပေး)?ပါ[။.!]*$/.test(
        line.text,
      )
    )
      continue;
    return null;
  }
  return [
    {
      product_name: order[1],
      name_lines: [lines[0].line],
      item_lines: itemLines,
      qty_lines: [qtyLine],
      price_lines: [lines[1].line],
      qty,
      unit_price: unitPrice,
    },
  ];
}
