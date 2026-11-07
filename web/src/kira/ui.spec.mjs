import { test, expect } from '@playwright/test';

const emptyStatus = {
  step: 1, next: { say: 'Add files to POS, Settlement, Mutation.' },
  files: { pos: 0, settlement: 0, bank: 0 }, converted: false,
  cleaning: { open: 0, rules_version: null },
  matching: { l1: { done: false, rules: 0 }, l2: { done: false, rules: 0 } },
};

async function workspace(page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/me' ? { user: 'Taufiq', auth: true }
      : path === '/api/clients' ? [{ id: '', name: 'Zestly' }]
      : path === '/api/status' ? emptyStatus : [];
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.getByLabel('Ask Kira', { exact: true })).toBeEnabled();
}

test('all suggestions are readable and the panel has one close action', async ({ page }) => {
  await workspace(page);
  const suggestions = page.getByRole('group', { name: 'Suggested questions' });
  await expect(suggestions.getByRole('button')).toHaveCount(4);
  for (const button of await suggestions.getByRole('button').all()) {
    await expect(button).toBeInViewport();
    expect(await button.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Close Kira', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Close Kira', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ask Kira', exact: true })).toBeFocused();
});

test('approval shows the complete note and approves or rejects without replaying changes', async ({ page }) => {
  await workspace(page);
  const note = 'SHOPEEPAY payout for Harbor Square: 142 settlements, Rp 9.031.421, not in the bank. Ask for the payout status and check the next statement.';
  await page.route('**/api/agent/chat', route => route.fulfill({ json: {
    reply: 'Review the note before saving.', tool_calls: [],
    pending: [{ id: 'approval-1', tool: 'save_follow_ups', args: {
      keys: ['sale-1', 'sale-2'], status: 'investigating', assignee: 'Andrew', note,
    } }],
  } }));
  let refreshes = 0;
  await page.route('**/api/status', route => { refreshes++; return route.fulfill({ json: emptyStatus }); });
  let confirmed;
  await page.route('**/api/agent/confirm', route => {
    confirmed = route.request().postDataJSON().answers;
    const approved = confirmed['approval-1'];
    return route.fulfill({ json: { reply: approved ? 'Saved the note.' : 'Nothing changed.', pending: [],
      tool_calls: approved ? [{ tool: 'save_follow_ups', args: {}, result: { status: 'ok', result: { saved: 2 } } }] : [],
    } });
  });
  const ask = async () => {
    await page.getByLabel('Ask Kira', { exact: true }).fill('Draft the follow-up');
    await page.getByRole('button', { name: 'Send message' }).click();
  };
  await ask();
  const approval = page.getByRole('region', { name: 'Changes awaiting approval' });
  await expect(approval.getByRole('heading', { name: 'Review changes' })).toBeInViewport();
  await expect(approval.getByText('Assignee', { exact: true })).toBeVisible();
  await expect(approval.getByText('Andrew', { exact: true })).toBeVisible();
  await expect(approval.getByText(note, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve all', exact: true }).click();
  await expect(page.getByText('Saved the note.', { exact: true })).toBeVisible();
  expect(confirmed).toEqual({ 'approval-1': true });
  await expect.poll(() => refreshes).toBe(1);
  await ask();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Nothing changed.', { exact: true })).toBeVisible();
  expect(confirmed).toEqual({ 'approval-1': false });
  expect(refreshes).toBe(1);
});

test('mobile keeps controls on screen and sign-in errors stay near the form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 401, json: { detail: 'Incorrect username or password' } });
    return route.fulfill({ json: { user: null, auth: true } });
  });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('Taufiq');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect username or password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.unroute('**/api/**');
  await workspace(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Ask Kira', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeInViewport();
});
