/**
 * Dashboard Controller
 * Delivers real database statistics for executive, doctor, and front-office dashboards.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { dashboardService } from '../services/dashboard.service';

export class DashboardController {
  public async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await dashboardService.getStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err: any) {
      console.error('[DashboardController] Error aggregating dashboard stats:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'Failed to aggregate dashboard metrics from database',
      });
    }
  }

  public async getRoleDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data = await dashboardService.getRoleDashboardData(req.user);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err: any) {
      console.error('[DashboardController] Error aggregating role dashboard:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'Failed to aggregate role dashboard data',
      });
    }
  }
}

export const dashboardController = new DashboardController();
