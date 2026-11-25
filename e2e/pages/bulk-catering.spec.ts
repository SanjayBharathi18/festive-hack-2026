import { expect, test } from "@playwright/test";

// A day in IST, some days from now: far enough to miss the booked Sunday of
// the demo caterer.
function dayFromNow(days: number): string {
  const ist = Date.now() + days * 86_400_000 + 330 * 60_000;
  return new Date(ist).toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "198.51.100.94" });
});

test("a host builds a plan, changes the package for a third sweet and contacts the caterer", async ({
  page,
}) => {
  await page.goto("/s/daawat-caterers?lang=en");
  const catering = page.locator(".extras-catering");
  await expect(catering).toContainText("Booked:");
  await expect(page.locator("#store-closed")).toHaveText("Catering only");
  await expect(catering).toContainText("Breads 1 ·");
  await expect(catering).toContainText(
    "Service: delivery, serving staff or live counters",
  );
  await catering
    .getByRole("link", { name: "Plan your menu: Silver plate" })
    .click();
  await expect(page).toHaveURL(/\/c\/daawat-caterers\/[0-9a-f-]{36}/);
  await expect(page.getByRole("radio", { name: /Silver plate/ })).toBeChecked();
  await expect(
    page.getByRole("navigation"),
    "the plan page has no leftover nav",
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Food type" }),
    "the dishes show their marks, so the host chooses no food type",
  ).toHaveCount(0);

  const sweets = page.locator(".plan-category").filter({ hasText: "Sweets" });
  for (const dish of ["Gulab jamun", "Mysore pak"]) {
    await sweets.getByRole("button", { name: dish }).click();
    await expect(sweets.getByRole("button", { name: dish })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await sweets.getByRole("button", { name: "Kesari bath" }).click();
  await expect(page.locator("#refused-words")).toHaveText(
    "This plate allows 2 sweets.",
  );
  await expect(
    sweets.getByRole("button", { name: "Kesari bath" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", {
      name: "Gold plate: 3 sweets, 13 dishes, ₹500 a plate",
    })
    .click();
  await expect(page.getByRole("radio", { name: /Gold plate/ })).toBeChecked();
  await expect(page.locator("#refused")).toBeHidden();
  await expect(
    sweets.getByRole("button", { name: "Kesari bath" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sweets.locator(".category-count")).toHaveText("3 / 3");
  await expect(
    sweets.getByRole("button", { name: "Kesari bath" }),
    "the focus stays on the dish, not on the page",
  ).toBeFocused();

  for (const [category, dish] of [
    ["Mains", "Bisi bele bath"],
    ["Mains", "Veg kurma"],
    ["Breads", "Poori"],
    ["Rice", "Curd rice"],
  ] as const) {
    const box = page.locator(".plan-category").filter({ hasText: category });
    await box.getByRole("button", { name: dish }).click();
    await expect(box.getByRole("button", { name: dish })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.getByLabel("Guests", { exact: true }).fill("120");
  await page.getByLabel("Event date").fill(dayFromNow(14));
  await page.getByLabel("Area or venue").fill("Jayanagar 4th Block");
  await expect(page.locator("#estimate")).toHaveText(
    "120 plates × ₹500 = ₹60,000",
  );
  await expect(page.locator("#styles")).toContainText(
    "With live counters +₹75 a plate",
  );
  await page
    .locator("#styles")
    .getByText("With serving staff +₹40 a plate")
    .click();
  await expect(page.locator("#estimate")).toHaveText(
    "120 plates × (₹500 + ₹40) = ₹64,800",
  );
  await expect(page.locator("#plan-status")).toHaveText(
    "Ready: the caterer gets your plan and your number.",
  );

  await page.getByRole("button", { name: "Contact seller" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Daawat Caterers");
  await expect(dialog.locator(".contact-lines")).toContainText(
    "Sweets: Gulab jamun, Mysore pak, Kesari bath",
  );
  await expect(dialog.locator(".contact-lines")).toContainText(
    "With serving staff +₹40 a plate",
  );
  await expect(dialog.locator(".contact-consent")).toContainText(
    "Plattr uses your number only for this request",
  );
  await expect(dialog.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await dialog.getByLabel("Your name").fill("Meera Iyer");
  await dialog.getByLabel("Your WhatsApp number").fill("98765 43210");
  await dialog.getByRole("button", { name: "Get the code" }).click();
  const code = dialog.locator(".code-value");
  await expect(code).toHaveText(/^\d{6}$/);
  await expect(dialog.locator(".contact-code .badge")).toHaveText("Prototype");
  await dialog
    .getByLabel("Code", { exact: true })
    .fill((await code.textContent()) ?? "");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Request sent" }),
  ).toBeVisible();
  const whatsapp = dialog.getByRole("link", { name: "Send on WhatsApp" });
  await expect(whatsapp).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/910000000008\?text=/,
  );
  const href = (await whatsapp.getAttribute("href")) ?? "";
  expect(decodeURIComponent(href)).toContain("Gold plate, ₹500 a plate");
  expect(decodeURIComponent(href)).toContain("120 guests, Jayanagar 4th Block");
  expect(decodeURIComponent(href)).toContain(
    "With serving staff +₹40 a plate\nEstimate: ₹64,800",
  );

  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  const sent = page.locator("#plan-sent");
  await expect(sent).toContainText("Request sent to Daawat Caterers.");
  await expect(
    sent.getByRole("link", { name: "Send on WhatsApp" }),
  ).toHaveAttribute("href", href);
  await expect(page.getByLabel("Guests", { exact: true })).toHaveValue("120");
  await expect(sweets.locator(".category-count")).toHaveText("3 / 3");
  await page.reload();
  await expect(page.locator("#plan-sent")).toBeVisible();
  await expect(page.getByLabel("Guests", { exact: true })).toHaveValue("120");
  await expect(
    page
      .locator(".plan-category")
      .filter({ hasText: "Sweets" })
      .locator(".category-count"),
  ).toHaveText("3 / 3");
});

test("a change to a smaller package names the limit that the dishes break and offers the packages that allow them", async ({
  page,
}) => {
  await page.goto("/s/daawat-caterers?lang=en");
  await page
    .locator(".extras-catering")
    .getByRole("link", { name: "Plan your menu: Buffet" })
    .click();
  await expect(page.getByRole("radio", { name: /Buffet/ })).toBeChecked();
  const sweets = page.locator(".plan-category").filter({ hasText: "Sweets" });
  for (const dish of ["Gulab jamun", "Mysore pak", "Kesari bath", "Payasam"]) {
    await sweets.getByRole("button", { name: dish }).click();
    await expect(sweets.getByRole("button", { name: dish })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.locator(".package-card", { hasText: "Silver plate" }).click();
  await expect(page.getByRole("radio", { name: /Silver plate/ })).toBeChecked();
  await expect(page.locator("#refused-words")).toHaveText(
    "This plate allows 2 sweets.",
  );
  await expect(sweets.locator(".category-need")).toHaveText("Remove 2");
  await expect(page.locator("#plan-status")).toHaveText(
    "Too many dishes for this package. Remove some, or choose a package that allows them.",
  );
  await expect(
    page.getByRole("button", { name: "Contact seller" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^Buffet: Free choice/ }).click();
  await expect(page.getByRole("radio", { name: /Buffet/ })).toBeChecked();
  await expect(page.locator("#refused")).toBeHidden();
  await expect(sweets.locator(".category-count")).toHaveText("4");
});

test("the Catering tab shows each caterer as a head over a card for each package", async ({
  page,
}) => {
  await page.goto("/?lang=en#catering");
  const caterer = page.locator(".caterer", { hasText: "Daawat Caterers" });
  await expect(caterer.locator(".cook-card-kind")).toHaveText(
    "Jayanagar · Plate and buffet packages",
  );
  await expect(caterer.locator(".cook-card-rating")).not.toBeEmpty();
  await expect(caterer, "a caterer is not a card around cards").not.toHaveClass(
    /\bcard\b/,
  );
  const cards = caterer.locator(".caterer-packages > li.card");
  await expect(cards.first()).toContainText("Silver plate");
  expect(await cards.count()).toBeGreaterThan(1);
  await expect(
    caterer.getByRole("link", { name: "Plan your menu: Silver plate" }),
  ).toBeVisible();
});

test("a company writes a board post with the work email code and sees it on its link", async ({
  page,
}) => {
  await page.goto("/board-posts/new?lang=en");
  await expect(
    page.getByRole("heading", { name: "Post a request on the board" }),
  ).toBeVisible();
  await page.getByLabel("Description").fill("A design studio in Indiranagar");
  await page.getByLabel("Item", { exact: true }).fill("Besan laddu");
  await page.getByLabel("Quantity", { exact: true }).fill("800");
  await page.getByLabel("Unit", { exact: true }).selectOption("boxes");
  await page.getByLabel("Need by", { exact: true }).fill(dayFromNow(12));
  await page.getByLabel("Place", { exact: true }).fill("Indiranagar studio");
  await page.getByLabel("Budget for each unit (₹, optional)").fill("180");

  await page.locator("#email").fill("gifts@gmail.com");
  await page.locator("#phone").fill("98765 43299");
  await page.getByRole("button", { name: "Get the codes" }).click();
  await expect(page.locator("#form-error")).toContainText("work email");

  await page.locator("#email").fill("gifts@studio-indiranagar.in");
  await page.getByRole("button", { name: "Get the codes" }).click();
  const emailCode = page.locator("#email-code-value");
  const phoneCode = page.locator("#phone-code-value");
  await expect(emailCode).toHaveText(/^\d{6}$/);
  await expect(phoneCode).toHaveText(/^\d{6}$/);
  await expect(page.locator("#codes .badge")).toHaveText("Prototype");
  await page
    .getByLabel("Email code", { exact: true })
    .fill((await emailCode.textContent()) ?? "");
  await page
    .getByLabel("WhatsApp code", { exact: true })
    .fill((await phoneCode.textContent()) ?? "");
  await page.getByRole("button", { name: "Post request" }).click();

  await expect(page).toHaveURL(/\/board-posts\/[\w-]{16,}$/);
  await expect(
    page.getByRole("heading", { name: "A design studio in Indiranagar" }),
  ).toBeVisible();
  await expect(page.locator("#post-status")).toHaveText("Open");
  await expect(page.locator("#post-items")).toContainText("Besan laddu");
  await expect(page.locator("#post-items")).toContainText("800 boxes");
  await expect(page.locator("#post-places")).toHaveText("Indiranagar studio");
  await expect(page.locator("#post-budget")).toHaveText("₹180 a unit");
  await expect(page.locator("#interests-none")).toContainText(
    "No store has answered yet",
  );

  await page.getByRole("button", { name: "Change the post" }).click();
  await page.getByLabel("Description").fill("A design studio in Domlur");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#post-notice-words")).toHaveText("Changes saved.");
  await expect(
    page.getByRole("heading", { name: "A design studio in Domlur" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A design studio in Domlur" }),
  ).toBeVisible();
  await expect(page.locator("#post-status")).toHaveText("Open");
  await page.getByRole("button", { name: "Close the post" }).click();
  await expect(page.locator("#post-status")).toHaveText("Closed");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#post-status")).toHaveText("Open");
});

test("the example request can be seen and contacted, not changed", async ({
  page,
}) => {
  await page.goto("/?lang=en#bulk");
  await page.getByRole("link", { name: "See an example request" }).click();
  await expect(page).toHaveURL(/\/board-posts\/[\w-]{16,}$/);
  await expect(
    page.getByRole("heading", { name: "A tech company in Whitefield" }),
  ).toBeVisible();
  await expect(page.locator("#post-example")).toContainText(
    "the same for every visitor",
  );
  for (const name of [
    "Change the post",
    "Close the post",
    "Open the post again",
  ]) {
    await expect(page.getByRole("button", { name })).toBeHidden();
  }
  const answer = page.locator(".interest", { hasText: "Ghar Ki Mithai" });
  await answer.getByRole("button", { name: "Contact Ghar Ki Mithai" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".contact-lines")).toContainText(
    "Kaju katli: 1,000 pieces",
  );
  await expect(dialog.locator(".contact-lines")).toContainText(
    "Diwali assorted box (500 g): 500 boxes",
  );
});

test("each store keeps its own bulk cart, with item names that the buyer reads", async ({
  page,
}) => {
  await page.goto("/?lang=en#bulk");
  const ghar = page.locator(".bulk-store", { hasText: "Ghar Ki Mithai" });
  await ghar
    .getByRole("spinbutton", { name: "Quantity of Kaju katli" })
    .fill("600");
  const shobha = page.locator(".bulk-store", { hasText: "Shobha's Kitchen" });
  await expect(shobha).toContainText("Diwali assorted box");
  await shobha
    .getByRole("spinbutton", { name: "Quantity of Diwali assorted box" })
    .fill("30");

  const carts = page.locator(".bulk-cart .bulk-cart-store");
  await expect(carts).toHaveCount(2);
  await expect(carts.first()).toContainText("For Ghar Ki Mithai");
  await expect(carts.first()).toContainText("Kaju katli: 600 pieces");
  await expect(carts.last()).toContainText(
    "Diwali assorted box: 30 pieces · ₹12,600",
  );
  await expect(page.locator(".bulk-cart")).toContainText(
    "Each store gets its own request.",
  );
  for (const cart of await carts.all()) {
    await expect(
      cart.getByRole("button", { name: "Contact seller" }),
      "each store's Contact seller is the same primary button",
    ).toHaveClass(/\bbtn-primary\b/);
  }
  await expect(
    ghar.locator(".cook-card-head .cook-card-rating"),
  ).not.toBeEmpty();

  await carts.last().getByRole("button", { name: "Contact seller" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".contact-lines")).toHaveText(
    "Diwali assorted box: 30 pieces · ₹12,600",
  );
  await dialog.getByLabel("Your name").fill("Priya Nair");
  await dialog.getByLabel("Your WhatsApp number").fill("98765 43277");
  await dialog.getByRole("button", { name: "Get the code" }).click();
  const code = dialog.locator(".code-value");
  await expect(code).toHaveText(/^\d{6}$/);
  await dialog
    .getByLabel("Code", { exact: true })
    .fill((await code.textContent()) ?? "");
  await dialog.getByRole("button", { name: "Send request" }).click();
  const whatsapp = dialog.getByRole("link", { name: "Send on WhatsApp" });
  await expect(whatsapp).toBeVisible();
  expect(
    decodeURIComponent((await whatsapp.getAttribute("href")) ?? ""),
  ).toContain("Diwali assorted box: 30 pieces (₹420 a piece)");
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(carts).toHaveCount(1);
  await expect(page.locator(".bulk-cart-body")).toBeFocused();
  await expect(carts.first()).toContainText("Kaju katli: 600 pieces");
  await expect(
    ghar.getByRole("spinbutton", { name: "Quantity of Kaju katli" }),
  ).toHaveValue("600");
});
