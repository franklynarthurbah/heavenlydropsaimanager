/**
 * Leads Service
 * 
 * Manages lead lifecycle including creation, updates,
 * qualification, and assignment.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, In } from 'typeorm';
import { Lead, LeadStatus, LeadSource } from './entities/lead.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

export interface LeadFilters {
  status?: LeadStatus;
  source?: LeadSource;
  assignedTo?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
  ) {}

  /**
   * Create a new lead
   */
  async create(createLeadDto: CreateLeadDto): Promise<Lead> {
    const lead = this.leadRepository.create({
      ...createLeadDto,
      status: LeadStatus.NEW,
      metadata: createLeadDto.metadata ? JSON.parse(createLeadDto.metadata) : null,
    });

    return this.leadRepository.save(lead);
  }

  /**
   * Create lead from public form (with metadata)
   */
  async createFromForm(data: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    interestType: string;
    country?: string;
    age?: number;
    notes?: string;
    source?: string;
    ipAddress?: string;
    userAgent?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }): Promise<Lead> {
    const lead = this.leadRepository.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      interestType: data.interestType as any,
      country: data.country,
      age: data.age,
      notes: data.notes,
      source: (data.source as any) || LeadSource.WEBSITE_FORM,
      status: LeadStatus.NEW,
      metadata: {
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
      },
    });

    return this.leadRepository.save(lead);
  }

  /**
   * Find all leads with filters and pagination
   */
  async findAll(
    filters: LeadFilters = {},
    page: number = 1,
    limit: number = 20,
  ): Promise<{ leads: Lead[]; total: number; page: number; totalPages: number }> {
    const queryBuilder = this.leadRepository.createQueryBuilder('lead');

    // Apply filters
    if (filters.status) {
      queryBuilder.andWhere('lead.status = :status', { status: filters.status });
    }

    if (filters.source) {
      queryBuilder.andWhere('lead.source = :source', { source: filters.source });
    }

    if (filters.assignedTo) {
      queryBuilder.andWhere('lead.assignedTo = :assignedTo', { assignedTo: filters.assignedTo });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(lead.firstName ILIKE :search OR lead.lastName ILIKE :search OR lead.email ILIKE :search OR lead.phoneNumber ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere('lead.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      queryBuilder.andWhere('lead.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    // Order by newest first
    queryBuilder.orderBy('lead.createdAt', 'DESC');

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [leads, total] = await queryBuilder.getManyAndCount();

    return {
      leads,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find a single lead by ID
   */
  async findOne(id: string): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id },
      relations: ['conversations', 'calls', 'appointments'],
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }

  /**
   * Find lead by email
   */
  async findByEmail(email: string): Promise<Lead | null> {
    return this.leadRepository.findOne({
      where: { email },
    });
  }

  /**
   * Find lead by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<Lead | null> {
    return this.leadRepository.findOne({
      where: { phoneNumber },
    });
  }

  /**
   * Update a lead
   */
  async update(id: string, updateLeadDto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.findOne(id);

    Object.assign(lead, updateLeadDto);

    return this.leadRepository.save(lead);
  }

  /**
   * Update lead status
   */
  async updateStatus(id: string, status: LeadStatus): Promise<Lead> {
    const lead = await this.findOne(id);
    lead.status = status;
    return this.leadRepository.save(lead);
  }

  /**
   * Update qualification data
   */
  async updateQualification(id: string, qualificationData: any): Promise<Lead> {
    const lead = await this.findOne(id);
    lead.qualificationData = qualificationData;
    return this.leadRepository.save(lead);
  }

  /**
   * Assign lead to user
   */
  async assignTo(id: string, userId: string): Promise<Lead> {
    const lead = await this.findOne(id);
    lead.assignedTo = userId;
    return this.leadRepository.save(lead);
  }

  /**
   * Remove a lead
   */
  async remove(id: string): Promise<void> {
    const lead = await this.findOne(id);
    await this.leadRepository.remove(lead);
  }

  /**
   * Get leads requiring follow-up
   */
  async getFollowUpLeads(): Promise<Lead[]> {
    return this.leadRepository.find({
      where: {
        nextFollowUpAt: LessThan(new Date()),
        status: In([
          LeadStatus.NEW,
          LeadStatus.CONTACTED,
          LeadStatus.QUALIFIED,
          LeadStatus.FOLLOW_UP,
          LeadStatus.APPOINTMENT_SCHEDULED,
        ]),
      },
      order: { nextFollowUpAt: 'ASC' },
    });
  }

  /**
   * Get lead statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    newThisWeek: number;
    convertedThisMonth: number;
  }> {
    const total = await this.leadRepository.count();

    // Count by status
    const statusCounts = await this.leadRepository
      .createQueryBuilder('lead')
      .select('lead.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('lead.status')
      .getRawMany();

    const byStatus = statusCounts.reduce((acc, curr) => {
      acc[curr.status] = parseInt(curr.count);
      return acc;
    }, {});

    // Count by source
    const sourceCounts = await this.leadRepository
      .createQueryBuilder('lead')
      .select('lead.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .groupBy('lead.source')
      .getRawMany();

    const bySource = sourceCounts.reduce((acc, curr) => {
      acc[curr.source] = parseInt(curr.count);
      return acc;
    }, {});

    // New leads this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const newThisWeek = await this.leadRepository.count({
      where: { createdAt: MoreThan(oneWeekAgo) },
    });

    // Converted this month
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const convertedThisMonth = await this.leadRepository.count({
      where: {
        status: LeadStatus.CONVERTED,
        updatedAt: MoreThan(oneMonthAgo),
      },
    });

    return {
      total,
      byStatus,
      bySource,
      newThisWeek,
      convertedThisMonth,
    };
  }
}
