export type ReadingPack = {
  id: string;
  label: string;
  grams: number | null;
  pieces: number | null;
  price: number;
};

export type ReadingItem = {
  id: string;
  name: string;
  name_latin: string | null;
  sold_out: boolean;
  packs: readonly ReadingPack[];
};

export type MenuMatch = { item: ReadingItem; near: boolean };

export const maxKeyterms = 50;
export const maxKeytermLength = 64;
export const nearScore = 0.75;
export const menuNameSeparator = " / ";

export function keyterms(menu: readonly ReadingItem[]): string[] {
  const ordered = [
    ...menu.filter((item) => !item.sold_out),
    ...menu.filter((item) => item.sold_out),
  ];
  return unique(
    ordered.flatMap((item) =>
      [item.name, item.name_latin].flatMap((name) =>
        name === null ? [] : nameForms(name),
      ),
    ),
  )
    .filter((term) => term.length <= maxKeytermLength)
    .slice(0, maxKeyterms);
}

export function matchItem(
  menu: readonly ReadingItem[],
  names: readonly (string | null)[],
): MenuMatch | undefined {
  const wanted = names
    .filter((name): name is string => name !== null)
    .flatMap((name) => [name, ...name.split(menuNameSeparator)])
    .map(normalizeName)
    .filter((name) => name !== "");
  const forms = menu.map((item) => ({
    item,
    names: itemNames(item).map(normalizeName),
  }));
  for (const name of wanted) {
    const exact = forms.find(({ names }) => names.includes(name));
    if (exact !== undefined) return { item: exact.item, near: false };
  }
  let best: { item: ReadingItem; score: number } | undefined;
  for (const name of wanted) {
    for (const { item, names } of forms) {
      for (const form of names) {
        const score = similarity(name, form);
        if (score >= nearScore && (best === undefined || score > best.score)) {
          best = { item, score };
        }
      }
    }
  }
  if (best !== undefined) return { item: best.item, near: true };
  const contained = wantedTokens(names)
    .flatMap((tokens) =>
      menu.flatMap((item) =>
        itemNames(item)
          .map(tokensOf)
          .filter(
            (formTokens) =>
              formTokens.length > 0 &&
              formTokens.every((token) =>
                tokens.some((said) => sameToken(said, token)),
              ),
          )
          .map((formTokens) => ({ item, size: formTokens.length })),
      ),
    )
    .sort((a, b) => b.size - a.size)[0];
  return contained === undefined
    ? undefined
    : { item: contained.item, near: true };
}

export function itemNames(
  item: Pick<ReadingItem, "name" | "name_latin">,
): string[] {
  return unique(
    [item.name, item.name_latin].flatMap((name) =>
      name === null ? [] : [name, ...nameForms(name)],
    ),
  );
}

export function nameForms(name: string): string[] {
  const match = /^(.+?)\s*\((.+)\)\s*$/.exec(name.trim());
  const forms = match ? [match[1] ?? "", match[2] ?? ""] : [name];
  return forms.map((form) => form.trim()).filter((form) => form !== "");
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "")
    .replace(/([aeiou])\1+/g, "$1");
}

export function similarity(a: string, b: string): number {
  const longest = Math.max([...a].length, [...b].length);
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

export function editDistance(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

function wantedTokens(names: readonly (string | null)[]): string[][] {
  return names
    .filter((name): name is string => name !== null)
    .map(tokensOf)
    .filter((tokens) => tokens.length > 0);
}

function tokensOf(name: string): string[] {
  return name
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .map(normalizeName)
    .filter((token) => [...token].length >= 3);
}

function sameToken(said: string, token: string): boolean {
  return (
    said === token ||
    said.startsWith(token) ||
    similarity(said, token) >= nearScore
  );
}

function unique(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLocaleLowerCase("en");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
