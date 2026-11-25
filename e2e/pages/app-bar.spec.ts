import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { demoToken } from "./test-env.ts";

// The shared app bar, the tap targets and the number font, at both laptop
// widths and in the six languages.
const languages = ["en", "hi", "kn", "ta", "te", "mr"] as const;
const offline = Object.fromEntries(
  languages.map((language) => {
    const table = JSON.parse(
      readFileSync(
        new URL(`../../src/text/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as { desk: { live: { offline: string } } };
    return [language, table.desk.live.offline];
  }),
);

const boxes = (page: Page, selectors: readonly string[]) =>
  page.evaluate(
    (selectors) =>
      selectors.flatMap((selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((element) => element.offsetParent !== null)
          .map((element) => {
            const { left, top, right, bottom } =
              element.getBoundingClientRect();
            return { name: selector, left, top, right, bottom };
          }),
      ),
    selectors,
  );

const overlaps = async (page: Page) => {
  const found = await boxes(page, [
    ".app-bar .brand",
    ".app-bar-end > :not([hidden])",
    ".app-nav",
  ]);
  return found.flatMap((a, index) =>
    found
      .slice(index + 1)
      .filter(
        (b) =>
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom,
      )
      .map((b) => `${a.name} × ${b.name}`),
  );
};

for (const width of [1280, 1440]) {
  test(`at ${width} px, the status, the store link and the controls never overlap, in any language`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 800 });
    for (const language of languages) {
      await page.goto(`/desk?demo=${demoToken}&lang=${language}`);
      await expect(page.locator("#live-status")).not.toBeEmpty();
      await expect(page.locator("#store-link")).toBeVisible();
      await page.locator("#live-status").evaluate((status, words) => {
        status.textContent = words;
      }, offline[language] ?? "");
      expect(await overlaps(page), language).toEqual([]);
      const status = await page.locator("#live-status").boundingBox();
      const bar = await page.locator(".app-bar").boundingBox();
      expect(status !== null && bar !== null, language).toBe(true);
      expect(
        (status?.y ?? 0) + (status?.height ?? 0),
        language,
      ).toBeLessThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0));

      for (const path of [
        `/?lang=${language}`,
        `/s/shobhas-kitchen?lang=${language}`,
        `/desk/packages?demo=${demoToken}&lang=${language}`,
      ]) {
        await page.goto(path);
        await expect(page.locator(".bar-controls")).toBeVisible();
        expect(await overlaps(page), `${path}`).toEqual([]);
      }
    }
  });
}

test("no page shows the demo nav, and no seller or buyer page links to the developer console", async ({
  page,
}) => {
  for (const path of [
    "/?lang=en",
    "/s/shobhas-kitchen?lang=en",
    "/s/shobhas-kitchen/checkout?lang=en",
    "/c/daawat-caterers/x?lang=en",
    "/board-posts/new?lang=en",
    "/privacy?lang=en",
    "/sell?lang=en",
    `/desk?demo=${demoToken}&lang=en`,
    `/desk/packages?demo=${demoToken}&lang=en`,
  ]) {
    await page.goto(path);
    await expect(page.locator(".bar-controls")).toBeVisible();
    await expect(page.locator("#demo-nav")).toHaveCount(0);
    await expect(page.locator('a[href^="/ops"]')).toHaveCount(0);
  }
  await page.goto(`/desk?demo=${demoToken}&lang=en`);
  await expect(
    page.getByRole("link", { name: "View your store" }),
  ).toHaveAttribute("href", "/s/shobhas-kitchen");
  await expect(
    page.getByRole("link", { name: "Buyer storefront" }),
  ).toHaveCount(0);
});

test("tabs, chips and the controls of the app bar are 44 px tall or more, as one aligned block", async ({
  page,
}) => {
  for (const path of [
    `/desk?demo=${demoToken}&lang=en`,
    "/?lang=en",
    "/s/shobhas-kitchen?lang=en",
  ]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator(".chip").first()).toBeVisible();
    const heights = await page
      .locator(
        ".tabs > :is(a, button, label), .chip, .bar-controls :is(select, button)",
      )
      .evaluateAll((controls) =>
        controls
          .filter((control) => (control as HTMLElement).offsetParent !== null)
          .map((control) => [
            control.id || control.textContent?.trim() || "",
            control.getBoundingClientRect().height,
          ]),
      );
    expect(heights.length, path).toBeGreaterThan(0);
    for (const [name, height] of heights) {
      expect(height, `${path} ${String(name)}`).toBeGreaterThanOrEqual(44);
    }
  }

  for (const path of ["/?lang=en", "/s/shobhas-kitchen?lang=en"]) {
    await page.goto(path);
    await expect(page.locator(".bar-controls .city")).toBeVisible();
    const [city, sound, language] = await Promise.all(
      [".bar-controls .city", "#sound-toggle", "#language-picker"].map(
        async (selector) => await page.locator(selector).boundingBox(),
      ),
    );
    expect(city?.width, path).toBeCloseTo(sound?.width ?? 0, 0);
    expect(city?.y, path).toBeCloseTo(sound?.y ?? 0, 0);
    expect(language?.x, path).toBeCloseTo(city?.x ?? 0, 0);
    expect((language?.x ?? 0) + (language?.width ?? 0), path).toBeCloseTo(
      (sound?.x ?? 0) + (sound?.width ?? 0),
      0,
    );
    expect(language?.y ?? 0, path).toBeGreaterThan(
      (sound?.y ?? 0) + (sound?.height ?? 0),
    );
  }

  await page.goto("/?lang=en");
  await page.getByRole("searchbox", { name: "Dish or cook" }).fill("laddu");
  const clear = await page
    .getByRole("button", { name: "Clear the search" })
    .boundingBox();
  expect(clear?.width).toBeGreaterThanOrEqual(44);
  expect(clear?.height).toBeGreaterThanOrEqual(44);
});

test("each page is in English until the person picks a language, and the pick stays for her next visits", async ({
  page,
  context,
}) => {
  await page.goto("/desk?demo=" + demoToken);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language-picker option")).toHaveText([
    "English",
    "हिन्दी",
    "ಕನ್ನಡ",
    "தமிழ்",
    "తెలుగు",
    "मराठी",
  ]);
  await page.getByRole("combobox", { name: "Language" }).selectOption("hi");
  await expect(page).toHaveURL(/[?&]lang=hi/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator("#language-picker")).toHaveValue("hi");
  await expect(page.locator("#city-picker option:checked")).toHaveText(
    "बेंगलुरु · Bengaluru",
  );

  const next = await context.newPage();
  await next.goto("/sell");
  await expect(next.locator("html")).toHaveAttribute("lang", "hi");
  await expect(next.locator("#language-picker")).toHaveValue("hi");
  await next.close();
});

test("on a store's pages the city is the store's own, locked, and says why", async ({
  page,
}) => {
  await page.goto("/s/shobhas-kitchen?lang=en");
  const city = page.getByRole("button", { name: "City Bengaluru" });
  await expect(city).toBeVisible();
  await expect(city).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#city-picker")).toHaveCount(0);
  const note = page.locator("#city-lock-note");
  await expect(note).toBeHidden();
  await city.hover();
  await expect(note).toBeVisible();
  await expect(note).toHaveText(
    "This store is in Bengaluru. Go back to the homepage to change the city.",
  );
  await expect(note.locator('use[href="/icons.svg#block"]')).toHaveCount(1);
  await city.click({ force: true });
  await expect(page).toHaveURL(/\/s\/shobhas-kitchen\?lang=en$/);
  await page.mouse.move(0, 400);
  await expect(note).toBeHidden();
  await city.blur();
  await city.focus();
  await expect(note).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(note).toBeHidden();

  await page.goto("/s/shobhas-kitchen?lang=kn");
  await expect(page.locator("#city-lock-name")).toHaveText(
    "ಬೆಂಗಳೂರು · Bengaluru",
  );
});

for (const [width, margin] of [
  [1280, 32],
  [1440, 40],
] as const) {
  test(`at ${width} px, the page and the app bar share ${margin} px side margins`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of [
      "/?lang=en",
      "/s/shobhas-kitchen?lang=en",
      `/desk?demo=${demoToken}&lang=en`,
      "/sell?lang=en",
      "/privacy?lang=en",
    ]) {
      await page.goto(path);
      await expect(page.locator("#sound-toggle")).toBeVisible();
      const edges = await page.evaluate(() => {
        const main = document.querySelector("main");
        const brand = document.querySelector(".app-bar .brand");
        const sound = document.querySelector("#sound-toggle");
        if (main === null || brand === null || sound === null) return null;
        const page = document.documentElement.clientWidth;
        const box = main.getBoundingClientRect();
        const style = getComputedStyle(main);
        return [
          brand.getBoundingClientRect().left,
          page - sound.getBoundingClientRect().right,
          box.left + parseFloat(style.paddingLeft),
          page - box.right + parseFloat(style.paddingRight),
        ].map(Math.round);
      });
      expect(edges, path).toEqual([margin, margin, margin, margin]);
    }
  });
}

test("an icon on an ink ground has paper lines and no fill", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await expect(page.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const icons = await page.evaluate(() =>
    [
      ".brand-tile .icon",
      "#tabs > label:has(:checked) .icon",
      "#tabs > label:not(:has(:checked)) .icon",
    ].map((selector) => {
      const icon = document.querySelector(selector);
      if (icon === null) return [selector, "missing"];
      const style = getComputedStyle(icon);
      return [style.getPropertyValue("--icon-fill").trim(), style.color];
    }),
  );
  const paper = "rgb(250, 246, 238)";
  expect(icons[0]).toEqual(["none", paper]);
  expect(icons[1]).toEqual(["none", paper]);
  expect(icons[2]?.[0]).not.toBe("none");
});

test("the words inside a number keep the Anek font of their script, with no letter-spacing", async ({
  page,
}) => {
  await page.goto("/s/daawat-caterers?lang=hi");
  const price = page.locator(".extras-package-price").first();
  await expect(price).toContainText("प्रति");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(
    await price.evaluate((element) => getComputedStyle(element).letterSpacing),
  ).toBe("normal");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".extras-package-price",
  });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  const families = fonts.map(({ familyName }) => familyName);
  expect(families.some((family) => family.startsWith("Anek Devanagari"))).toBe(
    true,
  );
  expect(
    families.every((family) => /^(IBM Plex Mono|Anek )/.test(family)),
    families.join(", "),
  ).toBe(true);
});
