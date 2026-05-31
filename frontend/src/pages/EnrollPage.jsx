/**
 * pages/EnrollPage.jsx — Student Enrollment via QR / Deep Link
 * ==============================================================
 * Route: /enroll/:subjectId
 *
 * When a student scans the QR code, they land here.
 * If not logged in → redirect to login with returnUrl so they come back after.
 * If logged in as student → immediately call enroll API.
 * If logged in as teacher → show error (teachers can't enroll).
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { subjectsAPI } from '../api/client';

export default function EnrollPage() {
  const { subjectId } = useParams();
  const { isAuthenticated, isStudent } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading');   // 'loading' | 'success' | 'error' | 'already'
  const [message, setMessage] = useState('');
  const [subjectName, setSubjectName] = useState('');

  useEffect(() => {
    console.log('[EnrollPage] subject_id:', subjectId, 'authenticated:', isAuthenticated);

    if (!isAuthenticated) {
      // Not logged in → redirect to login and come back
      console.log('[EnrollPage] Not authenticated — redirecting to login...');
      navigate(`/login?next=/enroll/${subjectId}`, { replace: true });
      return;
    }

    if (!isStudent) {
      setStatus('error');
      setMessage('Only students can enroll in subjects. Teachers manage subjects from their dashboard.');
      return;
    }

    // Proceed with enrollment
    console.log('[EnrollPage] Student authenticated — calling enroll API...');
    subjectsAPI.enroll({ subject_id: subjectId })
      .then(({ data }) => {
        console.log('[EnrollPage] ✅ Enrollment result:', data);
        setSubjectName(data.subject_name || '');
        if (data.already_enrolled) {
          setStatus('already');
          setMessage(data.message);
        } else {
          setStatus('success');
          setMessage(data.message);
        }
      })
      .catch((err) => {
        console.error('[EnrollPage] Enrollment failed:', err.response?.data);
        setStatus('error');
        setMessage(err.response?.data?.message || err.response?.data?.detail || 'Enrollment failed. Please try again.');
      });
  }, [subjectId, isAuthenticated, isStudent, navigate]);

  return (
    <div className="auth-wrapper">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-lavender-200 rounded-full opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-mint-200 rounded-full opacity-20 blur-3xl" />
      </div>

      <div className="auth-card relative text-center">

        {/* Loading */}
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto mb-5 bg-lavender-100 rounded-2xl flex items-center justify-center">
              <span className="spinner w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Enrolling you...</h1>
            <p className="text-slate-400 text-sm">Please wait a moment.</p>
          </>
        )}

        {/* Success */}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-5 bg-mint-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-mint-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Enrolled! 🎉</h1>
            {subjectName && <p className="badge-lavender mx-auto mb-3">{subjectName}</p>}
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <Link to="/portal" className="btn-primary">Go to My Portal →</Link>
          </>
        )}

        {/* Already enrolled */}
        {status === 'already' && (
          <>
            <div className="w-16 h-16 mx-auto mb-5 bg-lavender-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-lavender-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Already Enrolled</h1>
            {subjectName && <p className="badge-lavender mx-auto mb-3">{subjectName}</p>}
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <Link to="/portal" className="btn-secondary">Back to Portal</Link>
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-5 bg-rose-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Enrollment Failed</h1>
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <div className="flex gap-3 justify-center">
              <Link to="/portal" className="btn-secondary">Go to Portal</Link>
              <button onClick={() => window.location.reload()} className="btn-primary">Try Again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
