/**
 * pages/TeacherRegisterPage.jsx — Teacher Registration
 * ======================================================
 * Simple form: username, name, password, confirm password.
 * No face capture required for teachers.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api/client';

export default function TeacherRegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '', name: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validate = () => {
    if (!form.username || !form.name || !form.password || !form.confirmPassword) {
      return 'All fields are required.';
    }
    if (form.name.length < 2 || form.name.length > 100) {
      return 'Name must be between 2 and 100 characters.';
    }
    if (form.username.length < 3 || form.username.length > 50) {
      return 'Username must be between 3 and 50 characters.';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) {
      return 'Username must be alphanumeric (underscores allowed).';
    }
    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match.';
    }
    if (form.password.length < 6 || form.password.length > 72) {
      return 'Password must be between 6 and 72 characters.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    console.log(`[TeacherRegister] Registering username='${form.username}'`);

    try {
      await authAPI.teacherRegister({
        username: form.username.toLowerCase(),
        name: form.name,
        password: form.password,
      });
      console.log('[TeacherRegister] ✅ Registration successful — redirecting to login.');
      setSuccess('Account created! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Registration failed. Please try again.';
      console.error('[TeacherRegister] Error:', err.response?.data);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-lavender-200 rounded-full opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-mint-200 rounded-full opacity-20 blur-3xl" />
      </div>

      <div className="auth-card relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl
                          bg-gradient-to-br from-lavender-400 to-lavender-600
                          flex items-center justify-center shadow-glow">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Create Teacher Account</h1>
          <p className="text-sm text-slate-400 mt-1">Join Snap Attendance as an educator</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label htmlFor="name" className="label">Full Name</label>
            <input id="name" name="name" type="text" placeholder="Dr. Jane Smith"
              value={form.name} onChange={handleChange}
              className={error ? 'input-error' : 'input'} disabled={loading} />
          </div>

          <div className="form-group">
            <label htmlFor="username" className="label">Username</label>
            <input id="username" name="username" type="text" placeholder="jane_smith"
              value={form.username} onChange={handleChange}
              className={error ? 'input-error' : 'input'} disabled={loading} />
            <p className="text-xs text-slate-400 mt-1">Lowercase letters, numbers, and underscores only.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label htmlFor="password" className="label">Password</label>
              <input id="password" name="password" type="password" placeholder="Min 3 chars"
                value={form.password} onChange={handleChange}
                className={error ? 'input-error' : 'input'} disabled={loading} />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword" className="label">Confirm</label>
              <input id="confirmPassword" name="confirmPassword" type="password" placeholder="Repeat"
                value={form.confirmPassword} onChange={handleChange}
                className={error ? 'input-error' : 'input'} disabled={loading} />
            </div>
          </div>

          {error && (
            <div className="alert-error animate-fade-in">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert-success animate-fade-in">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2" id="teacher-register-btn">
            {loading ? (
              <><span className="spinner" /><span>Creating account...</span></>
            ) : (
              <span>Create Teacher Account</span>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-lavender-600 font-medium hover:text-lavender-700 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
