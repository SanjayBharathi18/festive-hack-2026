export const sections = ["flagsmith", "nudgebee", "sarvam"] as const;
export type Section = (typeof sections)[number];

// The incident is the first view, so the demo opens on it with no click.
export const firstSection: Section = "nudgebee";

export type SectionRadio = {
  value: string;
  checked: boolean;
  addEventListener(type: "change", listener: () => void): void;
};
export type SectionPanel = { hidden: boolean | "until-found" };

// The section radios of the console: one panel shows at a time, and the
// fragment of the address keeps the choice, so a reload stays on it.
export function bindSections({
  radios,
  panel,
  hash,
  keepHash,
  onShow,
}: {
  radios: readonly SectionRadio[];
  panel: (section: Section) => SectionPanel;
  hash: string;
  keepHash: (hash: string) => void;
  onShow: (section: Section) => void;
}): { current: () => Section } {
  let current = sectionFromHash(hash);
  const show = (section: Section) => {
    current = section;
    for (const radio of radios) radio.checked = radio.value === section;
    for (const name of sections) panel(name).hidden = name !== section;
    onShow(section);
  };
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const section = sectionFromHash(radio.value);
      keepHash(`#${section}`);
      show(section);
    });
  }
  show(current);
  return { current: () => current };
}

export function sectionFromHash(hash: string): Section {
  const name = hash.replace(/^#/, "");
  return sections.find((section) => section === name) ?? firstSection;
}
