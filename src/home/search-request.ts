export type SearchFields = {
  q: string;
  need_by: string;
  veg: string;
  category: string;
  sort: string;
};

export type Origin = { lat: number; lng: number };

const fieldNames = ["q", "need_by", "veg", "category", "sort"] as const;

// The address of one search. Empty fields stay out, and the buyer's place
// goes only when she asked to use it. city: the city of the picker.
export function searchPath(
  fields: Readonly<SearchFields>,
  origin: Origin | null,
  city: string | null = null,
): string {
  const query = new URLSearchParams();
  for (const name of fieldNames) {
    const value = fields[name].trim();
    if (value !== "") query.set(name, value);
  }
  if (city !== null && city !== "") query.set("city", city);
  if (origin !== null) {
    query.set("lat", String(origin.lat));
    query.set("lng", String(origin.lng));
  }
  const text = query.toString();
  return text === "" ? "/api/search" : `/api/search?${text}`;
}

export function fieldsOf(
  read: (name: (typeof fieldNames)[number]) => unknown,
): SearchFields {
  const text = (name: (typeof fieldNames)[number]) => {
    const value = read(name);
    return typeof value === "string" ? value : "";
  };
  return {
    q: text("q"),
    need_by: text("need_by"),
    veg: text("veg"),
    category: text("category"),
    sort: text("sort"),
  };
}

const keptNames = ["q", "need_by", "veg", "category"] as const;

// The address of the page keeps the dish and the filters, so Back brings the
// same search again. Its other values, such as lang, stay. The sort is not
// kept: Nearest needs her location again.
export function pageQuery(
  fields: Readonly<SearchFields>,
  search: string,
): string {
  const query = new URLSearchParams(search);
  for (const name of keptNames) {
    const value = fields[name].trim();
    if (value === "") query.delete(name);
    else query.set(name, value);
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

export function keptFields(search: string): [string, string][] {
  const query = new URLSearchParams(search);
  return keptNames.flatMap((name) => {
    const value = query.get(name)?.trim() ?? "";
    return value === "" ? [] : [[name, value] as [string, string]];
  });
}

const filterNames = ["need_by", "veg", "category"] as const;

// The filters that are on, for the count on the Filters button. The sort
// orders the results and filters nothing, so it does not count.
export function filtersOn(fields: Readonly<SearchFields>): number {
  return filterNames.filter((name) => fields[name].trim() !== "").length;
}
