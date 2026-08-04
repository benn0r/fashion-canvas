import { expect, test } from '@playwright/test';

test('registers, logs in, restores the session, and logs out', async ({ page }) => {
  await page.route('**/api/auth/register', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      username: 'new_user',
      password: 'long-enough-password',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ username: 'new_user', approved: false }),
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'authenticated-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { username: 'new_user', approved: true },
      }),
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('button', { name: 'New here? Register' }).click();
  await page.getByLabel('Username').fill('new_user');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText(/must be approved/)).toBeVisible();
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Add a mirror selfie' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add a mirror selfie' })).toBeVisible();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByText('new_user')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('shows authentication errors without opening the app', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Invalid username or password.' }),
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Username').fill('unknown');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
