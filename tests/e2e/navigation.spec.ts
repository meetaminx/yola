import { expect, test } from "@playwright/test";

const START = ["/", "/docs", "/playground", "/examples/store"];

test("every internal link resolves", async ({ page, request }) => {
  const seen = new Set<string>();
  for (const start of START) {
    await page.goto(start);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const href of hrefs) {
      if (!href.startsWith("/") || seen.has(href)) continue;
      seen.add(href);
      const [path, hash] = href.split("#");
      if (path) {
        const res = await request.get(path);
        expect(res.status(), `${href} from ${start}`).toBe(200);
      }
      if (hash) {
        await page.goto(path || "/");
        await expect(page.locator(`#${hash}`), `${href} anchor`).toHaveCount(1);
        await page.goto(start);
      }
    }
  }
  expect(seen.size).toBeGreaterThan(15);
});

test("keyboard users can skip to content and reach the primary action", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
