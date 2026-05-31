/**
 * pages/SubjectsPage.jsx — Subject Management for Teachers
 * ==========================================================
 * Features:
 *   - List all subjects in a beautiful card grid
 *   - Create new subject via inline modal
 *   - View QR code for each subject
 *   - Delete a subject (with confirmation)
 *   - Click "Take Attendance" to go to attendance page
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { subjectsAPI } from '../api/client';
import ShareModal from '../components/ShareModal';
import CreateSubjectModal from '../components/CreateSubjectModal';

// ShareModal and CreateSubjectModal are imported from components/


// ShareModal is imported from components/ShareModal.jsx

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SubjectsPage() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [shareSubject, setShareSubject] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchSubjects(true);
    const interval = setInterval(() => fetchSubjects(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSubjects = (showLoading = true) => {
    if (showLoading) setLoading(true);
    console.log('[SubjectsPage] Fetching subjects...');
    subjectsAPI.list()
      .then(({ data }) => {
        setSubjects(data);
        console.log(`[SubjectsPage] ${data.length} subject(s) loaded.`);
      })
      .catch((err) => console.error('[SubjectsPage] Load failed:', err))
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  };

  const handleCreated = (newSubject) => {
    setSubjects((prev) => [newSubject, ...prev]);
  };

  const handleDelete = async (subjectId, subjectName) => {
    if (!window.confirm(`Delete "${subjectName}"? This cannot be undone.`)) return;
    setDeletingId(subjectId);
    console.log('[SubjectsPage] Deleting subject_id:', subjectId);
    try {
      await subjectsAPI.delete(subjectId);
      setSubjects((prev) => prev.filter((s) => s.subject_id !== subjectId));
      console.log('[SubjectsPage] ✅ Subject deleted.');
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete subject.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <main className="flex-1 ml-64">
        <div className="page-container">

          {/* ── Header ──────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-8 animate-slide-up">
            <div>
              <h1 className="page-title">Subjects</h1>
              <p className="text-slate-400 text-sm mt-0.5">Manage your courses and enrollment</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary"
              id="open-create-subject-modal-btn"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Subject
            </button>
          </div>

          {/* ── Content ─────────────────────────────────────── */}
          {loading ? (
            <div className="flex justify-center py-24">
              <span className="spinner w-8 h-8" />
            </div>
          ) : subjects.length === 0 ? (
            <div className="card text-center py-16">
              <div className="w-20 h-20 bg-lavender-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-lavender-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No subjects yet</h3>
              <p className="text-slate-400 text-sm mb-5">Create your first subject to get started.</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex">
                Create Subject
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((subj) => (
                <div key={subj.subject_id} className="card hover:shadow-glow transition-all duration-200">
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge-lavender">{subj.subject_code}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {subj.section}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1 leading-snug">{subj.name}</h3>
                  <p className="text-xs text-slate-500 mt-2 font-medium mb-4">
                    Students: {subj.enrolled_count || 0}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-slate-100">
                    <Link
                      to={`/dashboard/attendance/${subj.subject_id}`}
                      className="btn-attendance flex-1 text-xs py-2 px-3"
                      id={`take-attendance-btn-${subj.subject_id}`}
                    >
                      📷 Attendance
                    </Link>
                    <button
                      onClick={() => setShareSubject(subj)}
                      className="btn-secondary text-xs py-2 px-3"
                      title="Share Subject Options"
                      id={`share-btn-${subj.subject_id}`}
                    >
                      Share
                    </button>
                    <button
                      onClick={() => handleDelete(subj.subject_id, subj.name)}
                      disabled={deletingId === subj.subject_id}
                      className="btn-ghost text-rose-400 hover:bg-rose-50 hover:text-rose-500 text-xs py-2 px-2"
                      title="Delete subject"
                      id={`delete-subject-btn-${subj.subject_id}`}
                    >
                      {deletingId === subj.subject_id ? (
                        <span className="spinner w-4 h-4" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <CreateSubjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {shareSubject && (
        <ShareModal subject={shareSubject} onClose={() => setShareSubject(null)} />
      )}
    </div>
  );
}
