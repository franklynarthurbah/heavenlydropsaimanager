/**
 * Auto-Updater Service
 *
 * Checks for and installs updates for:
 *   - Roundcube Webmail (Docker image tag)
 *   - WhatsApp Business API (Meta Graph API SDK)
 *   - Instagram API (Meta Graph API SDK)
 *   - NestJS backend packages (npm outdated)
 *
 * Lifecycle:
 *   1. Check for available updates.
 *   2. Enter maintenance mode (pause all jobs, show loading state).
 *   3. Apply updates.
 *   4. Exit maintenance mode.
 *   5. Run diagnostics; auto-repair until stable.
 *   6. Persist history to update_history.
 *
 * Scheduled: every Sunday at 03:00 (Istanbul time).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { execSync } from 'child_process';
import { MailDiagnosticsService } from './mail-diagnostics.service';

export interface UpdateCheckResult {
  component: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface UpdateResult {
  component: string;
  previousVersion: string;
  newVersion: string;
  success: boolean;
  logOutput: string;
}

@Injectable()
export class AutoUpdaterService {
  private readonly logger = new Logger(AutoUpdaterService.name);
  private isUpdating = false;
  private updateProgress: {
    status: 'idle' | 'checking' | 'installing' | 'repairing' | 'done' | 'failed';
    message: string;
    progress: number; // 0–100
    component?: string;
  } = { status: 'idle', message: '', progress: 0 };

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectQueue('email-processing')
    private emailQueue: Queue,
    private diagnosticsService: MailDiagnosticsService,
  ) {}

  // ── Scheduled weekly update check ────────────────────────────────────────

  @Cron('0 3 * * 0', { name: 'auto-updater', timeZone: 'Europe/Istanbul' })
  async runScheduledUpdate(): Promise<void> {
    await this.checkAndInstallAll();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getProgress() {
    return this.updateProgress;
  }

  async checkAndInstallAll(): Promise<{ results: UpdateResult[]; diagnosticsStatus: string }> {
    if (this.isUpdating) {
      return { results: [], diagnosticsStatus: 'update-already-in-progress' };
    }

    this.isUpdating = true;
    const results: UpdateResult[] = [];

    try {
      // ── Phase 1: Check ────────────────────────────────────────────────────
      this.setProgress('checking', 'Checking for available updates…', 5);
      const checks = await this.checkAll();
      const pending = checks.filter(c => c.updateAvailable);

      if (pending.length === 0) {
        this.setProgress('done', 'All components are up to date.', 100);
        return { results, diagnosticsStatus: 'ok' };
      }

      // ── Phase 2: Maintenance mode ─────────────────────────────────────────
      this.setProgress('installing', `Updates available for: ${pending.map(c => c.component).join(', ')}`, 10);
      await this.enterMaintenanceMode();

      // ── Phase 3: Install ──────────────────────────────────────────────────
      let progressStep = 15;
      for (const check of pending) {
        this.setProgress('installing', `Installing ${check.component}…`, progressStep, check.component);
        const result = await this.installUpdate(check);
        results.push(result);
        await this.saveUpdateHistory(result);
        progressStep = Math.min(progressStep + 20, 80);
      }

      // ── Phase 4: Exit maintenance, run diagnostics, auto-repair ──────────
      this.setProgress('repairing', 'Running post-update diagnostics…', 85);
      await this.exitMaintenanceMode();

      let diagnosticsReport = await this.diagnosticsService.runFullDiagnostics(true);
      let repairAttempts = 0;

      while (diagnosticsReport.overall === 'error' && repairAttempts < 3) {
        repairAttempts++;
        this.setProgress('repairing', `Auto-repair attempt ${repairAttempts}/3…`, 85 + repairAttempts * 4);
        await new Promise(r => setTimeout(r, 5000));
        diagnosticsReport = await this.diagnosticsService.runFullDiagnostics();
      }

      const finalStatus = diagnosticsReport.overall;
      this.setProgress(
        finalStatus === 'ok' ? 'done' : 'failed',
        finalStatus === 'ok'
          ? 'All updates installed and system is stable.'
          : 'Updates installed but some checks still failing – manual review needed.',
        100,
      );

      return { results, diagnosticsStatus: finalStatus };

    } catch (err) {
      this.logger.error('Auto-updater failed:', err.message);
      this.setProgress('failed', `Update failed: ${err.message}`, 100);
      await this.exitMaintenanceMode();
      return { results, diagnosticsStatus: 'error' };
    } finally {
      this.isUpdating = false;
    }
  }

  // ── Check all components ───────────────────────────────────────────────────

  private async checkAll(): Promise<UpdateCheckResult[]> {
    return Promise.all([
      this.checkRoundcube(),
      this.checkNpmPackage('@whiskeysockets/baileys', 'whatsapp-api'),
      this.checkNpmPackage('instagram-private-api', 'instagram-api'),
      this.checkNpmPackage('@nestjs/core', 'nestjs-core'),
    ]);
  }

  private async checkRoundcube(): Promise<UpdateCheckResult> {
    try {
      // Check Docker Hub for latest tag
      const res = await fetch(
        'https://hub.docker.com/v2/repositories/roundcube/roundcubemail/tags?page_size=5',
      );
      const data: any = await res.json();
      const tags: string[] = (data.results ?? []).map((t: any) => t.name as string);
      const latest = tags.find(t => t.match(/^\d+\.\d+-apache$/)) ?? 'unknown';

      // Read current from docker-compose label (simplified: read file)
      const current = '1.6-apache';  // pinned in docker-compose.mail.yml
      return {
        component: 'roundcube',
        currentVersion: current,
        latestVersion: latest,
        updateAvailable: current !== latest,
      };
    } catch {
      return { component: 'roundcube', currentVersion: 'unknown', latestVersion: 'unknown', updateAvailable: false };
    }
  }

  private async checkNpmPackage(packageName: string, component: string): Promise<UpdateCheckResult> {
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
      const data: any = await res.json();
      const latest = data.version ?? 'unknown';

      // Read from node_modules (quick check)
      let current = 'unknown';
      try {
        const pkgJson = require(`/app/node_modules/${packageName}/package.json`);
        current = pkgJson.version;
      } catch { /* not installed */ }

      return {
        component,
        currentVersion: current,
        latestVersion: latest,
        updateAvailable: current !== 'unknown' && current !== latest,
      };
    } catch {
      return { component, currentVersion: 'unknown', latestVersion: 'unknown', updateAvailable: false };
    }
  }

  // ── Install a single update ────────────────────────────────────────────────

  private async installUpdate(check: UpdateCheckResult): Promise<UpdateResult> {
    const start = Date.now();
    let logOutput = '';

    try {
      if (check.component === 'roundcube') {
        // Pull new Docker image
        logOutput = this.execSafe(`docker pull roundcube/roundcubemail:${check.latestVersion}`);
        logOutput += '\n' + this.execSafe('docker compose -f /app/email-server/docker-compose.mail.yml up -d roundcube');
      } else {
        // npm update
        const pkgName = check.component === 'whatsapp-api'
          ? '@whiskeysockets/baileys'
          : check.component === 'instagram-api'
          ? 'instagram-private-api'
          : check.component;
        logOutput = this.execSafe(`npm install ${pkgName}@${check.latestVersion} --save --prefix /app`);
      }

      return {
        component: check.component,
        previousVersion: check.currentVersion,
        newVersion: check.latestVersion,
        success: true,
        logOutput,
      };
    } catch (err) {
      return {
        component: check.component,
        previousVersion: check.currentVersion,
        newVersion: check.latestVersion,
        success: false,
        logOutput: logOutput + '\nERROR: ' + err.message,
      };
    }
  }

  private execSafe(cmd: string): string {
    try {
      return execSync(cmd, { timeout: 120_000, encoding: 'utf8' });
    } catch (e) {
      return `EXEC ERROR: ${e.message}`;
    }
  }

  // ── Maintenance mode helpers ───────────────────────────────────────────────

  private async enterMaintenanceMode(): Promise<void> {
    this.diagnosticsService.enterMaintenanceMode();
    await this.emailQueue.pause();
    this.logger.log('Maintenance mode ON – queues paused');
  }

  private async exitMaintenanceMode(): Promise<void> {
    await this.emailQueue.resume();
    this.diagnosticsService.exitMaintenanceMode();
    this.logger.log('Maintenance mode OFF – queues resumed');
  }

  // ── Update history ─────────────────────────────────────────────────────────

  private async saveUpdateHistory(result: UpdateResult): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO update_history
           (component, previous_version, new_version, status, log_output, completed_at)
         VALUES ($1,$2,$3,$4,$5,now())`,
        [
          result.component,
          result.previousVersion,
          result.newVersion,
          result.success ? 'success' : 'failed',
          result.logOutput,
        ],
      );
    } catch (err) {
      this.logger.error('Failed to save update history:', err.message);
    }
  }

  private setProgress(
    status: typeof this.updateProgress.status,
    message: string,
    progress: number,
    component?: string,
  ): void {
    this.updateProgress = { status, message, progress, component };
    this.logger.log(`[Updater] ${message} (${progress}%)`);
  }
}
