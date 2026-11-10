const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');

test.describe('Playwright UI: Dashboard Navigation & Sidebar Collapse', () => {
  let loginPage;
  let dashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
    await loginPage.login('admin@demo.college.edu', 'Admin@123');
    await page.waitForURL((url) => !url.pathname.includes('/login'));
  });

  test('renders sidebar navigation with brand header and role badge', async () => {
    await expect(dashboardPage.sidebarNav).toBeVisible();
    await expect(dashboardPage.sidebar).toContainText('Hostel ERP');
  });

  test('collapses sidebar to icon rail on toggle button click and restores on second click', async ({ page }) => {
    await expect(dashboardPage.toggleButton).toBeVisible();

    // Check initial expanded state (w-64)
    await expect(dashboardPage.sidebar).toHaveClass(/w-64/);

    // Click collapse toggle button
    await dashboardPage.toggleSidebar();

    // Should now be collapsed (w-[72px])
    await expect(dashboardPage.sidebar).toHaveClass(/w-\[72px\]/);

    // Click again to expand
    await dashboardPage.toggleSidebar();
    await expect(dashboardPage.sidebar).toHaveClass(/w-64/);
  });

  test('toggles sidebar collapse state via Ctrl+B shortcut', async ({ page }) => {
    await expect(dashboardPage.sidebar).toHaveClass(/w-64/);

    // Press Ctrl+B
    await page.keyboard.press('Control+b');
    await expect(dashboardPage.sidebar).toHaveClass(/w-\[72px\]/);

    // Press Ctrl+B again
    await page.keyboard.press('Control+b');
    await expect(dashboardPage.sidebar).toHaveClass(/w-64/);
  });
});

