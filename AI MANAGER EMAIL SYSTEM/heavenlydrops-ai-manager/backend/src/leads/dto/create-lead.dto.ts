/**
 * Create Lead DTO
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsJSON,
} from 'class-validator';
import { LeadSource, InterestType } from '../entities/lead.entity';

export class CreateLeadDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsInt()
  @Min(16)
  @Max(80)
  @IsOptional()
  age?: number;

  @IsEnum(InterestType)
  @IsOptional()
  interestType?: InterestType;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @IsString()
  @IsOptional()
  referralCode?: string;

  @IsJSON()
  @IsOptional()
  metadata?: string;
}
