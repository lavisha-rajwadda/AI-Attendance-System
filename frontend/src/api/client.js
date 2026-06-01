/**
 * api/client.js — Axios Instance & Interceptors
 * ================================================
 * Central HTTP client. All API calls go through this instance so:
 *   - Base URL is set once (from .env)
 *   - JWT token is automatically attached to every request
 *   - 401 responses automatically clear the token and redirect to login
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

console.log('[API Client] Base URL:', BASE_URL);

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,  // 30s — generous for ML processing
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('snap_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.debug(`[API] → ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('[API] Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// ── Response interceptor: handle 401 globally ────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    console.debug(
      `[API] ← ${response.config.method?.toUpperCase()} ${response.config.url} ` +
      `[${response.status}]`
    );
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    console.error(`[API] ← Error ${status} on ${url}:`, error.response?.data);

    if (status === 401) {
      const isLoginRequest = url && (url.includes('/auth/teacher/login') || url.includes('/auth/student/login'));
      if (!isLoginRequest) {
        console.warn('[API] 401 Unauthorized — clearing token and redirecting to login.');
        localStorage.removeItem('snap_token');
        localStorage.removeItem('snap_user');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth endpoints ────────────────────────────────────────────────────────────
export const authAPI = {
  teacherRegister: (data) => apiClient.post('/auth/teacher/register', data),
  teacherLogin: (data) => apiClient.post('/auth/teacher/login', data),
  studentRegister: (data) => apiClient.post('/auth/student/register', data),
  studentLogin: (data) => apiClient.post('/auth/student/login', data),
  getMe: () => apiClient.get('/auth/me'),
};

// ── Subjects endpoints ────────────────────────────────────────────────────────
export const subjectsAPI = {
  create: (data) => apiClient.post('/subjects/', data),
  list: () => apiClient.get('/subjects/'),
  get: (id) => apiClient.get(`/subjects/${id}`),
  delete: (id) => apiClient.delete(`/subjects/${id}`),
  getQR: (id) => apiClient.get(`/subjects/${id}/qr`),
  enroll: (data) => apiClient.post('/subjects/enroll', data),
  listStudents: (id) => apiClient.get(`/subjects/${id}/students`),
};

// ── Attendance endpoints ──────────────────────────────────────────────────────
export const attendanceAPI = {
  /**
   * Process attendance: multipart/form-data with photos + subject_id.
   * @param {string} subjectId
   * @param {File[]} photoFiles
   */
  process: (subjectId, photoFiles) => {
    const form = new FormData();
    form.append('subject_id', subjectId);
    photoFiles.forEach((file) => form.append('photos', file));
    return apiClient.post('/attendance/process', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,   // 2 min — ML pipeline can be slow on first run
    });
  },

  confirm: (data) => apiClient.post('/attendance/confirm', data),
  history: (subjectId) => apiClient.get(`/attendance/${subjectId}/history`),
  summary: (subjectId) => apiClient.get(`/attendance/${subjectId}/summary`),
  recognizeTeam: (subjectId, photoFiles) => {
    const form = new FormData();
    form.append('subject_id', subjectId);
    photoFiles.forEach((file) => form.append('files', file));
    return apiClient.post('/attendance/recognize-team', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
};
