import axios, { AxiosError } from 'axios';
import type { Lead, User, Conversation, Appointment, DashboardStats } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 by redirecting to login
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ─── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; user: User }>('/auth/login', { email, password }),
  register: (data: Record<string, unknown>) =>
    api.post<{ access_token: string; user: User }>('/auth/register', data),
  profile: () => api.get<User>('/auth/profile'),
};

// ─── Leads ─────────────────────────────────────────────────────────────────

export const leadsApi = {
  getAll: (params?: Record<string, unknown>) =>
    api.get<{ leads: Lead[]; total: number; page: number; totalPages: number }>('/leads', { params }),
  getOne: (id: string) => api.get<Lead>(`/leads/${id}`),
  create: (data: Partial<Lead>) => api.post<Lead>('/leads', data),
  update: (id: string, data: Partial<Lead>) => api.patch<Lead>(`/leads/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch<Lead>(`/leads/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/leads/${id}`),
  getStats: () => api.get<DashboardStats>('/leads/statistics'),
};

// ─── Conversations ─────────────────────────────────────────────────────────

export const conversationsApi = {
  getAll: (params?: Record<string, unknown>) => api.get<Conversation[]>('/conversations', { params }),
  getOne: (id: string) => api.get<Conversation>(`/conversations/${id}`),
  getByLead: (leadId: string) => api.get<Conversation[]>(`/conversations/lead/${leadId}`),
};

// ─── Appointments ──────────────────────────────────────────────────────────

export const appointmentsApi = {
  getAll: (params?: Record<string, unknown>) => api.get<Appointment[]>('/appointments', { params }),
  getOne: (id: string) => api.get<Appointment>(`/appointments/${id}`),
  create: (data: Partial<Appointment>) => api.post<Appointment>('/appointments', data),
  update: (id: string, data: Partial<Appointment>) => api.patch<Appointment>(`/appointments/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch<Appointment>(`/appointments/${id}/status`, { status }),
};
