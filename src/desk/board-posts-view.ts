import type { DeskBoardPost } from "../../shared/bulk.ts";
import { isApiError } from "../api/api.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import type { BoardPosts } from "./board-posts.ts";
import { unitAmount } from "./quote-card.ts";
import {
  clone,
  fillFacts,
  fillLines,
  type RequestTemplates,
} from "./request-parts.ts";
import { fillTranslated } from "./translated-view.ts";

// The Request board tab: the open posts of companies in her city, in her
// language with the originals one switch away. She answers each one with
// **I can do this** and an optional note, and can change the note later.
export function createBoardPostsView({
  root,
  posts,
  text,
  templates,
}: {
  root: HTMLElement;
  posts: BoardPosts;
  text: Text;
  templates: RequestTemplates & { post: HTMLTemplateElement };
}): { load(): Promise<void> } {
  const list = part(root, "#posts-list");
  const lead = part(root, "#posts-lead");
  const empty = part(root, "#posts-empty");
  const problem = part(root, "#posts-problem");
  const wait = createWait({
    control: root,
    line: root.querySelector("#posts-wait"),
  });
  const cards = new Map<string, HTMLElement>();
  const editing = new Set<string>();

  const render = () => {
    if (!posts.loaded()) return;
    const city = posts.city();
    const shown = posts.posts();
    lead.textContent = city === null ? "" : text.t("desk.posts.lead", { city });
    lead.hidden = city === null;
    empty.textContent =
      city === null
        ? text.t("desk.posts.no_city")
        : text.t("desk.posts.empty", { city });
    empty.hidden = shown.length > 0;
    const items = shown.map((post) => {
      let item = cards.get(post.id);
      if (item === undefined) {
        item = clone(templates.post);
        item.dataset.id = post.id;
        cards.set(post.id, item);
      }
      fillPost(item, post);
      return item;
    });
    const ids = new Set(shown.map((post) => post.id));
    for (const id of cards.keys()) if (!ids.has(id)) cards.delete(id);
    placeInOrder(list, items);
  };

  const fillPost = (item: HTMLElement, post: DeskBoardPost) => {
    const article = part(item, "article");
    const title = part(item, ".post-title");
    title.id = `post-${post.id}`;
    article.setAttribute("aria-labelledby", title.id);
    part(item, ".post-need").textContent = text.day(post.need_by, "short");
    const description = part(item, ".post-description");
    description.hidden = post.company_name === null;
    const rows = fillLines(
      part(item, ".request-lines tbody"),
      post.items.map((each) => ({
        name: each.name,
        amount: unitAmount(each.quantity, each.unit, text),
        price: "",
      })),
      templates.line,
    );
    fillFacts(
      part(item, ".request-facts"),
      [
        {
          label: text.t("desk.quotes.places"),
          value: post.places.join(", "),
        },
        ...(post.budget_per_unit === null
          ? []
          : [
              {
                label: text.t("desk.quotes.budget"),
                value: text.t("desk.quotes.per_unit", {
                  price: formatMoney(post.budget_per_unit),
                }),
              },
            ]),
      ],
      templates.fact,
    );
    if (post.company_name !== null) title.textContent = post.company_name;
    fillTranslated(
      article,
      [
        {
          element: post.company_name === null ? title : description,
          original: post.description,
          translation: post.description_translation,
        },
        ...post.items.map((each, index) => ({
          element: part(rows[index] ?? item, ".request-item"),
          original: each.name,
          translation: each.name_translation,
        })),
      ],
      text,
    );
    fillAnswer(item, post);
  };

  const fillAnswer = (item: HTMLElement, post: DeskBoardPost) => {
    const { interest } = post;
    const failed = posts.failure(post.id);
    const asking = interest === null || editing.has(post.id);
    const answered = part(item, ".post-answered");
    answered.hidden = asking;
    const yourNote = part(answered, ".post-your-note");
    yourNote.hidden = interest?.note === null || interest === null;
    part(yourNote, ".post-note-text").textContent = interest?.note ?? "";
    part(answered, ".post-change").toggleAttribute(
      "aria-busy",
      posts.sending(post.id),
    );

    const form = part<HTMLFormElement>(item, ".post-form");
    form.hidden = !asking;
    const note = part<HTMLTextAreaElement>(form, ".post-note");
    note.id = `post-note-${post.id}`;
    part<HTMLLabelElement>(form, ".post-note-label").htmlFor = note.id;
    const hint = part(form, ".post-note-hint");
    hint.id = `post-hint-${post.id}`;
    note.setAttribute("aria-describedby", hint.id);
    const error = part(form, ".post-error");
    const words = failed === undefined ? "" : failureWords(failed);
    error.textContent = words;
    error.hidden = words === "";
    if (words !== "") {
      form.hidden = false;
      answered.hidden = true;
    }
  };

  const failureWords = (error: unknown) =>
    isApiError(error) && error.code === "order_closed"
      ? text.t("desk.posts.closed")
      : text.error(error, "desk");

  list.addEventListener("submit", (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    event.preventDefault();
    const id = event.target.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (id === undefined) return;
    const note = part<HTMLTextAreaElement>(event.target, ".post-note");
    editing.delete(id);
    posts.answer(id, note.value.trim() === "" ? null : note.value.trim());
    part<HTMLButtonElement>(
      cards.get(id) ?? event.target,
      ".post-change",
    ).focus({ preventScroll: true });
  });
  list.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest(".post-change");
    const item = button?.closest<HTMLElement>("[data-id]");
    const id = item?.dataset.id;
    if (item === undefined || item === null || id === undefined) return;
    const post = posts.posts().find((each) => each.id === id);
    editing.add(id);
    const note = part<HTMLTextAreaElement>(item, ".post-note");
    note.value = post?.interest?.note ?? "";
    render();
    note.focus();
  });
  posts.subscribe(render);

  const load = async () => {
    try {
      await wait.run(
        (signal) => posts.load(signal),
        text.t("desk.posts.opening"),
        { restart: true },
      );
      problem.hidden = true;
    } catch (error) {
      const words = text.error(error, "desk");
      if (words === "" || (posts.loaded() && list.children.length > 0)) return;
      part(problem, ".error").textContent = words;
      problem.hidden = false;
    }
  };
  part(problem, "button").addEventListener("click", () => void load());
  return { load };
}

// Moves cards only when their order changed, so that a note she is typing
// keeps its focus through a refresh.
function placeInOrder(parent: Element, wanted: readonly Element[]): void {
  const current = [...parent.children];
  if (
    current.length === wanted.length &&
    current.every((child, index) => child === wanted[index])
  ) {
    return;
  }
  parent.replaceChildren(...wanted);
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`A board post has no ${selector}.`);
  return found;
}
