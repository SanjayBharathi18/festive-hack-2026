export const tabNames = ["food", "bulk", "catering"] as const;
export type TabName = (typeof tabNames)[number];

export type Tabs = { show(tab: TabName): void };

// The three ways to buy. Each panel mounts the first time it shows, so a
// buyer who only orders food never loads the other two.
export function createTabs({
  panels,
  onFirstShow,
}: {
  panels: Readonly<Record<TabName, { hidden: boolean | string }>>;
  onFirstShow: (tab: TabName) => void;
}): Tabs {
  const mounted = new Set<TabName>();
  return {
    show(tab) {
      for (const name of tabNames) panels[name].hidden = name !== tab;
      if (mounted.has(tab)) return;
      mounted.add(tab);
      onFirstShow(tab);
    },
  };
}

export function tabFromHash(hash: string): TabName {
  const name = hash.replace(/^#/, "");
  return tabNames.find((tab) => tab === name) ?? "food";
}

// Order food is the homepage itself, so its address has no hash.
export function hashOfTab(tab: TabName): string {
  return tab === "food" ? "" : `#${tab}`;
}
