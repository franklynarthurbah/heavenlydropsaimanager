export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'admin' | 'agent';
  avatarUrl?: string;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  country?: string;
  age?: number;
  interestType: 'study_in_spain' | 'work_in_czech' | 'other';
  status: LeadStatus;
  source: LeadSource;
  notes?: string;
  assignedTo?: string;
  qualificationData?: QualificationData;
  aiInteractionCount: number;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'unqualified'
  | 'appointment_scheduled'
  | 'converted'
  | 'lost'
  | 'follow_up';

export type LeadSource =
  | 'website_form'
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'referral'
  | 'email'
  | 'phone'
  | 'walk_in'
  | 'other';

export interface QualificationData {
  hasPassport?: boolean;
  englishLevel?: string;
  budget?: string;
  timeline?: string;
  previousExperience?: string;
}

export interface Conversation {
  id: string;
  leadId: string;
  channel: 'whatsapp' | 'instagram' | 'email' | 'voice';
  status: 'open' | 'closed' | 'pending';
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  createdAt: string;
}

export interface Appointment {
  id: string;
  leadId: string;
  title: string;
  scheduledAt: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  type: 'consultation' | 'follow_up' | 'demo';
  notes?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalLeads: number;
  newLeadsThisWeek: number;
  convertedThisMonth: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}
