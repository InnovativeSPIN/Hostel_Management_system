const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');

test.describe('Playwright UI: Responsive Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone / standard mobile resolution

  test('handles mobile drawer navigation smoothly', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login('admin@demo.college.edu', 'Admin@123');
    await page.waitForURL((url) => !url.pathname.includes('/login'));

    // Desktop sidebar should be hidden
    await expect(dashboardPage.sidebar).toBeHidden();

    // Mobile menu toggle button must be visible
    await expect(dashboardPage.mobileMenuButton).toBeVisible();

    // Click mobile menu button
    await dashboardPage.mobileMenuButton.click();

    // Mobile drawer navigation should now be visible
    const mobileDrawer = page.locator('div.fixed.inset-0.z-40 aside');
    await expect(mobileDrawer).toBeVisible();
    await expect(mobileDrawer).toContainText('Hostel ERP');

    // Click backdrop overlay to close
    const backdrop = page.locator('div.fixed.inset-0.z-40 div.absolute.inset-0');
    await backdrop.click({ position: { x: 350, y: 100 } });

    // Drawer should close
    await expect(mobileDrawer).toBeHidden();
  });
});

