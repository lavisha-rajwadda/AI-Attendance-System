/**
 * pages/LoginPage.jsx — Unified Login (Teacher & Student)
 * ========================================================
 * Single login page with a tab toggle for teacher / student roles.
 * On success, stores token via AuthContext and redirects to the
 * appropriate dashboard.
 *
 * Design: Premium glassmorphism card on a lavender gradient background.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Role tabs
const TABS = [
  { key: 'teacher', label: '🎓 Teacher' },
  { key: 'student', label: '🎒 Student' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();

  const [activeTab, setActiveTab] = useState('teacher');
  const [form,      setForm]      = useState({ username: '', password: '' });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const handleChange = (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
    setForm({ username: '', password: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.username.trim() || !form.password.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    setLoading(true);
    console.log(`[LoginPage] Attempting ${activeTab} login for username='${form.username}'`);

    try {
      const apiFn = activeTab === 'teacher' ? authAPI.teacherLogin : authAPI.studentLogin;
      const { data } = await apiFn({ username: form.username, password: form.password });

      console.log(`[LoginPage] Login successful: role=${data.role}, user_id=${data.user_id}`);
      login(data);

      // Redirect based on next URL or role
      const params = new URLSearchParams(window.location.search);
      const nextUrl = params.get('next');
      if (nextUrl) {
        navigate(nextUrl, { replace: true });
      } else {
        navigate(data.role === 'teacher' ? '/dashboard' : '/portal', { replace: true });
      }

    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Login failed. Please check your credentials.';
      console.error(`[LoginPage] Login failed:`, err.response?.data);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      {/* Background decorative blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-lavender-200 rounded-full opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-mint-200 rounded-full opacity-30 blur-3xl" />
      </div>

      <div className="auth-card relative">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl
                          bg-gradient-to-br from-lavender-400 to-lavender-600
                          flex items-center justify-center shadow-glow">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome Back</h1>
          <p className="text-sm text-slate-400 mt-1">Sign in to Snap Attendance</p>
        </div>

        {/* ── Role Tabs ───────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === key
                  ? 'bg-white text-lavender-700 shadow-card'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Form ────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label htmlFor="username" className="label">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Enter your username"
              value={form.username}
              onChange={handleChange}
              className={error ? 'input-error' : 'input'}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              className={error ? 'input-error' : 'input'}
              disabled={loading}
            />
          </div>

          {/* ── Error Alert ──────────────────────────────────────── */}
          {error && (
            <div className="alert-error animate-fade-in">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* ── Submit ───────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
            id="login-submit-btn"
          >
            {loading ? (
              <>
                <span className="spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In as {activeTab === 'teacher' ? 'Teacher' : 'Student'}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* ── Footer Links ─────────────────────────────────────────── */}
        <div className="mt-6 text-center space-y-2 text-sm">
          <p className="text-slate-400">
            {activeTab === 'teacher' ? "Don't have a teacher account?" : "New student?"}
            {' '}
            <Link
              to={activeTab === 'teacher' ? '/register/teacher' : `/register/student${window.location.search}`}
              className="text-lavender-600 font-medium hover:text-lavender-700 transition-colors"
            >
              Register here
            </Link>
          </p>
          {activeTab === 'student' && (
            <p className="text-slate-400">
              Are you a teacher?{' '}
              <button
                onClick={() => handleTabChange('teacher')}
                className="text-lavender-600 font-medium hover:text-lavender-700 transition-colors"
              >
                Switch to teacher login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
