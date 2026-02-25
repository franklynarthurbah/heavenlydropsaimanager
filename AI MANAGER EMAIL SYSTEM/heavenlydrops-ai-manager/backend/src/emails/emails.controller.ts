/**
 * Emails Controller (v2)
 * Heavenly Drops – Full Mail Server Integration
 *
 * GET  /emails                  – list emails
 * GET  /emails/stats            – statistics
 * GET  /emails/pending-approvals
 * GET  /emails/diagnostics      – latest mail-server health
 * POST /emails/diagnostics/run  – trigger immediate diagnostic run
 * GET  /emails/updater/status
 * POST /emails/updater/run      – trigger manual update check
 * GET  /emails/dashboard        – aggregated dashboard data
 * POST /emails/:id/approve
 * GET  /emails/:id
 * POST /emails/send
 * POST /emails/detect-batch     – batch AI detection
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailsService, SendEmailRequest } from './emails.service';
import { MailDiagnosticsService } from './mail-diagnostics.service';
import { AutoUpdaterService } from './auto-updater.service';
import { AiDetectorService } from './ai-detector.service';
import { EmailDirection, EmailStatus, EmailType } from './entities/email-log.entity';

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly diagnosticsService: MailDiagnosticsService,
    private readonly updaterService: AutoUpdaterService,
    private readonly aiDetectorService: AiDetectorService,
  ) {}

  @Get()
  findAll(
    @Query('leadId') leadId?: string,
    @Query('direction') direction?: EmailDirection,
    @Query('status') status?: EmailStatus,
    @Query('type') type?: EmailType,
  ) {
    return this.emailsService.findAll({ leadId, direction, status, type });
  }

  @Get('stats')
  getStats() {
    return this.emailsService.getStatistics();
  }

  @Get('pending-approvals')
  getPendingApprovals() {
    return this.emailsService.getPendingApprovals();
  }

  @Get('dashboard')
  async getDashboard() {
    const [stats, diagnostics, updaterStatus] = await Promise.all([
      this.emailsService.getStatistics(),
      this.diagnosticsService.getLatestSummary(),
      Promise.resolve(this.updaterService.getProgress()),
    ]);
    return { emailStats: stats, mailServerHealth: diagnostics, updaterStatus, timestamp: new Date().toISOString() };
  }

  @Get('diagnostics')
  getDiagnostics() {
    return this.diagnosticsService.getLatestSummary();
  }

  @Post('diagnostics/run')
  @HttpCode(HttpStatus.OK)
  runDiagnostics(@Body() body: { beforeAfter?: boolean }) {
    return this.diagnosticsService.runFullDiagnostics(body?.beforeAfter ?? false);
  }

  @Get('updater/status')
  getUpdaterStatus() {
    return this.updaterService.getProgress();
  }

  @Post('updater/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runUpdater() {
    this.updaterService.checkAndInstallAll();
    return { message: 'Update check started', status: 'accepted' };
  }

  @Post('detect-batch')
  @HttpCode(HttpStatus.OK)
  detectBatch(@Body() body: { limit?: number }) {
    return this.aiDetectorService.batchDetect(body?.limit ?? 50);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailsService.findOne(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveEmail(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.emailsService.approveEmail(id, req.user?.email ?? 'unknown');
  }

  @Post('send')
  @HttpCode(HttpStatus.CREATED)
  sendEmail(@Body() dto: SendEmailRequest) {
    return this.emailsService.sendEmail(dto);
  }
}
