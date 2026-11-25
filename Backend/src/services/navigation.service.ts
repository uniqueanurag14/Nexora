/**
 * Navigation Service
 * Dynamically evaluates database-driven navigation hierarchy based on RBAC permissions.
 */

import { menuRepository, MenuItemNode } from '../repositories/menu.repository';

export class NavigationService {
  public async getNavigationMenu(
    effectivePermissions: string[] = [],
    isSuperAdmin: boolean = false
  ): Promise<MenuItemNode[]> {
    return menuRepository.getAuthorizedMenuTree(effectivePermissions, isSuperAdmin);
  }
}

export const navigationService = new NavigationService();
