/**
 * Emails Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EmailsService, SendEmailRequest } from './emails.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailDirection, EmailStatus, EmailType } from './entities/email-log.entity';

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Get()
  findAll(
    @Query('leadId') leadId?: string,
    @Query('direction') direction?: EmailDirection,
    @Query('status') status?: EmailStatus,
    @Query('type') type?: EmailType,
  ) {
    return this.emailsService.findAll({ leadId, direction, status, type });
  }

  @Get('statistics')
  getStatistics() {
    return this.emailsService.getStatistics();
  }

  @Get('pending-approvals')
  getPendingApprovals() {
    return this.emailsService.getPendingApprovals();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailsService.findOne(id);
  }

  @Post()
  send(@Body() request: SendEmailRequest) {
    return this.emailsService.sendEmail(request);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('approvedBy', ParseUUIDPipe) approvedBy: string,
  ) {
    return this.emailsService.approveEmail(id, approvedBy);
  }

  @Post('template')
  sendTemplate(
    @Body('to') to: string,
    @Body('templateName') templateName: string,
    @Body('variables') variables: Record<string, string>,
    @Body('leadId') leadId?: string,
  ) {
    return this.emailsService.sendTemplateEmail(to, templateName, variables, leadId);
  }
}
