class DashboardPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.sidebar = page.locator('aside').first();
    this.sidebarNav = page.locator('nav[aria-label="Main Navigation"]');
    this.toggleButton = page.locator('header button[aria-label*="sidebar (Ctrl+B)"]');
    this.userMenuButton = page.locator('button[aria-haspopup="menu"]');
    this.signOutButton = page.locator('button[role="menuitem"]:has-text("Sign out")');
    this.mobileMenuButton = page.locator('button[aria-label="Open menu"]');
  }

  async toggleSidebar() {
    await this.toggleButton.click();
  }

  async logout() {
    await this.userMenuButton.click();
    await this.signOutButton.click();
  }
}

module.exports = { DashboardPage };

