import { expect, test, type Page } from "@playwright/test";
import { demoToken } from "./test-env.ts";

// The seller desk on a laptop, on the real server with the demo seed and
// recorded Sarvam answers. English keeps the words of the steps stable; the
// demo seller's own language is Kannada.
const openDemoDesk = async (page: Page) => {
  await page.goto(`/desk?demo=${demoToken}&lang=en`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Order board" }),
  ).toBeVisible();
};

test("the demo desk opens with the seeded order slips", async ({ page }) => {
  await openDemoDesk(page);
  await expect(page).not.toHaveURL(/demo=/);
  await expect(page.locator(".app-bar .wordmark")).toHaveText("Plattr");
  await expect(page.locator("#store-name")).toHaveText("Shobha's Kitchen");
  await expect(page.locator("#store-place")).toHaveText(
    "Basavanagudi, Bengaluru",
  );
  await expect(page.locator(".board-day").first()).toBeVisible();
  await expect(page.locator(".board .slip").first()).toBeVisible();
  expect(await page.locator(".board .slip").count()).toBeGreaterThanOrEqual(17);
  const slip = page.locator(".board .slip", { hasText: "Lakshmi Rao" });
  await expect(slip.locator(".slip-status")).toHaveText("New");
  await expect(slip.locator(".food-mark").first()).toHaveAccessibleName("Veg");
  await expect(page.locator("#daily .money").first()).toBeVisible();
});

test("a stamp shows at once, and Undo takes it back", async ({ page }) => {
  await openDemoDesk(page);
  const slip = page.locator(".board .slip", { hasText: "Ravi Kumar" });
  await expect(slip.locator(".slip-status")).toHaveText("New");

  await slip.getByRole("button", { name: "Start making" }).click();
  await expect(slip.locator(".slip-status")).toHaveText("Making");
  await expect(slip.getByRole("button", { name: "Mark ready" })).toBeVisible();

  await slip.getByRole("button", { name: "Undo" }).click();
  await expect(slip.locator(".slip-status")).toHaveText("New");
  await expect(
    slip.getByRole("button", { name: "Start making" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page
      .locator(".board .slip", { hasText: "Ravi Kumar" })
      .locator(".slip-status"),
  ).toHaveText("New");
});

test("a sample voice note becomes a checked, saved order on the board", async ({
  page,
}) => {
  await openDemoDesk(page);
  await expect(page.locator(".board .slip").first()).toBeVisible();
  const slipsBefore = await page.locator(".board .slip").count();
  const add = page.locator("#add");
  await expect(add.locator("#add-recorded")).toBeVisible();

  const sample = add.locator(".sample").first();
  await expect(sample).toContainText("Kannada");
  await sample.click();

  await expect(
    add.getByRole("heading", { name: "Check the order" }),
  ).toBeVisible();
  await expect(add.locator("#heard")).toContainText("ಮೈಸೂರು ಪಾಕ್");
  await expect(add.locator(".answer-total-value")).not.toHaveText("₹0");
  await add.getByRole("button", { name: "Save order" }).click();

  await expect(add.getByText("Order saved")).toBeVisible();
  await expect(
    add.getByRole("link", { name: "Send on WhatsApp" }),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  const saved = page.locator(".board .slip", { hasText: "ಪ್ರಿಯಾ" });
  await expect(saved).toBeVisible();
  await expect(saved.locator(".slip-status")).toHaveText("New");
  await expect(page.locator(".board .slip")).toHaveCount(slipsBefore + 1);

  await add.getByRole("button", { name: "Add another order" }).click();
  await expect(add.locator(".sample").first()).toBeVisible();
});

test("the seller of test-kitchen signs in with the code on the screen", async ({
  page,
}) => {
  await page.goto("/desk?lang=en");
  await expect(
    page.getByRole("heading", { name: "Open your desk" }),
  ).toBeVisible();
  await page.getByLabel("WhatsApp number").fill("+91 00000 00002");
  await page.getByRole("button", { name: "Get the code" }).click();

  const shown = page.locator("#code-shown");
  await expect(shown).toHaveText(/^\d{6}$/);
  await expect(page.getByLabel("Code", { exact: true })).toHaveValue(
    (await shown.textContent()) ?? "",
  );
  await page.getByRole("button", { name: "Open my desk" }).click();

  await expect(page.locator("#store-name")).toHaveText("Test Kitchen");
  await expect(
    page.getByRole("heading", { level: 1, name: "Order board" }),
  ).toBeVisible();
  await expect(page.locator("#demo-nav")).toBeHidden();
  await expect(page.locator("#samples")).toBeHidden();
});

// The stock flows run on test-kitchen, which is not in the marketplace, so
// that a pause never meets a buyer test on the hero store. Its own address
// keeps its code out of the shared limit, and each change is undone.
const signInDesk = async (page: Page, phone: string, address: string) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": address });
  await page.goto("/desk?lang=en");
  await page.getByLabel("WhatsApp number").fill(phone);
  await page.getByRole("button", { name: "Get the code" }).click();
  await expect(page.locator("#code-shown")).toHaveText(/^\d{6}$/);
  await page.getByRole("button", { name: "Open my desk" }).click();
};

test("menu stock: sold out, pause and a closed day, each with one touch", async ({
  page,
}) => {
  await signInDesk(page, "+91 00000 00002", "198.51.100.92");
  await expect(page.locator("#store-name")).toHaveText("Test Kitchen");

  const desk = async () =>
    (await (await page.request.get("/api/desk/store")).json()) as {
      store: { paused: boolean };
      menu: { id: string; name_latin: string | null; sold_out: boolean }[];
      closed_dates: string[];
    };
  const far = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const before = await desk();
  try {
    const tab = (name: string) =>
      page.locator(".side-tabs label", { hasText: name });
    await tab("Menu stock").click();
    await expect(page.getByRole("radio", { name: "Menu stock" })).toBeChecked();
    const row = page.locator("#stock-items li", { hasText: "Kaju katli" });
    const soldOut = row.getByRole("checkbox");
    await expect(soldOut).not.toBeChecked();
    await row.click();
    await expect(soldOut).toBeChecked();
    const kajuKatli = async () =>
      (await desk()).menu.find((item) =>
        item.name_latin?.startsWith("Kaju katli"),
      )?.sold_out;
    await expect.poll(kajuKatli).toBe(true);
    await row.click();
    await expect(soldOut).not.toBeChecked();
    await expect.poll(kajuKatli).toBe(false);

    const pause = page.getByRole("checkbox", {
      name: "Not taking orders now",
    });
    await pause.check();
    const notice = page.locator("#paused-notice");
    await expect(notice).toContainText("Not taking orders now");
    await expect
      .poll(async () => {
        const store = await page.request.get("/api/stores/test-kitchen");
        return ((await store.json()) as { store: { paused: boolean } }).store
          .paused;
      })
      .toBe(true);
    await notice.getByRole("button", { name: "Take orders again" }).click();
    await expect(notice).toBeHidden();
    await expect(pause).not.toBeChecked();
    await expect.poll(async () => (await desk()).store.paused).toBe(false);

    await tab("Today's khata").click();
    await page.getByLabel("Another day").fill(far);
    const chosen = page.locator("#daily-chips input:checked");
    await expect(chosen).toHaveValue(far);
    await expect(page.locator("#daily-none")).toBeVisible();
    const closed = page.getByRole("checkbox", { name: "Closed" });
    await closed.check();
    await expect(
      page.locator("#daily-chips label:has(:checked)"),
    ).toContainText("Closed");
    await expect.poll(async () => (await desk()).closed_dates).toContain(far);
    await page.reload();
    await expect(page.locator("#daily-chips")).toContainText("Closed");
    await page.locator("#daily-chips label", { hasText: "Closed" }).click();
    await page.getByRole("checkbox", { name: "Closed" }).uncheck();
    await expect
      .poll(async () => (await desk()).closed_dates)
      .not.toContain(far);
  } finally {
    const headers = { "Content-Type": "application/json" };
    await page.request.put("/api/desk/paused", {
      headers,
      data: { paused: before.store.paused },
    });
    await page.request.put(`/api/desk/closed-dates/${far}`, {
      headers,
      data: { closed: false },
    });
    for (const item of before.menu) {
      await page.request.put(`/api/desk/items/${item.id}/sold-out`, {
        headers,
        data: { sold_out: item.sold_out },
      });
    }
  }
});

test("a refund waits 10 s with Undo, then returns the full amount", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openDemoDesk(page);
  const slip = page.locator(".board .slip", { hasText: "Lakshmi Rao" });
  await expect(slip.locator(".slip-paid")).toBeVisible();
  const id = await slip.getAttribute("data-id");
  const amount = (await slip.locator(".slip-amount").textContent()) ?? "";
  const state = slip.locator(".slip-state-text");
  try {
    await slip.getByRole("button", { name: "Refund" }).click();
    await expect(state).toHaveText(`Refunding ${amount}`);
    await slip.getByRole("button", { name: "Undo" }).click();
    await expect(state).toHaveText("");
    await expect(slip.locator(".slip-paid")).toBeVisible();

    await slip.getByRole("button", { name: "Refund" }).click();
    await expect(state).toHaveText(`Refunded ${amount}`, { timeout: 15_000 });
    await expect(slip.locator(".slip-paid")).toBeHidden();
    await expect(slip.getByRole("button", { name: "Mark paid" })).toBeVisible();
  } finally {
    await page.request.patch(`/api/desk/orders/${id}`, {
      headers: { "X-Demo-Token": demoToken },
      data: { action: "paid", paid: true },
    });
  }
});

// A demo note is in her own language, so the board answer gets a note in
// English with its translation into Kannada, as the server sends it.
test("a buyer's note shows in her language, with the original one tap away", async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === "/api/desk/orders",
    async (route) => {
      const response = await route.fetch();
      const board = (await response.json()) as {
        days: { slips: Record<string, unknown>[] }[];
      };
      for (const slip of board.days.flatMap((day) => day.slips)) {
        if (slip.buyer_name !== "Prakash Murthy") continue;
        slip.note = "A little less sugar, please";
        slip.note_translation = { text: "ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", language: "kn" };
      }
      await route.fulfill({ response, json: board });
    },
  );
  await openDemoDesk(page);
  const note = page
    .locator(".board .slip", { hasText: "Prakash Murthy" })
    .locator(".slip-note");
  await expect(note.locator(".translated-badge")).toHaveText("Translated");
  await expect(note.locator(".slip-note-text")).toHaveText("ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ");
  await note.getByRole("button", { name: "Show the original" }).click();
  await expect(note.locator(".slip-note-text")).toHaveText(
    "A little less sugar, please",
  );
  await expect(note.locator(".translated-badge")).toBeHidden();
  await note.getByRole("button", { name: "Show the translation" }).click();
  await expect(note.locator(".slip-note-text")).toHaveText("ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ");
});

// Ghar Ki Mithai has a bulk section, so its desk shows the request board of
// Bengaluru. A buyer sends it a real bulk request first. The answer to the
// shared demo board post goes to a stand-in, so that the post keeps its
// answers for the other specs.
test("quote requests and the request board on the desk of a bulk store", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "198.51.100.93" });
  const listing = (await (
    await page.request.get("/api/bulk/stores")
  ).json()) as {
    stores: {
      store: { id: string; slug: string };
      items: { id: string; name: string; min_qty: number }[];
    }[];
  };
  const ghar = listing.stores.find(
    (each) => each.store.slug === "ghar-ki-mithai",
  );
  const item = ghar?.items[0];
  expect(item).toBeDefined();
  const phone = "+919876512345";
  const start = await page.request.post("/api/verify/start", {
    data: { phone, purpose: "order" },
  });
  const { code } = (await start.json()) as { code: string };
  const check = await page.request.post("/api/verify/check", {
    data: { phone, purpose: "order", code },
  });
  const { proof } = (await check.json()) as { proof: string };
  const note = `Gift boxes for our team, ${Date.now()}`;
  const quote = await page.request.post("/api/quotes", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      proof,
      buyer_name: "Meera",
      language: "en",
      request: {
        kind: "bulk",
        store_id: ghar?.store.id,
        lines: [{ item_id: item?.id, quantity: item?.min_qty }],
        need_by: null,
        place: "Whitefield office",
        note,
      },
    },
  });
  expect(quote.status()).toBe(201);

  await signInDesk(page, "+91 00000 00003", "198.51.100.93");
  await expect(page.locator("#store-name")).toHaveText("Ghar Ki Mithai");
  const tab = (name: string) =>
    page.locator(".main-tabs label", { hasText: name });
  await tab("Quote requests").click();
  const card = page.locator("#quotes-list .request", { hasText: note });
  await expect(card.locator(".request-title")).toHaveText("Bulk request");
  await expect(card).toContainText(item?.name ?? "");
  await expect(card).toContainText("Whitefield office");
  await expect(
    card.getByRole("link", { name: "Reply on WhatsApp" }),
  ).toHaveAttribute("href", "https://wa.me/919876512345");

  await page.route("**/api/desk/board-posts/*/interest", (route) =>
    route.fulfill({
      status: 201,
      json: {
        post_id: /board-posts\/([^/]+)\/interest/.exec(
          route.request().url(),
        )?.[1],
        interest: {
          note: "Rs 240 a box",
          note_language: "hi-IN",
          created_at: Date.now(),
        },
      },
    }),
  );
  await tab("Request board").click();
  const post = page.locator("#posts-list .request").first();
  await expect(post).toBeVisible();
  await expect(page.locator("#posts-lead")).toContainText("Bengaluru");
  const change = post.getByRole("button", { name: "Change your note" });
  const earlier = await post.locator(".post-note-text").textContent();
  if (await change.isVisible()) {
    await change.click();
    await expect(post.getByLabel("Your note")).toHaveValue(earlier ?? "");
  }
  await post.getByLabel("Your note").fill("Rs 240 a box");
  await post.getByRole("button", { name: "I can do this" }).click();
  await expect(post.getByText("You told them you can do this.")).toBeVisible();
  await expect(post.locator(".post-note-text")).toHaveText("Rs 240 a box");
  await expect(change).toBeFocused();
});

test("Enter in a Change field confirms that field only, and Undo takes a saved order back", async ({
  page,
}) => {
  await openDemoDesk(page);
  await expect(page.locator(".board .slip").first()).toBeVisible();
  const slips = page.locator(".board .slip");
  const before = await slips.count();
  const add = page.locator("#add");
  await add.locator(".sample").first().click();
  await expect(
    add.getByRole("heading", { name: "Check the order" }),
  ).toBeVisible();
  const save = add.getByRole("button", { name: "Save order" });
  const box = await save.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );

  const name = add.locator('[data-field="buyer_name"]');
  await name.getByRole("button", { name: "Change" }).click();
  await name.locator("input").fill("Priya Rao");
  await name.locator("input").press("Enter");
  await expect(add.locator("#add-check")).toBeVisible();
  await expect(name.locator(".answer-text")).toHaveText("Priya Rao");
  await expect(name.getByRole("button", { name: "Change" })).toBeFocused();
  await expect(slips).toHaveCount(before);

  await save.click();
  await expect(add.getByText("Order saved")).toBeVisible();
  await expect(slips).toHaveCount(before + 1);
  await add.getByRole("button", { name: "Undo" }).click();
  await expect(add.locator("#add-check")).toBeVisible();
  await expect(name.locator(".answer-text")).toHaveText("Priya Rao");
  await expect(slips).toHaveCount(before);
  await page.reload();
  await expect(page.locator(".board .slip").first()).toBeVisible();
  await expect(
    page.locator(".board .slip", { hasText: "Priya Rao" }),
  ).toHaveCount(0);
});

test("an English desk names each item in English, and a Kannada desk in Kannada first, then in English", async ({
  page,
}) => {
  await openDemoDesk(page);
  const line = page.locator(".board .slip .slip-lines tr").first();
  await expect(line.locator(".line-item")).toHaveText(/^[A-Za-z][A-Za-z ()]*$/);
  await expect(line.locator(".line-latin")).toBeHidden();

  await page.goto("/desk?lang=kn");
  const kannada = page.locator(".board .slip .slip-lines tr").first();
  await expect(kannada.locator(".line-item")).toHaveText(/\p{Script=Kannada}/u);
  await expect(kannada.locator(".line-latin")).toBeVisible();
  await expect(kannada.locator(".line-latin")).toHaveText(
    /^, [A-Za-z][A-Za-z ()]*$/,
  );
});

test("a change over the day's limit warns first, and Esc saves nothing", async ({
  page,
}) => {
  await openDemoDesk(page);
  const slip = page.locator(".board .slip", { hasText: "Asha Nair" });
  const total = (await slip.locator(".slip-amount").textContent()) ?? "";
  await slip.getByRole("button", { name: "Change" }).click();
  const dialog = page.locator("#edit-dialog");
  await expect(dialog.locator(".pack-row .line-item").first()).toHaveText(
    /^[A-Za-z][A-Za-z ()]*$/,
  );
  await expect(dialog.locator(".pack-row .line-latin").first()).toBeHidden();
  const more = dialog.locator(".pack-more").first();
  for (let step = 0; step < 26; step += 1) await more.click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.locator("#edit-notice")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save anyway" }),
  ).toBeVisible();
  await expect(slip.locator(".slip-amount")).toHaveText(total);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open");
  await page.reload();
  await expect(
    page
      .locator(".board .slip", { hasText: "Asha Nair" })
      .locator(".slip-amount"),
  ).toHaveText(total);
});

test("one tap is one step: a double-click on a stamp moves it once", async ({
  page,
}) => {
  await openDemoDesk(page);
  const slip = page.locator(".board .slip", { hasText: "Manjunath Gowda" });
  await expect(slip.locator(".slip-status")).toHaveText("New");
  await slip.getByRole("button", { name: "Start making" }).dblclick();
  await expect(slip.locator(".slip-status")).toHaveText("Making");
  await expect(slip.getByRole("button", { name: "Mark ready" })).toBeVisible();
  await slip.getByRole("button", { name: "Undo" }).click();
  await expect(slip.locator(".slip-status")).toHaveText("New");
});

test("a signed-out desk asks for the session with no error", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto("/desk?lang=en");
  await expect(
    page.getByRole("heading", { name: "Open your desk" }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});

test("the live status tells the truth when the network goes", async ({
  page,
  context,
}) => {
  await openDemoDesk(page);
  const status = page.locator("#live-status");
  await expect(status).toHaveText("Up to date");
  await context.setOffline(true);
  await expect(status).toHaveText(/^Offline/);
  await context.setOffline(false);
  await expect(status).toHaveText("Up to date");
});

test("the khata opens on today, with the money of the last 30 days", async ({
  page,
}) => {
  await openDemoDesk(page);
  await expect(page.locator("#daily-title")).toHaveText("Today's khata");
  await expect(page.locator("#daily-chips input:checked + span")).toHaveText(
    "Today",
  );
  await expect(page.locator("#daily-month [data-money=orders]")).not.toHaveText(
    "0",
  );
});

test("a cash refund still shows its amount after a reload, with no Prototype badge", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openDemoDesk(page);
  const slip = () => page.locator(".board .slip", { hasText: "Divya Hegde" });
  const amount = (await slip().locator(".slip-amount").textContent()) ?? "";
  await slip().getByRole("button", { name: "Mark paid" }).click();
  await expect(slip().locator(".slip-paid")).toBeVisible();
  await slip().getByRole("button", { name: "Refund" }).click();
  await expect(slip().locator(".slip-state-text")).toHaveText(
    `Refunded ${amount}`,
    { timeout: 15_000 },
  );
  await page.reload();
  await expect(slip().locator(".slip-state-text")).toHaveText(
    `Refunded ${amount}`,
  );
  await expect(slip().locator(".slip-prototype")).toBeHidden();
});

test("a catering-only desk leads with its quote requests and packages", async ({
  page,
}) => {
  await signInDesk(page, "+91 00000 00008", "198.51.100.110");
  await expect(page.locator("#store-name")).toHaveText("Daawat Caterers");
  await expect(page.locator('[name="main-tab"][value="quotes"]')).toBeChecked();
  await expect(page.locator(".main-tabs label").first()).toHaveText(
    "Quote requests",
  );
  await expect(page.locator("#quotes")).toBeVisible();
  await expect(page.locator("#add")).toBeHidden();
  await expect(page.locator("#samples")).toBeHidden();
  await expect(page.locator("#packages-link")).toHaveClass(/btn-primary/);
});

test("a new quote request reaches the open desk at once", async ({ page }) => {
  await signInDesk(page, "+91 00000 00003", "198.51.100.111");
  await expect(page.locator("#store-name")).toHaveText("Ghar Ki Mithai");
  await expect(page.locator("#live-status")).toHaveText("Up to date");
  await page.locator(".main-tabs label", { hasText: "Quote requests" }).click();
  const listing = (await (
    await page.request.get("/api/bulk/stores")
  ).json()) as {
    stores: {
      store: { id: string; slug: string };
      items: { id: string; min_qty: number }[];
    }[];
  };
  const ghar = listing.stores.find(
    (each) => each.store.slug === "ghar-ki-mithai",
  );
  const item = ghar?.items[0];
  expect(item).toBeDefined();
  const phone = "+919876512346";
  const start = await page.request.post("/api/verify/start", {
    data: { phone, purpose: "order" },
  });
  const { code } = (await start.json()) as { code: string };
  const check = await page.request.post("/api/verify/check", {
    data: { phone, purpose: "order", code },
  });
  const { proof } = (await check.json()) as { proof: string };
  const note = `Sweets for the office, ${Date.now()}`;
  const quote = await page.request.post("/api/quotes", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      proof,
      buyer_name: "Kiran",
      language: "en",
      request: {
        kind: "bulk",
        store_id: ghar?.store.id,
        lines: [{ item_id: item?.id, quantity: item?.min_qty }],
        need_by: null,
        place: "Koramangala office",
        note,
      },
    },
  });
  expect(quote.status()).toBe(201);
  await expect(
    page.locator("#quotes-list .request", { hasText: note }),
  ).toBeVisible({ timeout: 10_000 });
});
