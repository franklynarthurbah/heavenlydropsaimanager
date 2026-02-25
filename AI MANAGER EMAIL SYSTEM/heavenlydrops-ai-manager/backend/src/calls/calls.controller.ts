/**
 * Calls Controller — Fixed version
 * TwiML endpoints now return raw XML via @Res() instead of a JSON object.
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
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { CallsService, ScheduleCallRequest } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallStatus } from './entities/call-log.entity';

@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  // ─── Public Twilio Webhook Endpoints ─────────────────────────────────────

  @Get('twiml')
  getTwiML(
    @Query('leadId') leadId: string,
    @Query('script') script: string,
    @Res() res: Response,
  ) {
    const xml = this.generateTwiML(leadId, script);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    return res.send(xml);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  async handleStatusUpdate(
    @Body('CallSid') callSid: string,
    @Body('CallStatus') status: string,
    @Body('CallDuration') duration: string,
    @Body('RecordingUrl') recordingUrl: string,
  ) {
    await this.callsService.handleStatusUpdate(
      callSid,
      status,
      duration ? parseInt(duration) : undefined,
      recordingUrl,
    );
    return { success: true };
  }

  @Post('recording')
  @HttpCode(HttpStatus.OK)
  handleRecording() {
    return { success: true };
  }

  @Post('gather')
  @HttpCode(HttpStatus.OK)
  handleGather(@Res() res: Response) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="Polly.Joanna">Thank you. A consultant will contact you shortly.</Say>\n  <Hangup/>\n</Response>`;
    res.set('Content-Type', 'application/xml; charset=utf-8');
    return res.send(xml);
  }

  // ─── Protected Endpoints ──────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('leadId') leadId?: string,
    @Query('status') status?: CallStatus,
  ) {
    return this.callsService.findAll({ leadId, status });
  }

  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  getStatistics() {
    return this.callsService.getStatistics();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.callsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  schedule(@Body() request: ScheduleCallRequest) {
    return this.callsService.scheduleCall(request);
  }

  @Post(':id/execute')
  @UseGuards(JwtAuthGuard)
  execute(@Param('id', ParseUUIDPipe) id: string) {
    return this.callsService.executeCall(id);
  }

  @Post(':id/retry')
  @UseGuards(JwtAuthGuard)
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.callsService.retryCall(id);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private generateTwiML(leadId: string, script: string): string {
    const safeScript = (script || 'Hello, this is Heavenly Drops calling.')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${safeScript}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="/api/calls/gather?leadId=${leadId}" method="POST">
    <Say voice="Polly.Joanna">Please speak after the tone.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive a response. A consultant will contact you shortly.</Say>
  <Hangup/>
</Response>`;
  }
}
