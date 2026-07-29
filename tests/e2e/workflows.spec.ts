import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'fashion-canvas-library-v1';
const PHOTO = {
  name: 'mirror-selfie.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#ded8ce"/><rect x="180" y="80" width="240" height="740" rx="80" fill="#b84f32"/></svg>',
  ),
};

function image(color: string, label: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="${color}"/><text x="120" y="170" text-anchor="middle" fill="white" font-size="24">${label}</text></svg>`)}`;
}

const generated = {
  styledOutfit: image('#6f4538', 'Outfit'),
  pieces: [
    {
      id: 'generated-top',
      image: image('#b84f32', 'Top'),
      label: 'Rust blouse',
      description: 'A tailored rust linen blouse.',
      category: 'top',
    },
    {
      id: 'generated-bottom',
      image: image('#65705d', 'Bottom'),
      label: 'Olive trousers',
      description: 'Wide-leg olive trousers.',
      category: 'bottom',
    },
    {
      id: 'generated-bag',
      image: image('#2c2926', 'Bag'),
      label: 'Black handbag',
      description: 'A structured black handbag.',
      category: 'bag',
    },
  ],
};

async function choosePhoto(page: Page) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose photo' }).click();
  await (await chooserPromise).setFiles(PHOTO);
  await expect(page.getByLabel('Crop photo')).toBeVisible();
}

async function seedLibrary(page: Page, value: Record<string, unknown>) {
  await page.addInitScript(({ key, stored }) => localStorage.setItem(key, JSON.stringify(stored)), {
    key: STORAGE_KEY,
    stored: value,
  });
}

test('generates, configures, and saves an outfit while locking the upload workspace', async ({
  page,
}) => {
  const existingImage = image('#7f3321', 'Existing');
  await seedLibrary(page, {
    outfits: [],
    pieces: [
      {
        id: 'existing-top',
        outfitIds: [],
        image: existingImage,
        label: 'Favorite linen top',
        description: 'An existing linen top.',
        aiCategory: 'top',
        categoryId: 'piece-tops',
      },
    ],
    settings: { outfitGridColumns: 2, pieceGridColumns: 2, theme: 'light' },
  });

  let finishRequest!: () => void;
  const requestGate = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  let uploads = 0;
  await page.route('**/api/outfits', async (route) => {
    uploads += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await requestGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(generated),
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await page.goto('/');
  await choosePhoto(page);
  const upload = page.getByRole('button', { name: 'Upload cropped photo' });
  const retake = page.getByRole('button', { name: 'Choose another photo' });
  await upload.click();

  await expect(page.getByText(/Creating your outfit/)).toBeVisible();
  await expect(upload).toBeDisabled();
  await expect(retake).toBeDisabled();
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    await expect(page.getByLabel(`Drag ${edge} crop edge`)).toHaveCSS('pointer-events', 'none');
  }
  finishRequest();

  await expect(page.getByLabel('Generated outfit')).toBeVisible();
  expect(uploads).toBe(1);
  await expect(page.getByText('3 of 3')).toBeVisible();
  await page.getByRole('radio', { name: 'Use Casual category' }).click();
  await page.getByRole('button', { name: 'Merge Rust blouse with Favorite linen top' }).click();
  await page.getByRole('checkbox', { name: 'Do not import Black handbag' }).click();
  await expect(page.getByText('2 of 3')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Import Black handbag' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Import Black handbag' }).click();
  await expect(page.getByText('3 of 3')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Use Bags category, selected' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Do not import Black handbag' }).click();
  await expect(page.getByText('2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Save outfit and pieces' }).click();

  await expect(page.getByRole('heading', { name: 'Outfits' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Casual' }).click();
  const outfitCard = page.getByRole('button', {
    name: /Open outfit Rust blouse: A tailored rust linen blouse/,
  });
  await expect(outfitCard).toBeVisible();
  await outfitCard.click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open piece Favorite linen top' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open piece Olive trousers' })).toBeVisible();
  await expect(page.getByText('Black handbag', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open piece Favorite linen top' }).click();
  await expect(page.getByRole('heading', { name: 'Piece details' })).toBeVisible();
  await expect(
    page.getByRole('dialog').getByText('An existing linen top. · A tailored rust linen blouse.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close piece' }).click();

  await page.getByRole('tab', { name: 'Pieces' }).click();
  await page.getByRole('button', { name: 'Expand Bottoms' }).click();
  await expect(page.getByRole('button', { name: 'Open piece Olive trousers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open piece Black handbag' })).toHaveCount(0);
});

test('keeps the crop available and supports retry after network, rate-limit, server, and payload failures', async ({
  page,
}) => {
  let attempt = 0;
  await page.route('**/api/outfits', async (route) => {
    attempt += 1;
    if (attempt === 1) return route.abort('connectionrefused');
    if (attempt === 2)
      return route.fulfill({
        status: 429,
        body: '',
        headers: {
          'retry-after': '45',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'retry-after',
        },
      });
    if (attempt === 3)
      return route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'Service unavailable',
        headers: { 'access-control-allow-origin': '*' },
      });
    if (attempt === 4)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ styledOutfit: 'missing pieces' }),
        headers: { 'access-control-allow-origin': '*' },
      });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(generated),
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await page.goto('/');
  await choosePhoto(page);
  const upload = page.getByRole('button', { name: 'Upload cropped photo' });

  await upload.click();
  await expect(page.getByRole('alert')).toContainText('server is unavailable');
  await expect(upload).toBeEnabled();
  await expect(page.getByLabel('Crop photo')).toBeVisible();

  await upload.click();
  await expect(page.getByRole('alert')).toContainText('Try again in about 45 seconds');
  await expect(upload).toBeEnabled();

  await upload.click();
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await expect(upload).toBeEnabled();

  await upload.click();
  await expect(page.getByRole('alert')).toContainText('invalid outfit response');
  await expect(upload).toBeEnabled();

  await upload.click();
  await expect(page.getByLabel('Generated outfit')).toBeVisible();
  expect(attempt).toBe(5);
});

test('retakes a library photo and accepts the web camera chooser', async ({ page }) => {
  await page.goto('/');
  await choosePhoto(page);
  await page.getByRole('button', { name: 'Choose another photo' }).click();
  await expect(page.getByRole('heading', { name: 'Add a mirror selfie' })).toBeVisible();

  const cameraChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take photo' }).click();
  await (await cameraChooser).setFiles(PHOTO);
  await expect(page.getByLabel('Crop photo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload cropped photo' })).toBeVisible();
});

test('reports a local image save failure and can retry an outfit with no pieces', async ({
  page,
}) => {
  let storageAttempts = 0;
  const zeroPieceResult = {
    styledOutfit: 'https://images.example.invalid/generated-outfit.png',
    pieces: [],
  };
  await page.route('**/api/outfits', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(zeroPieceResult),
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.route('https://images.example.invalid/generated-outfit.png', async (route) => {
    if (route.request().resourceType() === 'fetch') storageAttempts += 1;
    if (route.request().resourceType() === 'fetch' && storageAttempts === 1) {
      return route.fulfill({
        status: 500,
        body: 'failed',
        headers: { 'access-control-allow-origin': '*' },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await page.goto('/');
  await choosePhoto(page);
  await page.getByRole('button', { name: 'Upload cropped photo' }).click();
  await expect(page.getByText('0 of 0')).toBeVisible();
  const save = page.getByRole('button', { name: 'Save outfit and pieces' });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Could not save generated image (500)');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('heading', { name: 'Outfits' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open outfit/ })).toBeVisible();
  expect(storageAttempts).toBe(2);
});

test('shows useful empty states on both library views', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Outfits' }).click();
  await expect(page.getByRole('heading', { name: 'Outfits' })).toBeVisible();
  await expect(page.getByText('No outfits yet')).toBeVisible();
  await expect(
    page.getByText('Create your first outfit from a mirror selfie on the Camera page.'),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Pieces' }).click();
  await expect(page.getByRole('heading', { name: 'Pieces' })).toBeVisible();
  await expect(page.getByText('No pieces yet')).toBeVisible();
  await expect(
    page.getByText('Clothing pieces appear here when you save a generated outfit.'),
  ).toBeVisible();
});

test('persists appearance, grids, and complete outfit and piece category CRUD', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Settings' }).click();

  await page.getByRole('radio', { name: 'Light appearance' }).click();
  await page.getByRole('radio', { name: 'System appearance' }).click();
  await expect(page.getByRole('radio', { name: 'System appearance, selected' })).toBeVisible();
  await page.getByRole('radio', { name: 'Dark appearance' }).click();
  for (const columns of [2, 3, 4])
    await page
      .getByRole('button', {
        name: `Use ${columns} columns for outfits${columns === 2 ? ', selected' : ''}`,
      })
      .click();
  for (const columns of [2, 3, 4])
    await page
      .getByRole('button', {
        name: `Use ${columns} columns for pieces${columns === 2 ? ', selected' : ''}`,
      })
      .click();
  await page.getByRole('button', { name: 'Use 3 columns for pieces' }).click();

  const protectedCategories = page.getByRole('button', { name: 'Edit Uncategorized' });
  await protectedCategories.nth(0).click();
  await expect(page.getByRole('button', { name: 'Delete category' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await protectedCategories.nth(1).click();
  await expect(page.getByRole('button', { name: 'Delete category' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: '＋ Add outfit category' }).click();
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('heading', { name: 'New category' })).toBeVisible();
  await page.getByLabel('New outfit category name').fill('Travel');
  await page.getByRole('button', { name: 'Create category' }).click();
  await page.getByRole('button', { name: 'Edit Travel' }).click();
  await page.getByLabel('Category name for Travel').fill('Journeys');
  await page.getByRole('button', { name: 'Save category' }).click();
  await expect(page.getByRole('button', { name: 'Edit Journeys' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Journeys' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Items in Journeys will move to Uncategorized.',
  );
  await page.getByRole('alert').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Category name for Journeys')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete category' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByRole('button', { name: 'Edit Journeys' })).toHaveCount(0);

  await page.getByRole('button', { name: '＋ Add piece category' }).click();
  await page.getByLabel('New piece category name').fill('Jewelry');
  await page.getByRole('button', { name: 'Create category' }).click();
  await page.getByRole('button', { name: 'Edit Jewelry' }).click();
  await page.getByLabel('Category name for Jewelry').fill('Adornments');
  await page.getByRole('button', { name: 'Save category' }).click();
  await expect(page.getByRole('button', { name: 'Edit Adornments' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Adornments' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete category' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByRole('button', { name: 'Edit Adornments' })).toHaveCount(0);

  await page.reload();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('radio', { name: 'Dark appearance, selected' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use 4 columns for outfits, selected' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use 3 columns for pieces, selected' }),
  ).toBeVisible();
});

test('supports piece edit, same-category merge, cross-navigation, and both deletion confirmations', async ({
  page,
}) => {
  const sharedImage = image('#754b40', 'Saved');
  await seedLibrary(page, {
    outfits: [
      {
        id: 'outfit-one',
        image: sharedImage,
        description: 'Layered weekday look',
        categoryId: 'outfit-work',
        createdAt: '2026-07-29T10:00:00.000Z',
      },
      {
        id: 'outfit-two',
        image: sharedImage,
        description: 'Relaxed weekend look',
        categoryId: 'outfit-casual',
        createdAt: '2026-07-29T11:00:00.000Z',
      },
    ],
    pieces: [
      {
        id: 'current-top',
        outfitIds: ['outfit-one'],
        image: sharedImage,
        label: 'Current top',
        description: 'Current description',
        aiCategory: 'top',
        categoryId: 'piece-tops',
      },
      {
        id: 'other-top',
        outfitIds: ['outfit-two'],
        image: sharedImage,
        label: 'Other top',
        description: 'Other description',
        aiCategory: 'top',
        categoryId: 'piece-tops',
      },
      {
        id: 'bottom',
        outfitIds: ['outfit-one'],
        image: sharedImage,
        label: 'Different-category trousers',
        description: 'Bottom description',
        aiCategory: 'bottom',
        categoryId: 'piece-bottoms',
      },
    ],
    settings: { outfitGridColumns: 3, pieceGridColumns: 4, theme: 'light' },
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Pieces' }).click();
  await page.getByRole('button', { name: 'Expand Tops' }).click();
  await page.getByRole('button', { name: 'Open piece Current top' }).click();

  await page.getByRole('button', { name: 'Edit piece' }).click();
  await page.getByLabel('Piece title').fill('');
  await expect(page.getByRole('button', { name: 'Save piece' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel edit' }).click();
  await expect(page.getByRole('dialog').getByText('Current top', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Merge piece' }).click();
  await expect(page.getByRole('button', { name: 'Confirm merge' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Select Other top' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Select Different-category trousers' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Cancel merge' }).click();

  await page.getByRole('button', { name: 'Merge piece' }).click();
  await page.getByRole('radio', { name: 'Select Other top' }).click();
  await page.getByRole('radio', { name: 'Keep data from current piece' }).click();
  await page.getByRole('button', { name: 'Confirm merge' }).click();
  await expect(page.getByRole('dialog').getByText('Current top', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open outfit Layered weekday look' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open outfit Relaxed weekend look' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Open outfit Relaxed weekend look' }).click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close outfit' }).click();

  await page.getByRole('tab', { name: 'Pieces' }).click();
  await page.getByRole('button', { name: 'Open piece Current top' }).click();
  await page.getByRole('button', { name: 'Delete piece' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Piece details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close piece' }).click();

  await page.getByRole('tab', { name: 'Outfits' }).click();
  await page.getByRole('button', { name: 'Expand Work' }).click();
  await page.getByRole('button', { name: 'Open outfit Layered weekday look' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete outfit' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Outfit details' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete outfit' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Delete outfit' }).click();
  await expect(page.getByRole('button', { name: 'Open outfit Layered weekday look' })).toHaveCount(
    0,
  );
});
