import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";

const {
  E2E_BUYER_EMAIL,
  E2E_BUYER_PASSWORD,
  E2E_STAFF_EMAIL,
  E2E_STAFF_PASSWORD,
  E2E_ORDER_ID,
} = process.env;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}. See .env.test.example.`);
  return value;
}

const BUYER_EMAIL = requireEnv("E2E_BUYER_EMAIL", E2E_BUYER_EMAIL);
const BUYER_PASSWORD = requireEnv("E2E_BUYER_PASSWORD", E2E_BUYER_PASSWORD);
const STAFF_EMAIL = requireEnv("E2E_STAFF_EMAIL", E2E_STAFF_EMAIL);
const STAFF_PASSWORD = requireEnv("E2E_STAFF_PASSWORD", E2E_STAFF_PASSWORD);
const ORDER_ID = requireEnv("E2E_ORDER_ID", E2E_ORDER_ID);

const ORDER_PATH = `/shop?view=orders&id=${ORDER_ID}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // After successful login the app redirects away from /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function openOrderChat(page: Page) {
  await page.goto(ORDER_PATH);
  // The chat input renders only once the order is loaded.
  await expect(page.getByPlaceholder(/Message/)).toBeVisible({ timeout: 15_000 });
}

async function buildSession(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  await openOrderChat(page);
  return { context, page };
}

test.describe("Sales chat typing indicators", () => {
  let buyerCtx: BrowserContext | undefined;
  let staffCtx: BrowserContext | undefined;

  test.afterEach(async () => {
    await buyerCtx?.close();
    await staffCtx?.close();
    buyerCtx = undefined;
    staffCtx = undefined;
  });

  test("buyer typing shows on staff side and clears", async ({ browser }) => {
    const buyer = await buildSession(browser, BUYER_EMAIL, BUYER_PASSWORD);
    const staff = await buildSession(browser, STAFF_EMAIL, STAFF_PASSWORD);
    buyerCtx = buyer.context;
    staffCtx = staff.context;

    const buyerInput = buyer.page.getByPlaceholder(/Message/);
    const staffIndicator = staff.page.getByText(/Customer is typing/i);

    // Initially hidden.
    await expect(staffIndicator).toHaveCount(0);

    // Buyer starts typing -> staff sees indicator within a few seconds.
    await buyerInput.click();
    await buyerInput.type("Hello there", { delay: 80 });
    await expect(staffIndicator).toBeVisible({ timeout: 5_000 });

    // Buyer clears the text -> sendTyping(true) fires immediately,
    // indicator should disappear on staff side.
    await buyerInput.fill("");
    await expect(staffIndicator).toHaveCount(0, { timeout: 6_000 });
  });

  test("staff typing shows on buyer side and clears", async ({ browser }) => {
    const buyer = await buildSession(browser, BUYER_EMAIL, BUYER_PASSWORD);
    const staff = await buildSession(browser, STAFF_EMAIL, STAFF_PASSWORD);
    buyerCtx = buyer.context;
    staffCtx = staff.context;

    const staffInput = staff.page.getByPlaceholder(/Message/);
    const buyerIndicator = buyer.page.getByText(/Staff is typing/i);

    await expect(buyerIndicator).toHaveCount(0);

    await staffInput.click();
    await staffInput.type("On it", { delay: 80 });
    await expect(buyerIndicator).toBeVisible({ timeout: 5_000 });

    // Stop typing without clearing — the 3s inactivity timer should send a stop.
    // Allow up to 6s for stop broadcast + UI tick.
    await expect(buyerIndicator).toHaveCount(0, { timeout: 8_000 });
  });
});