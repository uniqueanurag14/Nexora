/**
 * Navigation Controller
 * Returns database-driven menu tree filtered by the requesting user's RBAC permissions.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { navigationService } from '../services/navigation.service';

export class NavigationController {
  public async getMenu(req: AuthenticatedRequest, res: Response) {
    try {
      const isSuperAdmin = Boolean(req.user?.isSuperAdmin || req.user?.role === 'SUPER_ADMIN');
      const userPermissions = (req.user as any)?.permissions || [];

      const menuTree = await navigationService.getNavigationMenu(userPermissions, isSuperAdmin);

      return res.json({
        success: true,
        data: menuTree,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to retrieve navigation menu',
      });
    }
  }
}

export const navigationController = new NavigationController();
