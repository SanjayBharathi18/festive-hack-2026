import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../api/api.ts";
import { createWait } from "../wait/wait.ts";
import { createSignIn, longWaitOf, type SignInStep } from "./sign-in.ts";

type Sent = { path: string; body: unknown };

function setup(answer: (path: string, body: unknown) => Response) {
  const sent: Sent[] = [];
  const steps: SignInStep[] = [];
  const api = createApi({
    fetch: async (path, init) => {
      const body = JSON.parse(String(init.body));
      sent.push({ path, body });
      return answer(path, body);
    },
  });
  const signIn = createSignIn({
    api,
    waitFor: () =>
      createWait({ control: { setAttribute() {}, removeAttribute() {} } }),
    words: { phone: "Getting the code", code: "Opening your desk" },
    onStep: (step) => steps.push(step),
  });
  return { signIn, sent, steps };
}

const ok = (path: string) =>
  path === "/api/verify/start"
    ? Response.json(
        { prototype: true, code: "123456", expires_at: 1_795_500_000_000 },
        { status: 201 },
      )
    : Response.json({
        purpose: "desk",
        store: { slug: "test-kitchen", name: "Test Kitchen" },
      });

test("her number gets a code, which shows on the screen", async () => {
  const { signIn, sent } = setup(ok);
  await signIn.sendPhone("+91 00000 00002");
  assert.deepEqual(sent, [
    {
      path: "/api/verify/start",
      body: { phone: "+910000000002", purpose: "desk" },
    },
  ]);
  assert.deepEqual(signIn.step, {
    name: "code",
    phone: "+910000000002",
    code: "123456",
    error: undefined,
  });
});

test("the code opens her desk", async () => {
  const { signIn, sent } = setup(ok);
  await signIn.sendPhone("98450 12345");
  await signIn.sendCode("123 456");
  assert.deepEqual(sent[1], {
    path: "/api/verify/check",
    body: { phone: "+919845012345", purpose: "desk", code: "123456" },
  });
  assert.deepEqual(signIn.step, { name: "done" });
});

test("a number that is not a WhatsApp number is stopped before it is sent", async () => {
  const { signIn, sent } = setup(ok);
  await signIn.sendPhone("98450");
  assert.equal(sent.length, 0);
  const step = signIn.step;
  assert.equal(step.name, "phone");
  if (step.name === "phone") {
    assert.equal((step.error as { code: string }).code, "phone_invalid");
  }
});

test("a code that is not 6 digits is stopped before it is sent", async () => {
  const { signIn, sent } = setup(ok);
  await signIn.sendPhone("+91 00000 00002");
  await signIn.sendCode("12");
  assert.equal(sent.length, 1);
  const step = signIn.step;
  assert.equal(step.name, "code");
  if (step.name === "code") {
    assert.equal((step.error as { code: string }).code, "code_invalid");
  }
});

test("a number with no store says so, on the number step", async () => {
  const { signIn } = setup(() =>
    Response.json(
      { error: { code: "seller_not_found", message: "No store." } },
      { status: 404 },
    ),
  );
  await signIn.sendPhone("98450 12345");
  const step = signIn.step;
  assert.equal(step.name, "phone");
  if (step.name === "phone") {
    assert.equal((step.error as { code: string }).code, "seller_not_found");
  }
});

test("a wrong code keeps the code step, and change number goes back", async () => {
  const { signIn } = setup((path) =>
    path === "/api/verify/start"
      ? ok(path)
      : Response.json(
          { error: { code: "code_wrong", message: "Wrong." } },
          { status: 400 },
        ),
  );
  await signIn.sendPhone("98450 12345");
  await signIn.sendCode("654321");
  const step = signIn.step;
  assert.equal(step.name, "code");
  if (step.name === "code") {
    assert.equal((step.error as { code: string }).code, "code_wrong");
    assert.equal(step.code, "123456");
  }
  signIn.changeNumber();
  assert.deepEqual(signIn.step, { name: "phone", error: undefined });
});

test("a long wait for too many tries reads in minutes and seconds", () => {
  const limited = (seconds: number) => ({
    code: "rate_limited",
    params: { seconds },
  });
  assert.deepEqual(longWaitOf(limited(803)), { minutes: 13, seconds: 23 });
  assert.deepEqual(longWaitOf(limited(60)), { minutes: 1, seconds: 0 });
  assert.equal(longWaitOf(limited(45)), undefined);
  assert.equal(longWaitOf({ code: "code_wrong" }), undefined);
  assert.equal(longWaitOf(undefined), undefined);
});
