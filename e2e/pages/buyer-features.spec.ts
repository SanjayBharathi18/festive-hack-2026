import { expect, test, type Page } from "@playwright/test";
import { istDay } from "../../shared/day.ts";
import { demoToken } from "./test-env.ts";

const results = (page: Page) => page.locator("#results-list > li");
const result = (page: Page, store: string) =>
  results(page).filter({ has: page.getByRole("link", { name: store }) });
const openFilters = async (page: Page) => {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.locator("#filters")).toBeVisible();
};

test("the homepage finds a dish in any script, with filters, and opens the store from the marketplace", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await expect(page.getByRole("radio", { name: "Order Here" })).toBeChecked();
  await expect(page.locator("#results-title")).toHaveText("Cooks in the city");
  await expect(result(page, "Shobha's Kitchen")).toBeVisible();
  await expect(page.locator("#special")).toHaveCount(0);

  // Each card shows her stars or New, and Best rated puts the highest
  // average first and the new cooks after the rated ones.
  const stars = await results(page).evaluateAll((cards) =>
    cards
      .filter((card) => card.getAttribute("data-closed") !== "true")
      .map(
        (card) =>
          card.querySelector(".cook-card-rating [aria-hidden]")?.textContent ??
          "",
      ),
  );
  expect(stars.length).toBeGreaterThan(0);
  for (const words of stars) expect(words).toMatch(/^★ \d\.\d$|^New$/);
  const averages = stars.map((words) =>
    words === "New" ? 0 : Number(words.slice(2, 5)),
  );
  expect(averages).toEqual([...averages].sort((a, b) => b - a));

  const search = page.getByRole("searchbox", { name: "Dish or cook" });
  await search.fill("kaju katli");
  await expect(page.locator("#results-title")).toHaveText(
    "Results for “kaju katli”",
  );
  const shobha = result(page, "Shobha's Kitchen");
  await expect(shobha.locator(".cook-card-dish").first()).toContainText(
    "Kaju katli",
  );
  await expect(shobha.locator(".cook-card-pack").first()).toHaveText(
    /^\(.+\)$/,
  );
  await expect(shobha.locator(".cook-card-price").first()).toHaveText(
    /^₹[\d,]+$/,
  );
  await expect(shobha.locator(".cook-card-dish")).toHaveCount(3);
  await expect(result(page, "Ghar Ki Mithai")).toContainText("Kaju katli");
  await expect(result(page, "Amma's Murukku Corner")).toHaveCount(0);

  await search.fill("ಕಾಜು ಕಟ್ಲಿ");
  await expect(page.locator("#results-title")).toHaveText(
    "Results for “ಕಾಜು ಕಟ್ಲಿ”",
  );
  await expect(shobha.locator(".cook-card-dish").first()).toContainText(
    "Kaju katli",
  );

  await search.fill("zzqq");
  await expect(page.locator("#results-none")).toHaveText(
    "No results for “zzqq”. Try another dish or cook name.",
  );
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.locator("#results-title")).not.toHaveText(/Results for/);

  await expect(
    page.getByRole("button", { name: "Search", exact: true }),
  ).toHaveCount(0);
  const clear = page.getByRole("button", { name: "Clear the search" });
  await expect(clear).toBeHidden();
  await search.fill("laddu");
  await search.press("Enter");
  await expect(page.locator("#results-title")).toHaveText(
    "Results for “laddu”",
  );
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(clear).toBeHidden();
  await expect(page.locator("#results-title")).not.toHaveText(/Results for/);

  await search.fill("");
  const count = page.locator("#filters-count");
  await expect(count).toBeHidden();
  await openFilters(page);
  await page.locator("#filters label.chip", { hasText: "Egg" }).click();
  await expect(result(page, "Coastal Kitchen")).toContainText("Rose cookies");
  await expect(result(page, "Shobha's Kitchen")).toHaveCount(0);
  await expect(count).toHaveText("(1)");
  await page.locator("#filters label.chip", { hasText: "All" }).first().click();
  await expect(count).toBeHidden();

  const today = istDay(Date.now());
  await page.getByLabel("Need it by").fill(today);
  await expect(page.locator("#results-note")).toContainText(
    /These cooks have space by|No cook has space by/,
  );
  await expect(count).toHaveText("(1)");
  await page.keyboard.press("Escape");
  await expect(page.locator("#filters")).toBeHidden();

  const more = result(page, "Shobha's Kitchen").locator(".cook-card-more");
  await expect(more).toHaveText(/^\+ \d+ more dish(es)?$/);
  await more.click();
  await expect(page).toHaveURL(/\/s\/shobhas-kitchen\?.*via=market/);
  await expect(page.locator("#store-extras")).toBeAttached();
});

test.describe("with the buyer's location", () => {
  test.use({
    geolocation: { latitude: 12.9116, longitude: 77.6474 },
    permissions: ["geolocation"],
  });

  test("Use my location puts the nearest cook first, in whole kilometres", async ({
    page,
  }) => {
    await page.goto("/?lang=en");
    await openFilters(page);
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.locator("#location-status")).toHaveText(
      "Using your location. Nearest cooks come first.",
    );
    await expect(page.getByRole("radio", { name: "Nearest" })).toBeChecked();
    await expect(page.locator("#results-title")).toHaveText("Cooks near you");
    await expect(results(page).first()).toContainText("Ghar Ki Mithai");
    await expect(results(page).first()).toContainText("1 km");
  });
});

test.describe("with the buyer's location in Mumbai", () => {
  test.use({
    geolocation: { latitude: 19.02, longitude: 72.85 },
    permissions: ["geolocation"],
  });

  test("Use my location picks the nearest city with cooks", async ({
    page,
  }) => {
    await page.goto("/?lang=en");
    const city = page.getByRole("combobox", { name: "City" });
    await expect(city).toHaveValue("bengaluru");
    await openFilters(page);
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(city).toHaveValue("mumbai");
    await expect(page).toHaveURL(/[?&]city=mumbai/);
    await expect(results(page).first()).toContainText("Aai's Dabba");
    await expect(results(page).first()).toContainText("1 km");
    await expect(page.locator("#sort-note")).toBeHidden();
  });
});

test("the city picker keeps the city across a reload and Back, and Nearest works without location", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  const city = page.getByRole("combobox", { name: "City" });
  await expect(city).toHaveValue("bengaluru");
  await expect(city.locator("option")).toHaveText([
    "Bengaluru",
    "Chennai",
    "Delhi",
    "Hyderabad",
    "Kolkata",
    "Mumbai",
    "Pune",
  ]);
  await expect(result(page, "Shobha's Kitchen")).toBeVisible();
  const newCooks = await results(page)
    .locator('.cook-card-rating[data-new="true"]')
    .count();
  if (newCooks > 0) {
    await expect(page.locator("#sort-note")).toHaveText(
      "New cooks, with no rating yet, come after the rated ones.",
    );
  } else {
    await expect(page.locator("#sort-note")).toHaveText("");
  }

  await city.selectOption({ label: "Mumbai" });
  await expect(page).toHaveURL(/[?&]city=mumbai/);
  await expect(result(page, "Aai's Dabba")).toBeVisible();
  await expect(results(page)).toHaveCount(1);

  await page.reload();
  await expect(city).toHaveValue("mumbai");
  await expect(result(page, "Aai's Dabba")).toBeVisible();
  await expect(results(page)).toHaveCount(1);

  await result(page, "Aai's Dabba")
    .getByRole("link", { name: "Aai's Dabba" })
    .click();
  await expect(page).toHaveURL(/\/s\/aais-dabba/);
  await page.goBack();
  await expect(city).toHaveValue("mumbai");
  await expect(result(page, "Aai's Dabba")).toBeVisible();
  await expect(results(page)).toHaveCount(1);

  await openFilters(page);
  await page.locator("label.chip", { hasText: "Nearest" }).click();
  await expect(page.locator("#sort-note")).toHaveText(
    "Distance from the centre of Mumbai. Use my location for your own distance.",
  );
  await expect(results(page).first()).toContainText(/\d+ km/);

  await page.goto("/?lang=en#catering");
  await expect(city).toHaveValue("mumbai");
  await expect(page.locator("#catering .catering-none")).toBeVisible();
  await expect(page.getByRole("link", { name: "Daawat Caterers" })).toHaveCount(
    0,
  );
});

test("the tabs show one way to buy at a time, and the address keeps the tab", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  const widths = await page
    .locator("#tabs > label")
    .evaluateAll((labels) =>
      labels.map((label) => label.getBoundingClientRect().width),
    );
  expect(widths).toHaveLength(3);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  const [switchBox, panelBox] = await Promise.all([
    page.locator("#tabs").boundingBox(),
    page.locator("#food").boundingBox(),
  ]);
  expect(switchBox?.width).toBeCloseTo(panelBox?.width ?? 0, 0);

  const food = page.getByRole("radio", { name: "Order Here", exact: true });
  await expect(food).toHaveAccessibleDescription("From home cooks near you");
  await food.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/#bulk$/);
  await expect(page.locator("#bulk")).toBeVisible();

  await page.locator("#tabs label", { hasText: "Catering" }).click();
  await expect(page).toHaveURL(/#catering$/);
  await expect(page.locator("#catering")).toBeVisible();
  await expect(page.locator("#food")).toBeHidden();
  await page.goto("/?lang=en#bulk");
  await expect(
    page.getByRole("radio", { name: "Corporate Bulk Orders" }),
  ).toBeChecked();
  await expect(page.locator("#bulk")).toBeVisible();
  await expect(page.locator("#food")).toBeHidden();
});

test("a buyer pays online on the prototype screen: Fail keeps the order unpaid, Pay marks it paid", async ({
  page,
}) => {
  await page.goto("/s/shobhas-kitchen?lang=en");
  const item = page
    .locator(".item")
    .filter({ has: page.getByRole("heading", { name: /Mysore pak$/ }) });
  await item.locator("label.pack", { hasText: "500 g" }).click();
  await item.getByRole("button", { name: "Add Mysore pak, 500 g" }).click();
  const cart = page.locator("#cart");
  await cart.locator(".day-chip").filter({ hasText: "Tomorrow" }).click();
  await cart.getByRole("link", { name: "Order" }).click();

  await page.locator("#way-pickup").click();
  await page.getByText("Pay online now").click();
  await page.getByLabel("Your name").fill("Meera Iyer");
  await page.getByLabel("Your WhatsApp number").fill("98765 40123");
  await page.getByRole("button", { name: "Get the code" }).click();
  const code = page.locator("#code-value");
  await expect(code).toHaveText(/^\d{6}$/);
  await page
    .getByLabel("Code", { exact: true })
    .fill((await code.textContent()) ?? "");
  await page.getByRole("button", { name: "Place order and pay" }).click();

  await expect(page).toHaveURL(/\/pay\/[^/?]+/);
  await expect(page.locator("#pay .badge")).toHaveText("Prototype");
  await expect(page.locator("#pay-amount")).toHaveText("₹450");
  await page.getByRole("button", { name: "Fail" }).click();
  await expect(page.locator("#pay-status")).toHaveText(
    "The payment failed. Your order is placed and not paid. Pay later from your order page, or in cash.",
  );

  await page.getByRole("link", { name: "Back to your order" }).click();
  await expect(page).toHaveURL(/\/o\/[^/?]+/);
  await expect(page.locator("#status-stamp")).toHaveText("Placed");
  await expect(page.locator("#paid-stamp")).toBeHidden();
  const payCard = page.locator("#pay-card");
  await expect(payCard.locator(".badge")).toHaveText("Prototype");
  await payCard.getByRole("button", { name: "Pay online" }).click();

  await expect(page).toHaveURL(/\/pay\/[^/?]+/);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(/\/o\/[^/?]+/);
  await expect(page.locator("#paid-stamp")).toBeVisible();
  await expect(payCard).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Message the store" }),
  ).toHaveClass(/btn-primary/);
});

test("the address keeps the dish and the filters, so Back brings the same search", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await page
    .getByRole("searchbox", { name: "Dish or cook" })
    .fill("kaju katli");
  await openFilters(page);
  await page.locator("label.chip", { hasText: "Veg" }).first().click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/[?&]q=kaju\+katli/);
  await expect(page).toHaveURL(/[?&]veg=veg/);
  await expect(page).toHaveURL(/[?&]lang=en/);
  await result(page, "Shobha's Kitchen")
    .getByRole("link", { name: "Shobha's Kitchen" })
    .click();
  await expect(page).toHaveURL(/\/s\/shobhas-kitchen/);
  await page.goBack();
  await expect(
    page.getByRole("searchbox", { name: "Dish or cook" }),
  ).toHaveValue("kaju katli");
  await expect(page.locator("input[name=veg][value=veg]")).toBeChecked();
  await expect(page.locator("#results-title")).toHaveText(
    "Results for “kaju katli”",
  );
});

test("her own link keeps the buyer in her store, in any of six languages, with no desk links for a buyer", async ({
  page,
}) => {
  await page.goto("/s/shobhas-kitchen?lang=en");
  await expect(page).toHaveTitle(/Shobha's Kitchen/);
  await expect(page.locator("#language-picker option")).toHaveText([
    "English",
    "हिन्दी",
    "ಕನ್ನಡ",
    "தமிழ்",
    "తెలుగు",
    "मराठी",
  ]);
  await expect(page.locator("a.brand")).toHaveAttribute(
    "href",
    "/s/shobhas-kitchen?lang=en",
  );
  const deskLinks = page.locator('.app-bar a[href^="/desk"], a[href^="/ops"]');
  await expect(page.locator("#demo-nav")).toHaveCount(0);
  await expect(deskLinks).toHaveCount(0);

  await page.goto("/s/shobhas-kitchen?via=market&lang=en");
  await expect(page.locator("a.brand")).toHaveAttribute("href", "/?lang=en");

  await page.evaluate((token) => {
    sessionStorage.setItem("desk.demo-token", token);
  }, demoToken);
  await page.reload();
  await expect(page.locator("#sound-toggle")).toBeVisible();
  await expect(deskLinks).toHaveCount(0);
});
