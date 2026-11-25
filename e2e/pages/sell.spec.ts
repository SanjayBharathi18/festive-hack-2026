import { expect, test, type Locator } from "@playwright/test";

// Seller setup on a laptop, on the real server: a new seller makes a store
// with two items, checks the preview, publishes with the code that this
// prototype shows, and shares it. Each run makes its own store and number,
// because the specs share one database.
const chip = (root: Locator, words: string | RegExp) =>
  root.locator("label.chip", { hasText: words });

test("a seller makes a store with two items, previews it, publishes it and shares it", async ({
  page,
}) => {
  const run = Date.now().toString(36);
  const name = `Rasoi ${run}`;
  const slug = `rasoi-${run}`;
  const phone = `9${String(Date.now()).slice(-9)}`;

  await page.goto("/sell?lang=en");
  await page.evaluate(() => localStorage.removeItem("sell.draft"));
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: "Your language" }),
  ).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("");
  await chip(page.locator("#language-form"), "English").click();
  await page
    .locator("#language-form")
    .getByRole("button", { name: "Continue" })
    .click();

  const items = page.locator("#step-items");
  await expect(
    items.getByRole("heading", { name: "What you sell" }),
  ).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText(
    "Draft saved in this browser",
  );
  const dialog = page.getByRole("dialog");
  await items.getByRole("button", { name: "Add an item" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("ಚಕ್ಕುಲಿ");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await items.getByRole("button", { name: "Add an item" }).click();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("ಚಕ್ಕುಲಿ");
  await expect(dialog.locator("#item-draft")).toHaveText(
    /We kept what you typed\./,
  );
  await dialog.getByLabel("Name in English letters").fill("Chakkuli");
  await chip(dialog, "Savouries").click();
  await chip(dialog, /^Veg$/).click();
  await dialog.getByLabel("Price in rupees").fill("400");
  await expect(dialog.getByLabel("Pack 1: price in rupees")).toHaveValue("100");
  await expect(dialog.getByLabel("Pack 3: price in rupees")).toHaveValue("400");
  await dialog.getByRole("button", { name: "Save item" }).click();
  await expect(dialog).toBeHidden();

  await items.getByRole("button", { name: "Add an item" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Besan laddu");
  await chip(dialog, "Sweets").click();
  await chip(dialog, /^Veg$/).click();
  await dialog.getByLabel("Price in rupees").fill("25");
  await dialog.locator("label", { hasText: "a piece" }).click();
  await expect(dialog.getByLabel("Pack 2: price in rupees")).toHaveValue("150");
  await dialog.getByRole("button", { name: "Remove pack 3" }).click();
  await dialog.getByRole("button", { name: "Save item" }).click();
  await expect(items.locator(".item-row")).toHaveCount(2);
  await expect(items.locator(".item-row").nth(1)).toContainText(
    "6 pieces ₹150",
  );

  await items.getByRole("button", { name: "Remove Besan laddu" }).click();
  await expect(items.locator(".item-row")).toHaveCount(1);
  await items.getByRole("button", { name: "Undo" }).click();
  await expect(items.locator(".item-row")).toHaveCount(2);
  await items.getByRole("button", { name: "Continue" }).click();

  const store = page.locator("#step-store");
  await store.getByRole("textbox", { name: "Store name" }).fill(name);
  await expect(store.getByRole("textbox", { name: "Store link" })).toHaveValue(
    slug,
  );
  await expect(store.locator("#slug-status")).toHaveText(/This link is free/);
  await store.getByRole("button", { name: "Continue" }).click();

  const ways = page.locator("#step-ways");
  await ways.locator("#offers-pickup").check();
  await ways.getByRole("textbox", { name: "Area" }).fill("Jayanagar");
  await ways.getByRole("textbox", { name: "City" }).fill("Bengaluru");
  await ways.getByRole("button", { name: "See the preview" }).click();

  const preview = page.locator("#step-preview");
  await expect(preview.locator("#pv-title")).toHaveText(name);
  await expect(preview.locator(".menu-section")).toHaveCount(2);
  await expect(preview.locator(".item", { hasText: "Chakkuli" })).toContainText(
    "₹100",
  );
  await expect(preview.locator(".step-more").first()).toBeDisabled();
  await preview.getByRole("button", { name: "Continue to publish" }).click();

  const publish = page.locator("#step-publish");
  await publish
    .getByRole("textbox", { name: "Your WhatsApp number" })
    .fill(phone);
  await publish
    .getByLabel("Send me order and request updates on WhatsApp.")
    .check();
  await publish
    .getByLabel("I am responsible for my food and its safety.")
    .check();
  await publish.getByRole("button", { name: "Get the code" }).click();
  await expect(publish.locator(".code-shown .badge")).toHaveText("Prototype");
  const code = (await publish.locator("#code-shown").textContent()) ?? "";
  expect(code).toMatch(/^\d{6}$/);
  await expect(publish.getByRole("textbox", { name: "Code" })).toHaveValue(
    code,
  );
  await publish.getByRole("button", { name: "Publish" }).click();

  const share = page.locator("#step-share");
  await expect(share.getByText("Your store is published.")).toBeVisible();
  await expect(page.locator("#sell-lead")).toHaveText(
    "Your store is published. Change it on your desk.",
  );
  await expect(share.locator("#share-url")).toHaveText(
    new RegExp(`/s/${slug}$`),
  );
  await expect(
    share.getByRole("link", { name: "Share on WhatsApp" }),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  const qr = share.getByRole("img", { name: /QR code of/ });
  await expect(qr).toHaveAttribute("src", `/api/stores/${slug}/qr.svg`);
  await expect
    .poll(() => qr.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const svg = await page.request.get(`/api/stores/${slug}/qr.svg`);
  expect(svg.headers()["content-type"]).toMatch(/^image\/svg\+xml/);

  await share.getByRole("link", { name: "Open your store" }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${slug}$`));
  await expect(page.locator("#store-title")).toHaveText(name);
  await expect(page.locator(".item")).toHaveCount(2);
  await expect(page.locator(".item", { hasText: "Besan laddu" })).toContainText(
    "6 pieces",
  );
});

test("a store name in Hindi still gets a link that she can change", async ({
  page,
}) => {
  await page.goto("/sell?lang=en");
  await chip(page.locator("#language-form"), "English").click();
  await page
    .locator("#language-form")
    .getByRole("button", { name: "Continue" })
    .click();
  const items = page.locator("#step-items");
  const dialog = page.getByRole("dialog");
  await items.getByRole("button", { name: "Add an item" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("बेसन लड्डू");
  await dialog.getByLabel("Name in English letters").fill("Besan laddu");
  await chip(dialog, "Sweets").click();
  await chip(dialog, /^Veg$/).click();
  await dialog.getByLabel("Price in rupees").fill("400");
  await dialog.getByRole("button", { name: "Save item" }).click();
  await items.getByRole("button", { name: "Continue" }).click();

  const store = page.locator("#step-store");
  const link = store.getByRole("textbox", { name: "Store link" });
  await store.getByRole("textbox", { name: "Store name" }).fill("दूसरी दुकान");
  await expect(link).toHaveValue(/^[a-z0-9]{3,}(?:-[a-z0-9]+)*$/);
  await expect(store.locator("#slug-status")).toHaveText(/This link is free/);
  await link.fill("doosri-dukaan");
  await store.getByRole("textbox", { name: "Store name" }).fill("दूसरी दुकान दो");
  await expect(link, "her own link stays").toHaveValue("doosri-dukaan");
});

test("a seller types setup lines, checks the dashed values and adds each item", async ({
  page,
}) => {
  await page.goto("/sell?lang=en");
  await page.evaluate(() => localStorage.removeItem("sell.draft"));
  await page.reload();
  await chip(page.locator("#language-form"), "English").click();
  await page
    .locator("#language-form")
    .getByRole("button", { name: "Continue" })
    .click();

  const items = page.locator("#step-items");
  const say = items.locator("#say-item");
  await expect(say).toBeVisible();
  await expect(say.locator("#say-recorded")).toHaveText("Recorded");
  await expect(
    say.getByRole("button", { name: "Record an item" }),
  ).toBeVisible();
  const check = say.locator("#say-check");
  const row = (field: string) => check.locator(`[data-field="${field}"]`);
  const line = "Kaju katli, twelve hundred rupees a kilo, veg, contains nuts.";
  await say.getByLabel("Type the item").fill(line);
  await say.getByRole("button", { name: "Fill in the item" }).click();
  await expect(check).toBeVisible();
  await expect(say.locator("#say-heard mark")).toHaveText(line);
  await expect(row("name").locator(".draft")).toHaveText("Kaju katli");
  await expect(row("category").locator(".draft")).toHaveText("Sweets");
  await expect(row("mark").locator(".draft")).toContainText("Veg");
  await expect(row("price").locator(".draft")).toHaveText("₹1,200 a kg");
  await expect(row("packs").locator(".draft")).toHaveText(
    "250 g ₹300 · 500 g ₹600 · 1 kg ₹1,200",
  );
  await expect(row("allergens").locator(".draft")).toHaveText("nuts");
  await expect(check.locator(".draft")).toHaveCount(6);
  await expect(
    row("name").getByRole("button", { name: "Change Name" }),
  ).toBeVisible();
  await check.getByRole("button", { name: "Add this item" }).click();
  await expect(items.locator(".item-row")).toHaveCount(1);
  await expect(items.locator(".item-row")).toContainText("1 kg ₹1,200");
  await expect(items.locator(".item-row")).toContainText("Contains nuts");
  await expect(say.locator("#say-note")).toHaveText(
    "Kaju katli is added. Say or type the next item.",
  );
  await expect(check).toBeHidden();

  await say.getByLabel("Type the item").fill("ಚಕ್ಕುಲಿ, ಕೆಜಿಗೆ ನಾನೂರು ರೂಪಾಯಿ.");
  await say.getByRole("button", { name: "Fill in the item" }).click();
  await expect(row("latin").locator(".draft")).toHaveText("Chakkuli");
  await row("price").getByRole("button", { name: "Change Price" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("spinbutton", { name: "Price in rupees", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("ಚಕ್ಕುಲಿ");
  await dialog
    .getByRole("spinbutton", { name: "Price in rupees", exact: true })
    .fill("420");
  await expect(dialog.getByLabel("Pack 1: price in rupees")).toHaveValue("105");
  await dialog.getByRole("button", { name: "Save item" }).click();
  await expect(items.locator(".item-row")).toHaveCount(2);
  await expect(items.locator(".item-row").nth(1)).toContainText("Chakkuli");
  await expect(check).toBeHidden();
});
