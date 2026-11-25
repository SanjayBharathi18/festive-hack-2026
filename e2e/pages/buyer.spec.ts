import { expect, test } from "@playwright/test";
import { demoToken } from "./test-env.ts";

test("a buyer orders a pack on the storefront and sees her order", async ({
  page,
}) => {
  await page.goto("/s/shobhas-kitchen?lang=en");

  const item = page
    .locator(".item")
    .filter({ has: page.getByRole("heading", { name: /Mysore pak$/ }) });
  await item.locator("label.pack", { hasText: "500 g" }).click();
  await expect(item.locator(".item-price")).toHaveText("₹450");
  await item.getByRole("button", { name: "Add Mysore pak, 500 g" }).click();
  await expect(item.locator(".step-count")).toHaveText("1");

  const cart = page.locator("#cart");
  await expect(cart.locator("#cart-lines")).toContainText("Mysore pak");
  await expect(cart.locator("#cart-lines")).toContainText("1 × 500 g");
  await expect(cart.locator("#cart-total")).toHaveText("₹450");

  const tomorrow = cart.locator(".day-chip").filter({ hasText: "Tomorrow" });
  const day = await tomorrow.locator("input").getAttribute("value");
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await tomorrow.click();
  await expect(tomorrow.locator("input")).toBeChecked();
  const order = cart.getByRole("link", { name: "Order" });
  await expect(order).toHaveAttribute("href", new RegExp(`day=${day}`));

  await order.click();
  await expect(page).toHaveURL(/\/s\/shobhas-kitchen\/checkout/);
  await expect(page.locator("#summary-lines")).toContainText("Mysore pak");
  await expect(page.locator("#summary-total")).toHaveText("₹450");

  await page.locator("#way-pickup").click();
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Your WhatsApp number").fill("98765 43210");
  await page.getByRole("button", { name: "Get the code" }).click();

  const code = page.locator("#code-value");
  await expect(code).toHaveText(/^\d{6}$/);
  await expect(page.locator("#code-step .badge")).toHaveText("Prototype");
  await page
    .getByLabel("Code", { exact: true })
    .fill((await code.textContent()) ?? "");
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/o\/[^/]+$/);
  await expect(page.locator("#order-number")).toHaveText(/^\d+$/);
  await expect(page.locator("#status-stamp")).toHaveText("Placed");
  await expect(page.locator("#order-lines")).toContainText("1 × 500 g");
  await expect(page.locator("#order-total")).toHaveText("₹450");
  await expect(page.locator("#order-who")).toContainText("Asha Rao");
  await expect(page.locator("#fact-pickup")).toBeVisible();
  await expect(page.locator(".messages .badge")).toHaveText("Prototype");
  await expect(
    page.getByRole("link", { name: "Message the store" }),
  ).toBeVisible();
});

test("the store page shows its name beside Taking orders, its stars, its FSSAI number as given by the seller, and English names", async ({
  page,
}) => {
  await page.goto("/s/shobhas-kitchen?lang=en");
  const head = page.locator(".store-head");
  await expect(head.getByRole("heading", { level: 1 })).toHaveText(
    "Shobha's Kitchen",
  );
  await expect(head.locator("#store-open")).toHaveText("Taking orders");
  await expect(head).not.toContainText("/s/shobhas-kitchen");
  await expect(head.locator("#fact-stars")).toHaveText(/^★ \d\.\d \(\d+\)$/);
  await expect(head.locator("#fact-fssai")).toHaveText(
    "FSSAI 00000000000000 (given by seller)",
  );
  await expect(head).not.toContainText(/verified/i);
  await expect(head.locator("#fact-next-day")).toContainText(
    "Next day with space",
  );
  await expect(page.locator("#menu")).not.toContainText(/\p{Script=Kannada}/u);

  await page.goto("/s/test-kitchen?lang=en");
  await expect(head.locator("#fact-fssai")).toBeHidden();

  await page.goto("/s/shobhas-kitchen?lang=kn");
  const pak = page
    .locator(".item")
    .filter({ has: page.getByRole("heading", { name: /Mysore pak$/ }) });
  await expect(pak.locator(".item-native")).toHaveText("ಮೈಸೂರು ಪಾಕ್");
  await expect(pak.locator(".item-latin")).toHaveText(", Mysore pak");
});

test("a Hindi buyer reads the dish names in Devanagari, from the cart to her message, and sees a new status with no reload", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/s/shobhas-kitchen?lang=hi");
  const item = page
    .locator(".item")
    .filter({ has: page.getByRole("heading", { name: /Mysore pak$/ }) });
  await expect(item.locator(".item-native")).toHaveText("मैसूर पाक");
  await expect(item.locator(".item-latin")).toHaveText(", Mysore pak");
  await item.locator(".step-more").click();
  const line = page.locator("#cart-lines tr").first();
  await expect(line.locator(".line-item")).toHaveText("मैसूर पाक");
  await expect(line.locator(".line-latin")).toHaveText(", Mysore pak");
  await expect(page.locator("#cart-lines")).not.toContainText("ಮೈಸೂರು");
  await page.locator("#order-link").click();

  await expect(page).toHaveURL(/\/checkout\?lang=hi/);
  await expect(page.locator("#summary-lines")).toContainText("मैसूर पाक");
  await expect(page.locator("#summary-lines")).not.toContainText("ಮೈಸೂರು");
  await expect(page.locator("#consent-words")).toContainText("Plattr");
  await page.locator("#way-pickup").click();
  await page.locator("#buyer-name").fill("Asha");
  await page.locator("#phone").fill("98765 41007");
  await page.locator("#submit").click();
  const code = page.locator("#code-value");
  await expect(code).toHaveText(/^\d{6}$/);
  await page.locator("#code").fill((await code.textContent()) ?? "");
  await page.locator("#submit").click();

  await expect(page).toHaveURL(/\/o\/[^/?]+\?lang=hi/);
  await expect(page.locator("#order-lines")).toContainText("मैसूर पाक");
  await expect(page.locator("#messages")).toContainText("1 × मैसूर पाक");
  await expect(page.locator("#messages")).not.toContainText("ಮೈಸೂರು");

  const token = new URL(page.url()).pathname.split("/")[2];
  const board = (await (
    await page.request.get("/api/desk/orders", {
      headers: { "X-Demo-Token": demoToken },
    })
  ).json()) as { days: { slips: { id: string; token: string }[] }[] };
  const slip = board.days
    .flatMap((day) => day.slips)
    .find((one) => one.token === token);
  expect(slip).toBeDefined();
  const stamp = page.locator("#status-stamp");
  const placed = (await stamp.textContent()) ?? "";
  const stamped = await page.request.patch(`/api/desk/orders/${slip?.id}`, {
    headers: { "X-Demo-Token": demoToken },
    data: { action: "stamp", status: "making" },
  });
  expect(stamped.ok()).toBe(true);
  await page.clock.fastForward(16_000);
  await expect(stamp).not.toHaveText(placed);
});

test("a trip to the privacy page, or back to change a full day, keeps what the buyer typed and her checked number", async ({
  page,
}) => {
  await page.goto("/s/shobhas-kitchen?lang=en");
  const item = page
    .locator(".item")
    .filter({ has: page.getByRole("heading", { name: /Mysore pak$/ }) });
  await item.locator("label.pack", { hasText: "1 kg" }).click();
  await item.getByRole("button", { name: "Add Mysore pak, 1 kg" }).click();
  const store = (await (
    await page.request.get("/api/stores/shobhas-kitchen")
  ).json()) as {
    store: { id: string };
    sections: {
      items: {
        name_latin: string | null;
        packs: { id: string; label: string }[];
      }[];
    }[];
  };
  const kilo = store.sections
    .flatMap((section) => section.items)
    .find((one) => one.name_latin === "Mysore pak")
    ?.packs.find((pack) => pack.label === "1 kg");
  const cart = [{ pack_id: kilo?.id ?? "", quantity: 1 }];
  const days = (await (
    await page.request.post("/api/days", {
      data: { store_id: store.store.id, cart },
    })
  ).json()) as { days: { day: string; fits: boolean }[] };
  const free = days.days.filter((day) => day.fits);
  const far = free.at(-1)?.day ?? "";
  const other = free.at(-2)?.day ?? "";
  await page.goto(`/s/shobhas-kitchen/checkout?lang=en&day=${far}`);

  await page.locator("#way-delivery").click();
  await page.getByLabel("Delivery address").fill("5 MG Road, Bengaluru");
  await page.getByLabel("Note for the cook").fill("less sugar");
  await page.getByLabel("Your name").fill("Kavya");
  await page.getByLabel("Your WhatsApp number").fill("98765 41008");
  await page.getByRole("button", { name: "Get the code" }).click();
  const code = page.locator("#code-value");
  await expect(code).toHaveText(/^\d{6}$/);
  const sent = (await code.textContent()) ?? "";

  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy/);
  await expect(page.locator("main")).not.toContainText("[");
  await expect(page.locator("#privacy-complain")).toContainText(
    "Write to the store on WhatsApp",
  );
  await page.goBack();
  const kept = async () => {
    await expect(page.getByRole("radio", { name: /Delivery/ })).toBeChecked();
    await expect(page.getByLabel("Delivery address")).toHaveValue(
      "5 MG Road, Bengaluru",
    );
    await expect(page.getByLabel("Note for the cook")).toHaveValue(
      "less sugar",
    );
    await expect(page.getByLabel("Your name")).toHaveValue("Kavya");
    await expect(page.getByLabel("Your WhatsApp number")).toHaveValue(
      "98765 41008",
    );
  };
  await kept();
  await expect(code).toHaveText(sent);

  const fill = await page.request.post("/api/desk/orders", {
    headers: {
      "X-Demo-Token": demoToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      day: far,
      fulfilment: "pickup",
      buyer_name: "Fills the day",
      cart: [{ pack_id: kilo?.id, quantity: 60 }],
    },
  });
  expect(fill.status()).toBe(201);
  const filled = ((await fill.json()) as { order: { id: string } }).order.id;
  try {
    await page.getByLabel("Code", { exact: true }).fill(sent);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.locator("#day-problem")).toBeVisible();
    await expect(page.locator("#verified")).toHaveText(
      "Your number is confirmed.",
    );

    await page.goto(`/s/shobhas-kitchen/checkout?lang=en&day=${other}`);
    await kept();
    await expect(page.locator("#verified")).toBeVisible();
    await expect(page.locator("#code-step")).toBeHidden();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/\/o\/[^/]+$/);
    await expect(page.locator("#fact-delivery")).toContainText("5 MG Road");
  } finally {
    await page.request.patch(`/api/desk/orders/${filled}`, {
      headers: { "X-Demo-Token": demoToken },
      data: { action: "cancel", reason: "other" },
    });
  }
});
