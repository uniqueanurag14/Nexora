/**
 * Database-Driven Navigation Menu Repository
 * Reads menu items from PostgreSQL, enforces permission filters, and builds tree hierarchy.
 */

import { dbAdapter } from '../db/adapter';

export interface MenuItemDb {
  id: string;
  parentId: string | null;
  label: string;
  route: string;
  icon: string;
  badge: string | null;
  displayOrder: number;
  requiredPermission: string | null;
  moduleCode: string;
  isImplemented: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface MenuItemNode extends MenuItemDb {
  children?: MenuItemNode[];
}

export class MenuRepository {
  public async getAllRawMenuItems(): Promise<MenuItemDb[]> {
    const sql = `
      SELECT 
        id, parent_id as "parentId", label, route, icon, badge,
        display_order as "displayOrder", required_permission as "requiredPermission",
        module_code as "moduleCode", is_implemented as "isImplemented",
        is_active as "isActive", created_at as "createdAt"
      FROM menu_items
      WHERE is_active = TRUE
      ORDER BY display_order ASC;
    `;
    const res = await dbAdapter.query<MenuItemDb>(sql);
    return res.rows;
  }

  public async getAuthorizedMenuTree(
    effectivePermissions: string[] = [],
    isSuperAdmin: boolean = false
  ): Promise<MenuItemNode[]> {
    const rawItems = await this.getAllRawMenuItems();
    const permSet = new Set(effectivePermissions.map((p) => p.toLowerCase()));
    const hasFullAccess = isSuperAdmin || permSet.has('all');

    // Filter check helper
    const isAuthorized = (item: MenuItemDb): boolean => {
      if (hasFullAccess) return true;
      if (!item.requiredPermission) return true;
      const req = item.requiredPermission.toLowerCase();
      if (permSet.has(req)) return true;
      // Also match prefix wildcard (e.g. inventory.* matches inventory.view)
      const prefix = req.split('.')[0];
      if (permSet.has(`${prefix}.*`) || permSet.has(`${prefix}.all`)) return true;
      return false;
    };

    // Separate parents and children
    const roots: MenuItemNode[] = [];
    const childrenMap = new Map<string, MenuItemNode[]>();

    for (const item of rawItems) {
      if (!item.parentId) {
        roots.push({ ...item, children: [] });
      } else {
        const list = childrenMap.get(item.parentId) || [];
        list.push({ ...item, children: [] });
        childrenMap.set(item.parentId, list);
      }
    }

    // Attach children and filter
    const result: MenuItemNode[] = [];

    for (const root of roots) {
      const children = (childrenMap.get(root.id) || []).filter(isAuthorized);
      const rootAuthorized = isAuthorized(root);

      if (children.length > 0) {
        // If has authorized children, parent must be included
        result.push({
          ...root,
          children,
        });
      } else if (rootAuthorized && !childrenMap.has(root.id)) {
        // Root leaf item with no children defined
        result.push({
          ...root,
          children: [],
        });
      }
    }

    return result;
  }
}

export const menuRepository = new MenuRepository();
