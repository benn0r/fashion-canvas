import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'fashion-canvas-auth-v1',
      JSON.stringify({
        token: 'e2e-auth-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { username: 'fashion_tester', approved: true },
      }),
    ),
  );
});

test('navigates among camera, outfits, and pieces pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Add a mirror selfie' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Camera' })).toBeVisible();
  await page.getByRole('tab', { name: 'Outfits' }).click();
  await expect(page.getByText('No outfits yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Uncategorized/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Casual' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Pieces' }).click();
  await expect(page.getByText('No pieces yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Uncategorized/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByText('Appearance')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'System appearance, selected' })).toBeVisible();
  await page.getByRole('radio', { name: 'Dark appearance' }).click();
  await expect(page.getByRole('radio', { name: 'Dark appearance, selected' })).toBeVisible();
  await expect(page.getByText('Fashion Canvas', { exact: true })).toHaveCSS(
    'color',
    'rgb(245, 241, 232)',
  );
  await page.getByRole('radio', { name: 'Light appearance' }).click();
  await expect(page.getByRole('radio', { name: 'Light appearance, selected' })).toBeVisible();
  await page.getByRole('button', { name: 'Use 3 columns for outfits' }).click();
  await expect(
    page.getByRole('button', { name: 'Use 3 columns for outfits, selected' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit Casual' }).click();
  await expect(page.getByLabel('Category name for Casual')).toHaveValue('Casual');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: '＋ Add outfit category' }).click();
  const newOutfitCategory = page.getByLabel('New outfit category name');
  await expect(newOutfitCategory).toHaveValue('');
  await newOutfitCategory.fill('Travel');
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('button', { name: 'Edit Travel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Uncategorized' })).toHaveCount(2);
});

test('camera page offers camera and library capture', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Take photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photo' })).toBeVisible();
  await expect(
    page.getByText('Keep your entire outfit visible from shoulders to shoes.'),
  ).toBeVisible();
  await expect(page.getByText('You can crop out the background before uploading.')).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose photo' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'mirror-selfie.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#ddd"/><rect x="200" y="100" width="200" height="700" fill="#b84f32"/></svg>',
    ),
  });
  await expect(page.getByLabel('Crop photo')).toBeVisible();
  await expect(page.getByText(/Crop out as much background as possible/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload cropped photo' })).toBeVisible();
});

test('category headers preview their saved images', async ({ page }) => {
  const image =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23b84f32'/%3E%3C/svg%3E";
  await page.addInitScript(
    ({ image }) =>
      localStorage.setItem(
        'fashion-canvas-library-v1',
        JSON.stringify({
          outfits: [
            {
              id: 'look-1',
              image,
              description: 'Rust linen summer outfit',
              categoryId: 'outfit-casual',
              createdAt: '2026-07-29T10:00:00.000Z',
            },
          ],
          pieces: [
            {
              id: 'piece-1',
              outfitId: 'look-1',
              image,
              label: 'Linen shirt',
              description: 'A rust linen shirt',
              aiCategory: 'top',
              categoryId: 'piece-tops',
            },
            {
              id: 'piece-2',
              outfitIds: [],
              image,
              label: 'Silk blouse',
              description: 'A cream silk blouse',
              aiCategory: 'top',
              categoryId: 'piece-tops',
            },
          ],
          settings: { outfitGridColumns: 4, pieceGridColumns: 3 },
        }),
      ),
    { image },
  );
  await page.goto('/');
  await page.getByRole('tab', { name: 'Outfits' }).click();
  await expect(page.getByRole('button', { name: /Uncategorized/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand Casual' })).toBeVisible();
  await expect(page.getByLabel('1 item previews')).toBeVisible();
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Expand Casual' }).click();
  await page.getByRole('button', { name: 'Open outfit Rust linen summer outfit' }).click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit outfit' }).click();
  const outfitDescription = page.getByLabel('Outfit description');
  await expect(outfitDescription).toHaveValue('Rust linen summer outfit');
  await outfitDescription.fill('Tailored rust linen outfit');
  await page.getByRole('radio', { name: 'Use category Work' }).click();
  await page.getByRole('button', { name: 'Save outfit' }).click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Tailored rust linen outfit')).toBeVisible();
  await expect(page.getByLabel('Pieces grid, 3 columns')).toBeVisible();
  await page.getByRole('button', { name: 'Open piece Linen shirt' }).click();
  await expect(page.getByRole('heading', { name: 'Piece details' })).toBeVisible();
  await expect(page.getByText('DESCRIPTION', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Outfits grid, 4 columns')).toBeVisible();
  await page.getByRole('button', { name: 'Edit piece' }).click();
  const pieceTitle = page.getByLabel('Piece title');
  const pieceDescription = page.getByLabel('Piece description');
  await expect(pieceTitle).toHaveValue('Linen shirt');
  await expect(pieceDescription).toHaveValue('A rust linen shirt');
  await pieceTitle.fill('Rust linen shirt');
  await pieceDescription.fill('A tailored rust linen shirt');
  await page.getByRole('radio', { name: 'Use category Tops' }).click();
  await page.getByRole('button', { name: 'Save piece' }).click();
  await expect(
    page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Piece details' }) }),
  ).toContainText('Rust linen shirt');
  await page.getByRole('button', { name: 'Merge piece' }).click();
  await page.getByRole('radio', { name: 'Select Silk blouse' }).click();
  await page.getByRole('radio', { name: 'Keep data from other piece' }).click();
  await page.getByRole('button', { name: 'Confirm merge' }).click();
  await expect(page.getByRole('dialog').getByText('Silk blouse', { exact: true })).toBeVisible();
  await expect(page.getByText('A cream silk blouse')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Open outfit Rust linen summer outfit' })
    .click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close outfit' }).click();
  await page.getByRole('tab', { name: 'Pieces' }).click();
  await expect(page.getByRole('button', { name: /Uncategorized/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand Tops' })).toBeVisible();
  await expect(page.getByLabel('1 item previews')).toBeVisible();
  await page.getByRole('button', { name: 'Expand Tops' }).click();
  await page.getByRole('button', { name: 'Open piece Silk blouse' }).click();
  await expect(page.getByRole('heading', { name: 'Piece details' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Outfits')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open outfit Rust linen summer outfit' }),
  ).toBeVisible();
});

test('piece and outfit deletion require confirmation', async ({ page }) => {
  const image =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%2365705d'/%3E%3C/svg%3E";
  await page.addInitScript(
    ({ image }) =>
      localStorage.setItem(
        'fashion-canvas-library-v1',
        JSON.stringify({
          outfits: [
            {
              id: 'look-delete',
              image,
              description: 'Delete test outfit',
              categoryId: 'outfit-casual',
              createdAt: '2026-07-29T10:00:00.000Z',
            },
          ],
          pieces: [
            {
              id: 'piece-delete',
              outfitIds: ['look-delete'],
              image,
              label: 'Delete test piece',
              description: 'Delete test description',
              aiCategory: 'top',
              categoryId: 'piece-tops',
            },
          ],
          settings: { outfitGridColumns: 2, pieceGridColumns: 2 },
        }),
      ),
    { image },
  );
  await page.goto('/');
  await page.getByRole('tab', { name: 'Pieces' }).click();
  await page.getByRole('button', { name: 'Expand Tops' }).click();
  await page.getByRole('button', { name: 'Open piece Delete test piece' }).click();
  await expect(page.getByRole('button', { name: 'Merge piece' })).toHaveCSS('opacity', '0.38');
  await page.getByText('Delete', { exact: true }).click();
  await expect(
    page.getByText('This piece will be permanently removed from your wardrobe.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Piece details' })).toBeVisible();
  await page.getByText('Delete', { exact: true }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Delete piece' }).click();
  await expect(page.getByRole('button', { name: 'Open piece Delete test piece' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Outfits' }).click();
  await page.getByRole('button', { name: 'Expand Casual' }).click();
  await page.getByRole('button', { name: 'Open outfit Delete test outfit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete outfit' }).click();
  await expect(
    page.getByText(
      'This outfit will be permanently removed. Pieces used only by this outfit will also be deleted.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete outfit' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Delete outfit' }).click();
  await expect(page.getByRole('button', { name: 'Open outfit Delete test outfit' })).toHaveCount(0);
});
