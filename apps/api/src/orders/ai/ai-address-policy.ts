export type AiAddressFact = { value: string; lines: number[] };
export type AiAddressFacts = {
  address?: AiAddressFact;
  township?: AiAddressFact;
};

// Only explicit township markers: no guessing cities/townships from a gazetteer.
function township(value: string): string | undefined {
  const matches = [
    ...value.matchAll(
      /(?:^|[,၊\n])\s*([^,၊\n:：]+?)\s*(?:\bTsp\b|\bTownship\b|မြို့နယ်)(?=$|[,၊\s။])/gi,
    ),
  ];
  const name = matches.length === 1 ? matches[0][1].trim() : undefined;
  return name && !/[0-9၀-၉]/.test(name) ? name : undefined;
}

function labelledAddressFacts(message: string): AiAddressFacts {
  const lines = message.split(/\r?\n/);
  // Corrections, conflicting destinations and conditional addresses need a
  // conversational decision; never freeze an earlier labelled address.
  if (
    /\b(?:correct|correction|new address|instead|change|if|unless)\b|ပြောင်း|ပြင်|မဟုတ်|ဆိုရင်|[?？]/i.test(
      message,
    )
  )
    return {};
  const starts = lines.flatMap((line, i) =>
    /^(?:address|လိပ်စာ)(?:\s*[:：]\s*|\s+)\S/i.test(line.trim()) ? [i] : [],
  );
  if (starts.length !== 1) return {};
  const first = starts[0];
  const value = lines[first]
    .trim()
    .replace(/^(?:address|လိပ်စာ)(?:\s*[:：]\s*|\s+)/i, '');
  if (!value) return {};
  const colonless = !/^(?:address|လိပ်စာ)\s*[:：]/i.test(lines[first].trim());
  if (
    colonless &&
    (!/^(?:No\.?\s*[0-9]+|အမှတ်\s*[0-9၀-၉]+)(?=\s|[,၊]|$)/i.test(value) ||
      !lines.some((line) =>
        /^(?:product|ပစ္စည်း)(?:\s*[:：]\s*|\s+)\S/i.test(line.trim()),
      ) ||
      /\b(?:or|not|maybe)\b|သို့မဟုတ်|မဟုတ်|ဆိုရင်/i.test(message))
  )
    return {};
  const pieces = [value];
  const refs = [first + 1];
  // Only unmistakable geography continuation lines; arbitrary unlabelled text
  // is not silently swallowed as an address.
  for (let i = first + 1; i < lines.length; i++) {
    const next = lines[i].trim();
    if (!next) break;
    if (
      /^(?:customer name|customer|name|phone|ph|product|township|နာမည်|ဖုန်း|ပစ္စည်း|မြို့နယ်)(?:\s*[:：]\s*|\s+)\S/i.test(
        next,
      )
    )
      break;
    if (/[:：]|ပို့|ဆက်|ယူ|မှတ်ချက်|\b(?:note|call|send|product)\b/i.test(next))
      break;
    if (
      !/^(?:[^,၊\n]+(?:မြို့နယ်|မြို့)|[A-Za-z .'-]+(?:Tsp|Township|City)|ရန်ကုန်|မန္တလေး|Yangon|Mandalay)(?:[,၊]\s*(?:ရန်ကုန်(?:မြို့)?|Yangon))?[။.]?$/i.test(
        next,
      )
    )
      return {};
    pieces.push(next);
    refs.push(i + 1);
  }
  const address = pieces.join('\n');
  if (address.length > 1000) return {};
  const town = lines.some((line) =>
    /^(?:township|မြို့နယ်)(?:\s*[:：]\s*|\s+)\S/i.test(line.trim()),
  )
    ? undefined
    : township(address);
  return {
    address: { value: address, lines: refs },
    ...(town
      ? {
          township: {
            value: town,
            lines: refs.filter((_, i) => township(pieces[i]) === town),
          },
        }
      : {}),
  };
}

/** Extend only explicit, single-destination formats. Unknown place names and
 * conversational corrections stay on the model/review path. */
export function aiAddressFacts(message: string): AiAddressFacts {
  const labelled = labelledAddressFacts(message);
  if (Object.keys(labelled).length) return labelled;
  const lines = message.split(/\r?\n/);
  // Do not salvage a partially understood labelled address, or compete with a
  // separate township field. Preserve the existing completeness policy.
  if (
    lines.some((line) =>
      /^(?:address|township|လိပ်စာ|မြို့နယ်)(?:\s|[:：])/i.test(line.trim()),
    )
  )
    return {};
  // An exact fee-only question does not make the destination conditional. No
  // other question, correction, negation or alternative is ignored.
  const destinationText = message.replace(/ပို့ခဘယ်လောက်လဲ[။?？]?/g, '');
  if (
    /\b(?:correct|correction|instead|change|if|unless|or|not|maybe)\b|ပြောင်း|ပြင်|မဟုတ်|ဆိုရင်|သို့မဟုတ်|မပို့|လား|[?？]/i.test(
      destinationText,
    )
  )
    return {};
  const markedLines = lines.flatMap((line, i) =>
    /\b(?:Tsp|Township)\b|မြို့နယ်/i.test(line) ? [i] : [],
  );
  if (markedLines.length !== 1) return {};
  const index = markedLines[0];
  const line = lines[index].trim();
  // A second delivery/address statement may conflict even without a marker.
  if (
    lines.some(
      (other, i) =>
        i !== index &&
        /\b(?:address|destination|deliver|send)\b|လိပ်စာ|ကို\s*ပို့|အမှတ်|^\s*No\.?\s*\d/i.test(
          other,
        ),
    )
  )
    return {};
  const myanmar =
    /^([\u1000-\u109F ]{1,80})မြို့နယ်ကို\s*ပို့ပေးပါ[။.!]?(?:\s*ပို့ခဘယ်လောက်လဲ[။?？]?)?$/.exec(
      line,
    );
  const english =
    /^(?:deliver|send) to ([A-Za-z][A-Za-z .'-]{0,79}) (?:Tsp|Township)[.!]?$/i.exec(
      line,
    );
  let name = myanmar?.[1].trim() ?? english?.[1].trim();
  // A complete unlabelled street line must have a numbered street, explicit
  // township marker and supported city ending. Infer only the township field.
  if (
    !name &&
    /^(?:No\.?\s*[0-9]+|အမှတ်\s*[0-9၀-၉]+)[^:：!?？\n]*[,၊]\s*(?:Yangon|Mandalay|ရန်ကုန်(?:မြို့)?|မန္တလေး(?:မြို့)?)[။.]?$/i.test(
      line,
    ) &&
    (line.match(/[,၊]/g)?.length ?? 0) >= 2
  )
    name = /[,၊]\s*([^,၊\n:：]+?)\s*(?:\bTsp\b|\bTownship\b|မြို့နယ်)\s*[,၊]/i
      .exec(line)?.[1]
      .trim();
  if (
    !name ||
    /[0-9၀-၉]/.test(name) ||
    (line.match(/\b(?:Tsp|Township)\b|မြို့နယ်/gi)?.length ?? 0) !== 1
  )
    return {};
  return { township: { value: name, lines: [index + 1] } };
}
