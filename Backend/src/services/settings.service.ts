/**
 * Settings Service
 * Consolidated service managing system configuration, environment status, general settings, and backups.
 */

import { settingsRepository, GeneralSettingsRecord, DatabaseBackupRecord } from '../repositories/settings.repository';
import { dbAdapter } from '../db/adapter';
import { getSystemDataConfig } from '../config/database.config';
import { auditRepository } from '../repositories/audit.repository';

export class SettingsService {
  /**
   * Retrieves all technical system settings and database engine status (backwards-compatible)
   */
  public async getAllSettings(): Promise<Record<string, any>> {
    const dbSettings = await settingsRepository.getGeneralSettings();
    const dataConfig = await this.getDataConfiguration();
    return {
      ...dbSettings,
      dataConfiguration: dataConfig,
      databaseEngine: dbAdapter.getEngine(),
      databaseConnected: dbAdapter.isHealthy(),
      databaseConfig: dbAdapter.getConfig(),
    };
  }

  /**
   * Retrieves data configuration strictly adhering to environment capabilities
   */
  public async getDataConfiguration() {
    const envConfig = getSystemDataConfig();
    return {
      currentDatabase: envConfig.currentDatabase,
      enableDemoData: envConfig.enableDemoData,
      enableDummyData: envConfig.enableDummyData,
      demoDataStatus: envConfig.enableDemoData ? 'Enabled' : 'Disabled',
      dummyDataStatus: envConfig.enableDummyData ? 'Enabled' : 'Disabled',
      runtimeDemoData: false,
      runtimeDummyData: false,
      canToggleDemo: envConfig.enableDemoData,
      canToggleDummy: envConfig.enableDummyData,
      demoDisabledReason: !envConfig.enableDemoData
        ? 'System configuration (.env ENABLE_DEMO_DATA=false) prevents enabling demo data'
        : null,
      dummyDisabledReason: !envConfig.enableDummyData
        ? 'System configuration (.env ENABLE_DUMMY_DATA=false) prevents enabling dummy data'
        : null,
    };
  }

  /**
   * Updates runtime demo / dummy setting ONLY if allowed by environment
   */
  public async updateDataConfiguration(updates: { runtimeDemoData?: boolean; runtimeDummyData?: boolean }) {
    const envConfig = getSystemDataConfig();
    if (updates.runtimeDemoData && !envConfig.enableDemoData) {
      throw new Error('System configuration prevents enabling demo data. ENABLE_DEMO_DATA is set to false in the environment.');
    }
    if (updates.runtimeDummyData && !envConfig.enableDummyData) {
      throw new Error('System configuration prevents enabling dummy data. ENABLE_DUMMY_DATA is set to false in the environment.');
    }
    if (updates.runtimeDemoData !== undefined) {
      await settingsRepository.setSetting('system', 'runtime_demo_data', updates.runtimeDemoData);
    }
    if (updates.runtimeDummyData !== undefined) {
      await settingsRepository.setSetting('system', 'runtime_dummy_data', updates.runtimeDummyData);
    }
    return this.getDataConfiguration();
  }

  /**
   * Module 4: General Settings
   */
  public async getGeneralSettings(): Promise<GeneralSettingsRecord> {
    return settingsRepository.getGeneralSettings();
  }

  public async updateGeneralSettings(
    data: Partial<GeneralSettingsRecord>,
    userId?: string,
    userEmail?: string,
    userName?: string,
    userRole?: string
  ): Promise<GeneralSettingsRecord> {
    const updated = await settingsRepository.updateGeneralSettings(data);

    try {
      await auditRepository.create({
        organizationId: 'org-01',
        userId: userId || 'usr-admin-01',
        userEmail: userEmail || 'admin@mediera.com',
        userName: userName || 'System Administrator',
        role: userRole || 'SUPER_ADMIN',
        action: 'SETTINGS_UPDATED',
        module: 'Settings',
        entityId: updated.id,
        entityType: 'SystemSettings',
        details: `Updated general settings (Name: ${updated.clinicName}, Timezone: ${updated.timezone}, Locale: ${updated.locale})`,
      });
    } catch {}

    return updated;
  }

  /**
   * Module 4: Database Backups
   */
  public async getDatabaseBackups(): Promise<DatabaseBackupRecord[]> {
    return settingsRepository.getDatabaseBackups();
  }

  public async createDatabaseBackup(
    adminId?: string,
    adminName: string = 'System Administrator',
    adminEmail?: string,
    notes?: string
  ): Promise<DatabaseBackupRecord> {
    const backup = await settingsRepository.createDatabaseBackup(adminId, adminName, notes);

    try {
      await auditRepository.create({
        organizationId: 'org-01',
        userId: adminId || 'usr-admin-01',
        userEmail: adminEmail || 'admin@mediera.com',
        userName: adminName,
        role: 'SUPER_ADMIN',
        action: 'DATABASE_BACKUP_CREATED',
        module: 'Database',
        entityId: backup.id,
        entityType: 'DatabaseBackup',
        details: `Created database snapshot: ${backup.filename} (${backup.tableCount} tables, ~${Math.round(backup.sizeBytes / 1024)} KB)`,
      });
    } catch {}

    return backup;
  }

  public async deleteDatabaseBackup(
    backupId: string,
    adminId?: string,
    adminName: string = 'System Administrator',
    adminEmail?: string
  ): Promise<boolean> {
    const success = await settingsRepository.deleteDatabaseBackup(backupId);
    if (success) {
      try {
        await auditRepository.create({
          organizationId: 'org-01',
          userId: adminId || 'usr-admin-01',
          userEmail: adminEmail || 'admin@mediera.com',
          userName: adminName,
          role: 'SUPER_ADMIN',
          action: 'DATABASE_BACKUP_DELETED',
          module: 'Database',
          entityId: backupId,
          entityType: 'DatabaseBackup',
          details: `Archived/purged database backup snapshot ID: ${backupId}`,
        });
      } catch {}
    }
    return success;
  }
}

export const settingsService = new SettingsService();
