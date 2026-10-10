import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnabled, seedE2E } from "./seed";

test.skip(!e2eEnabled, "Set E2E_* env vars to run against a deployed preview.");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_CLIENT_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_CLIENT_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/portal");
}

test("client approves a deliverable", async ({ page }) => {
  const { deliverableId } = await seedE2E();
  await login(page);
  await page.goto(`/portal/deliverables/${deliverableId}`);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. Thank you!")).toBeVisible();
});

test("client must explain requested changes", async ({ page }) => {
  const { deliverableId } = await seedE2E();
  await login(page);
  await page.goto(`/portal/deliverables/${deliverableId}`);
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByLabel("What should change?").fill("Make the logo larger.");
  await page.getByRole("button", { name: "Send change request" }).click();
  await expect(page.getByText("Got it. We'll make those changes.")).toBeVisible();
});

test("client submits a request", async ({ page }) => {
  const { projectId } = await seedE2E();
  await login(page);
  await page.goto(`/portal/projects/${projectId}`);
  await page.getByLabel("Your message").fill("Can we add a pricing page?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Sent. Carson will follow up.")).toBeVisible();
});

test("client cannot open the admin area", async ({ page }) => {
  await seedE2E();
  await login(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/portal$/);
});

test("portal pages have no serious accessibility violations", async ({ page }) => {
  const { projectId, deliverableId } = await seedE2E();
  await login(page);
  for (const path of ["/portal", `/portal/projects/${projectId}`, `/portal/deliverables/${deliverableId}`]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), path).toEqual([]);
  }
});

test("login page is accessible", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
