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

export function aiAddressFacts(message: string): AiAddressFacts {
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
    /^(?:address|လိပ်စာ)\s*[:：]/i.test(line.trim()) ? [i] : [],
  );
  if (starts.length !== 1) return {};
  const first = starts[0];
  const value = lines[first]
    .trim()
    .replace(/^(?:address|လိပ်စာ)\s*[:：]\s*/i, '');
  if (!value) return {};
  const pieces = [value];
  const refs = [first + 1];
  // Only unmistakable geography continuation lines; arbitrary unlabelled text
  // is not silently swallowed as an address.
  for (let i = first + 1; i < lines.length; i++) {
    const next = lines[i].trim();
    if (!next) break;
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
    /^(?:township|မြို့နယ်)\s*[:：]/i.test(line.trim()),
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
