/**
 * Appointments Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AppointmentsService, CreateAppointmentRequest, RescheduleRequest } from './appointments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppointmentStatus } from './entities/appointment.entity';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @Query('leadId') leadId?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.appointmentsService.findAll({
      leadId,
      status,
      assignedTo,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('statistics')
  getStatistics() {
    return this.appointmentsService.getStatistics();
  }

  @Get('upcoming')
  getUpcoming(@Query('hours') hours?: string) {
    return this.appointmentsService.getUpcomingAppointments(
      hours ? parseInt(hours) : 24,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post()
  create(@Body() request: CreateAppointmentRequest) {
    return this.appointmentsService.createAppointment(request);
  }

  @Patch(':id/reschedule')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() request: RescheduleRequest,
  ) {
    return this.appointmentsService.rescheduleAppointment(id, request);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.appointmentsService.cancelAppointment(id, reason);
  }

  @Patch(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('method') method: string,
  ) {
    return this.appointmentsService.confirmAppointment(id, method);
  }

  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.completeAppointment(id);
  }

  @Post(':id/reminder')
  sendReminder(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.sendReminder(id);
  }
}
