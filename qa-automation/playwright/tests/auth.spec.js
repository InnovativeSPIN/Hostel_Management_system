const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');

test.describe('Playwright UI: Authentication & Session Flow', () => {
  let loginPage;
  let dashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
  });

  test('renders login page with email, password fields and sign in button', async ({ page }) => {
    await expect(page).toHaveTitle(/Hostel|Sign in/i);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('displays error message when submitting invalid credentials', async () => {
    await loginPage.login('unknown.user@demo.college.edu', 'WrongPass999!');
    await expect(loginPage.errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('successful admin login navigates to dashboard and user can sign out', async ({ page }) => {
    await loginPage.login('admin@demo.college.edu', 'Admin@123');

    // Should redirect away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'));
    await expect(dashboardPage.sidebarNav).toBeVisible();

    // Verify user profile pill
    await expect(dashboardPage.userMenuButton).toBeVisible();

    // Sign out
    await dashboardPage.logout();
    await page.waitForURL('**/login');
    await expect(loginPage.emailInput).toBeVisible();
  });
});
