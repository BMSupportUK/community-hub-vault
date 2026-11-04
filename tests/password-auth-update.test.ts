import { expect, test } from "bun:test";
import { updatePasswordAuthUser } from "../src/lib/password-auth-update";
import { passwordChangeInput, passwordChoiceAccepted } from "../src/lib/password-reset";

test("recovery update sends the verified bearer without needing a stored SDK session", async () => {
  let captured: Request | undefined;
  const send: typeof fetch = async (input, init) => {
    captured = new Request(input, init);
    return Response.json({ id: "verified-owner" });
  };
  const result = await updatePasswordAuthUser("https://auth.example", "public-key", "Bearer test-session", passwordChangeInput("chosen-password", "", true), send);
  expect(result.error).toBeNull();
  if (!captured) throw new Error("Auth update was not sent");
  expect(captured.url).toBe("https://auth.example/auth/v1/user");
  expect(captured.method).toBe("PUT");
  expect(captured.headers.get("authorization")).toBe("Bearer test-session");
  expect(captured.headers.get("apikey")).toBe("public-key");
  expect(await captured.json()).toEqual({ password: "chosen-password" });
});

test("same-password Auth responses still permit completion but invalid sessions do not", async () => {
  for (const code of ["same_password", "session_not_found", "weak_password"]) {
    const result = await updatePasswordAuthUser("https://auth.example", "public-key", "Bearer test-session", { password: "chosen-password" }, async () => Response.json({ error_code: code, msg: "Auth rejected the update" }, { status: 422 }));
    expect(result.error?.code).toBe(code);
    expect(passwordChoiceAccepted(result.error)).toBe(code === "same_password");
  }
});

test("first-login metadata updates also retain the verified bearer", async () => {
  let body: unknown;
  await updatePasswordAuthUser("https://auth.example", "public-key", "Bearer test-session", { data: { needs_profile: false } }, async (_input, init) => {
    body = JSON.parse(String(init?.body));
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-session");
    return Response.json({});
  });
  expect(body).toEqual({ data: { needs_profile: false } });
});

test("missing bearer fails before any Auth update", async () => {
  let called = false;
  await expect(updatePasswordAuthUser("https://auth.example", "public-key", "", { password: "chosen-password" }, async () => {
    called = true;
    return Response.json({});
  })).rejects.toThrow("request a new password-reset email");
  expect(called).toBe(false);
});