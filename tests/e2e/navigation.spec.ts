import { test, expect } from "@playwright/test";

test("navigates among photo, outfits, and pieces pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Capture your look")).toBeVisible();
  await page.getByRole("tab", { name: "◇ Outfits" }).click();
  await expect(page.getByText("Browse complete looks by category.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse Uncategorized" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Casual" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Casual" }).click();
  await expect(page.getByLabel("Category name for Casual")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "＋ Add outfit category" }).click();
  await page.getByLabel("New outfit category name").fill("Travel");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("button", { name: "Expand Travel" })).toBeVisible();
  await page.getByRole("tab", { name: "□ Pieces" }).click();
  await expect(page.getByText("Every extracted item, grouped into your own editable categories")).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse Uncategorized" })).toBeVisible();
  await expect(page.getByRole("button", { name: "＋ Add piece category" })).toBeVisible();
});

test("photo page offers camera and library capture", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose photo" })).toBeVisible();
});

test("category headers preview their saved images", async ({ page }) => {
  const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23b84f32'/%3E%3C/svg%3E";
  await page.addInitScript(({ image }) => localStorage.setItem("fashion-canvas-library-v1", JSON.stringify({
    outfits: [{ id: "look-1", image, description: "Rust linen summer outfit", categoryId: "outfit-casual", createdAt: "2026-07-29T10:00:00.000Z" }],
    pieces: [{ id: "piece-1", outfitId: "look-1", image, label: "Linen shirt", description: "A rust linen shirt", aiCategory: "top", categoryId: "piece-tops" }],
  })), { image });
  await page.goto("/");
  await page.getByRole("tab", { name: "◇ Outfits" }).click();
  await expect(page.getByLabel("1 item previews")).toBeVisible();
  await page.getByRole("tab", { name: "□ Pieces" }).click();
  await expect(page.getByLabel("1 item previews")).toBeVisible();
});
