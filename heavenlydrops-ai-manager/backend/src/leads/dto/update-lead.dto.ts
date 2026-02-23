/**
 * Update Lead DTO
 */

import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadDto } from './create-lead.dto';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { LeadStatus } from '../entities/lead.entity';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;
}
