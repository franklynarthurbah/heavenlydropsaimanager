/**
 * Calls Controller
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
  Headers,
  RawBody,
} from '@nestjs/common';
import { CallsService, ScheduleCallRequest } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallStatus } from './entities/call-log.entity';

@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  // Public endpoints for Twilio webhooks
  @Get('twiml')
  getTwiML(
    @Query('leadId') leadId: string,
    @Query('script') script: string,
  ) {
    // Return TwiML XML for Twilio
    return {
      contentType: 'application/xml',
      body: this.generateTwiML(leadId, script),
    };
  }

  @Post('status')
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
  handleRecording(
    @Body('RecordingSid') recordingSid: string,
    @Body('CallSid') callSid: string,
    @Body('RecordingUrl') recordingUrl: string,
  ) {
    // Handle recording callback
    return { success: true };
  }

  @Post('gather')
  handleGather(
    @Body('SpeechResult') speechResult: string,
    @Query('leadId') leadId: string,
  ) {
    // Handle speech input
    return {
      contentType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your response.</Say>
  <Hangup/>
</Response>`,
    };
  }

  // Protected endpoints
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

  private generateTwiML(leadId: string, script: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${script || 'Hello, this is Heavenly Drops calling.'}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto">
    <Say>Please respond after the beep.</Say>
  </Gather>
  <Hangup/>
</Response>`;
  }
}
