import { join } from "node:path";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  madeUpSlug,
  publishBodySchema,
  qrPath,
  setupItemSchema,
  setupLimits,
  setupMenuBodySchema,
  setupStoreBodySchema,
  slugFromName,
  slugSchema,
  slugSuggestionQuerySchema,
  type CoverAnswer,
  type PublishAnswer,
  type SetupState,
  type SlugSuggestion,
} from "../../shared/setup.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, type AppError } from "../http/errors.ts";
import { parseInput, readBody, readJson } from "../http/input.ts";
import type { NamedItem } from "../translate/translator.ts";
import { sellerAuth } from "../verify/desk-auth.ts";
import { getMenu } from "./menu.ts";
import {
  createPhotos,
  photoKindOf,
  photoMediaType,
  photoMediaTypes,
  photoNameOf,
  photoUrl,
} from "./photos.ts";
import { qrSvg, storeUrl } from "./qr.ts";
import {
  createSetupData,
  type OwnedStore,
  type SaveStoreResult,
} from "./setup-data.ts";
import { publishedStoreBySlug } from "./store-data.ts";

type SetupDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "log"
  | "limits"
  | "idempotent"
  | "flags"
  | "translator"
>;

const idSchema = z.uuid();
const menuLimitBytes = 256 * 1024;
const photoTypes = new Set(Object.values(photoMediaTypes));

// Seller setup (docs/concept.md, "Seller: setup"). The page keeps her draft
// until she publishes; then it verifies her number, which signs her in, and
// sends the store, the menu and the photo here. Publish makes it public.
export function setupRoutes(deps: SetupDeps): Hono<AppEnv> {
  const { db, clock, config, log, limits, idempotent, flags, translator } =
    deps;
  const seller = sellerAuth(deps);
  const data = createSetupData(db);
  const photos = createPhotos(join(config.DATA_DIR, "photos"));

  const ownStore = (sellerId: string, id: string): OwnedStore => {
    const store = data.owned(parseInput(idSchema, id));
    if (store === undefined || store.seller_id !== sellerId) {
      throw storeNotFound();
    }
    return store;
  };
  const stateOf = (storeId: string): SetupState => {
    const store = data.setup(storeId);
    if (store === undefined) throw storeNotFound();
    return { store, items: getMenu(db, storeId) };
  };
  // An item name in an Indian script with no Latin form gets one from Sarvam,
  // so search finds it. With no answer, the item keeps its original only.
  const withLatinNames = async <E extends AppEnv, T extends NamedItem>(
    c: Context<E>,
    items: readonly T[],
  ): Promise<T[]> => {
    const signal = c.req.raw.signal;
    const values = await flags.environment(signal);
    c.set("flagVariants", {
      ...c.get("flagVariants"),
      ops_transliteration: values.ops_transliteration,
    });
    const latin = await translator.latinNames(items, { signal });
    return items.map((item) => ({
      ...item,
      name_latin: item.name_latin ?? fitting(latin.get(item.id)),
    }));
  };
  // A link for a name with no Latin letters, such as दूसरी दुकान: from the
  // Latin form that Sarvam gives, or made up when there is no answer. The
  // link is free now; publish checks it again.
  const suggestSlug = async <E extends AppEnv>(
    c: Context<E>,
    name: string,
    store: string | undefined,
  ): Promise<SlugSuggestion> => {
    const free = (slug: string) => {
      const check = data.checkSlug(slug, store);
      return check.available ? slug : check.suggestion;
    };
    const own = slugFromName(name);
    const fromName = own === "" ? null : free(own);
    if (fromName !== null) return { slug: fromName, from: "name" };
    if (own === "") {
      const [item] = await withLatinNames(c, [
        { id: "name", name, name_latin: null },
      ]);
      const latin = slugFromName(item?.name_latin ?? "");
      const fromLatin = latin === "" ? null : free(latin);
      if (fromLatin !== null) return { slug: fromLatin, from: "latin" };
    }
    for (let tries = 0; tries < 5; tries += 1) {
      const madeUp = free(madeUpSlug());
      if (madeUp !== null) return { slug: madeUp, from: "made_up" };
    }
    throw new Error("No free made-up link was found.");
  };
  const replaceCover = async (storeId: string, url: string | null) => {
    const old = photoNameOf(data.setCover(storeId, url));
    if (old === undefined || photoUrl(old) === url) return;
    await photos
      .remove(old)
      .catch((error: unknown) =>
        log({ msg: "an old cover photo stays on disk", error: String(error) }),
      );
  };

  return new Hono<AppEnv>()
    .get("/api/sell/slugs/:slug", (c) => {
      const slug = parseInput(slugSchema, c.req.param("slug"));
      const store = c.req.query("store");
      const own = store === undefined ? undefined : parseInput(idSchema, store);
      c.header("Cache-Control", "no-store");
      return c.json(data.checkSlug(slug, own));
    })
    .get("/api/sell/slug-suggestion", limits.searches, async (c) => {
      const { name, store } = parseInput(
        slugSuggestionQuerySchema,
        c.req.query(),
      );
      c.header("Cache-Control", "no-store");
      return c.json(await suggestSlug(c, name, store));
    })
    .get("/api/stores/:slug/qr.svg", async (c) => {
      const store = publishedStoreBySlug(db, c.req.param("slug"));
      if (store === undefined) throw storeNotFound();
      const svg = await qrSvg(storeUrl(config.PUBLIC_URL, store.slug));
      c.header("Content-Type", "image/svg+xml; charset=utf-8");
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(svg);
    })
    .get("/api/photos/:name", async (c) => {
      const name = c.req.param("name");
      const type = photoMediaType(name);
      const bytes = type === undefined ? undefined : await photos.read(name);
      if (type === undefined || bytes === undefined) {
        throw appError(404, "not_found", "This photo is not here any more.");
      }
      c.header("Content-Type", type);
      c.header("Cache-Control", "public, max-age=31536000, immutable");
      c.header("X-Content-Type-Options", "nosniff");
      return c.body(new Uint8Array(bytes));
    })
    .get("/api/desk/stores/:id", seller, (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      c.header("Cache-Control", "no-store");
      return c.json(stateOf(store.id));
    })
    .put("/api/desk/stores/:id", seller, async (c) => {
      const id = parseInput(idSchema, c.req.param("id"));
      const body = await readJson(c, setupStoreBodySchema);
      const saved = data.saveStore(c.get("sellerId"), id, body);
      if (!saved.ok) throw saveError(saved.reason);
      return c.json(stateOf(id));
    })
    .put("/api/desk/stores/:id/items", seller, async (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      const { items } = await readJson(c, setupMenuBodySchema, {
        limitBytes: menuLimitBytes,
      });
      if (!data.saveMenu(store.id, await withLatinNames(c, items))) {
        throw idInUse();
      }
      return c.json(stateOf(store.id));
    })
    .put("/api/desk/stores/:id/items/:itemId", seller, async (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      const item = await readJson(c, setupItemSchema);
      if (item.id !== c.req.param("itemId")) {
        throw appError(
          400,
          "invalid_input",
          "The item id in the body must be the id in the address.",
        );
      }
      const [named = item] = await withLatinNames(c, [item]);
      if (!data.saveItem(store.id, named)) throw idInUse();
      return c.json(stateOf(store.id));
    })
    .delete("/api/desk/stores/:id/items/:itemId", seller, (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      if (!data.removeItem(store.id, c.req.param("itemId"))) {
        throw appError(404, "not_found", "This item is not in your store.");
      }
      return c.json(stateOf(store.id));
    })
    .put("/api/desk/stores/:id/cover", limits.uploads, seller, async (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      const declared =
        c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!photoTypes.has(declared)) throw notAPhoto();
      const bytes = await readBody(c.req.raw, setupLimits.photoBytes);
      const kind = photoKindOf(bytes);
      if (kind === undefined || photoMediaTypes[kind] !== declared) {
        throw notAPhoto();
      }
      const url = photoUrl(await photos.save(store.id, bytes, kind));
      await replaceCover(store.id, url);
      const answer: CoverAnswer = { cover_photo: url };
      return c.json(answer);
    })
    .delete("/api/desk/stores/:id/cover", seller, async (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      await replaceCover(store.id, null);
      const answer: CoverAnswer = { cover_photo: null };
      return c.json(answer);
    })
    .post("/api/desk/stores/:id/publish", seller, idempotent, async (c) => {
      const store = ownStore(c.get("sellerId"), c.req.param("id"));
      await readJson(c, publishBodySchema);
      if (!data.publish(store, clock.now())) {
        throw appError(
          400,
          "invalid_input",
          "Add one item with a pack and a price, then publish.",
        );
      }
      const answer: PublishAnswer = {
        store: { id: store.id, slug: store.slug, name: store.name },
        url: storeUrl(config.PUBLIC_URL, store.slug),
        qr_svg: qrPath(store.slug),
      };
      return c.json(answer);
    });
}

function saveError(
  reason: Extract<SaveStoreResult, { ok: false }>["reason"],
): AppError {
  switch (reason) {
    case "not_yours":
      return appError(
        403,
        "forbidden",
        "This store belongs to another WhatsApp number.",
      );
    case "has_store":
      return appError(
        403,
        "forbidden",
        "Your number already has a store. Change it on your desk.",
      );
    case "slug_taken":
      return appError(
        409,
        "invalid_input",
        "Another store has this link. Choose another link.",
      );
    case "slug_changed":
      return appError(
        403,
        "forbidden",
        "You changed your link one time already, so it stays as it is.",
      );
  }
}

// A longer Latin form would fail the check of her next save.
function fitting(latin: string | undefined): string | null {
  return latin !== undefined && latin.length <= setupLimits.nameLength
    ? latin
    : null;
}

function storeNotFound(): AppError {
  return appError(
    404,
    "not_found",
    "This store does not exist. Check the link, or ask the seller for it.",
  );
}

function idInUse(): AppError {
  return appError(
    403,
    "forbidden",
    "An item or a pack id belongs to another store. Make new ids.",
  );
}

function notAPhoto(): AppError {
  return appError(
    415,
    "unsupported_media_type",
    "Send the photo as a JPEG, PNG or WebP file.",
  );
}
