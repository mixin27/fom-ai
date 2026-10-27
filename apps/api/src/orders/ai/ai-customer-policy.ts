import { aiSourceItems } from './ai-item-policy';

/** A single colonless name in a completely recognized structured item message.
 * Do not guess names from positional text or constrain alternatives/corrections. */
export function aiCustomerNameFact(
  message: string,
): { value: string; lines: number[] } | undefined {
  if (
    /\b(?:correct|correction|instead|change|if|unless|maybe)\b|ပြင်|ပြောင်း|မဟုတ်|ဆိုရင်|သို့မဟုတ်|[?？]/i.test(
      message,
    )
  )
    return undefined;
  const names = message.split(/\r?\n/).flatMap((raw, i) => {
    const match =
      /^(?:customer name|customer|name|နာမည်)(?:\s*[:：]\s*|\s+)(.+)$/i.exec(
        raw.trim(),
      );
    return match
      ? [
          {
            value: match[1].trim(),
            lines: [i + 1],
            colon: /^(?:customer name|customer|name|နာမည်)\s*[:：]/i.test(
              raw.trim(),
            ),
          },
        ]
      : [];
  });
  if (names.length !== 1 || names[0].colon || !aiSourceItems(message))
    return undefined;
  const { value, lines } = names[0];
  if (
    value.length > 100 ||
    !/^[\p{L}\p{M} .’'\-]+$/u.test(value) ||
    /\b(?:or|and|not|printed|print|label|call|send|ignore|instructions|system)\b|ဆက်|ပို့|ယူ/i.test(
      value,
    )
  )
    return undefined;
  return { value, lines };
}
