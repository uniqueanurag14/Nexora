/**
 * Settings Controller
 * Handles general application settings, technical data configurations, and database backups.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { settingsService } from '../services/settings.service';
import { validateGeneralSettingsDto } from '../dtos/module4.dto';

export class SettingsController {
  /**
   * GET /api/settings or /api/v1/settings
   * Returns real system settings and database engine status
   */
  public async getAllSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const settings = await settingsService.getAllSettings();
      return res.json({
        success: true,
        data: settings,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to fetch system settings: ${err.message}`,
      });
    }
  }

  /**
   * GET /api/v1/settings/general
   */
  public async getGeneralSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const settings = await settingsService.getGeneralSettings();
      return res.json({
        success: true,
        data: settings,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to fetch general settings: ${err.message}`,
      });
    }
  }

  /**
   * PUT /api/v1/settings/general
   */
  public async updateGeneralSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const validation = validateGeneralSettingsDto(req.body);
      if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0];
        return res.status(400).json({
          success: false,
          error: firstError,
          errors: validation.errors,
        });
      }

      const updated = await settingsService.updateGeneralSettings(
        req.body,
        req.user?.id,
        req.user?.email,
        req.user?.name,
        req.user?.role
      );

      return res.json({
        success: true,
        message: 'General settings updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to update general settings: ${err.message}`,
      });
    }
  }

  /**
   * GET /api/v1/settings/backups
   */
  public async getDatabaseBackups(req: AuthenticatedRequest, res: Response) {
    try {
      const backups = await settingsService.getDatabaseBackups();
      return res.json({
        success: true,
        data: backups,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to fetch database backups: ${err.message}`,
      });
    }
  }

  /**
   * POST /api/v1/settings/backups
   */
  public async createDatabaseBackup(req: AuthenticatedRequest, res: Response) {
    try {
      const { notes } = req.body || {};
      const backup = await settingsService.createDatabaseBackup(
        req.user?.id,
        req.user?.name || 'System Administrator',
        req.user?.email,
        notes
      );

      return res.status(201).json({
        success: true,
        message: 'Database backup snapshot completed successfully.',
        data: backup,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to create database backup: ${err.message}`,
      });
    }
  }

  /**
   * DELETE /api/v1/settings/backups/:id
   */
  public async deleteDatabaseBackup(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Backup ID is required.' });
      }

      const success = await settingsService.deleteDatabaseBackup(
        id,
        req.user?.id,
        req.user?.name || 'System Administrator',
        req.user?.email
      );

      if (!success) {
        return res.status(404).json({ success: false, error: 'Backup record not found.' });
      }

      return res.json({
        success: true,
        message: 'Database backup record deleted successfully.',
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to delete database backup: ${err.message}`,
      });
    }
  }

  /**
   * GET /api/settings/data-config
   */
  public async getDataConfiguration(req: AuthenticatedRequest, res: Response) {
    try {
      const config = await settingsService.getDataConfiguration();
      return res.json({
        success: true,
        data: config,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * POST /api/settings/data-config
   */
  public async updateDataConfiguration(req: AuthenticatedRequest, res: Response) {
    try {
      const { runtimeDemoData, runtimeDummyData } = req.body;
      const config = await settingsService.updateDataConfiguration({
        runtimeDemoData: typeof runtimeDemoData === 'boolean' ? runtimeDemoData : undefined,
        runtimeDummyData: typeof runtimeDummyData === 'boolean' ? runtimeDummyData : undefined,
      });
      return res.json({
        success: true,
        message: 'Data configuration updated successfully.',
        data: config,
      });
    } catch (err: any) {
      return res.status(403).json({
        success: false,
        error: err.message,
      });
    }
  }
}

export const settingsController = new SettingsController();
