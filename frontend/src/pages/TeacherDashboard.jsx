import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { subjectsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ShareModal from '../components/ShareModal';
import CreateSubjectModal from '../components/CreateSubjectModal';
import TakeAttendanceModal from '../components/TakeAttendanceModal';

function StatCard({ value, label, color, icon }) {
  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showTakeAttendance, setShowTakeAttendance] = useState(false);
  const [showCreateSubject,  setShowCreateSubject]  = useState(false);
  const [shareSubject,       setShareSubject]       = useState(null);

  useEffect(() => {
    console.log('[TeacherDashboard] Fetching subjects for overview...');
    
    const fetchSubjects = () => {
      subjectsAPI.list()
        .then(({ data }) => {
          setSubjects(data);
          console.log(`[TeacherDashboard] Loaded ${data.length} subject(s).`);
        })
        .catch((err) => console.error('[TeacherDashboard] Failed to load subjects:', err))
        .finally(() => setLoading(false));
    };

    fetchSubjects();
    const interval = setInterval(fetchSubjects, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreated = (newSubj) => {
    setSubjects((prev) => [newSubj, ...prev]);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      {/* Main content — offset by sidebar width */}
      <main className="flex-1 ml-64">
        <div className="page-container">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-slide-up">
            <div>
              <p className="text-slate-400 text-sm mb-1">{greeting()},</p>
              <h1 className="page-title text-3xl">{user?.name || 'Teacher'} 👋</h1>
              <p className="text-slate-500 mt-1">Here's an overview of your subjects and activity.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTakeAttendance(true)}
                className="btn-attendance flex items-center gap-2"
                id="global-take-attendance-btn"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
                Take Attendance
              </button>
              <button
                onClick={() => setShowCreateSubject(true)}
                className="btn-secondary flex items-center gap-2"
                id="global-create-subject-btn"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Subject
              </button>
            </div>
          </div>

          {/* ── Stats Row ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <StatCard
              value={loading ? '—' : subjects.length}
              label="Total Subjects"
              color="bg-lavender-100"
              icon={
                <svg className="w-5 h-5 text-lavender-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />
          </div>

          {/* ── Recent Subjects ────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Your Subjects</h2>
              <Link to="/dashboard/subjects" className="text-sm text-lavender-600 font-medium hover:text-lavender-700 transition-colors">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <span className="spinner" />
                <span className="ml-2 text-slate-400 text-sm">Loading subjects...</span>
              </div>
            ) : subjects.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <p className="text-slate-400 text-sm mb-3">No subjects yet.</p>
                <button onClick={() => setShowCreateSubject(true)} className="btn-primary inline-flex">
                  Create your first subject
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjects.slice(0, 6).map((subj) => (
                  <div
                    key={subj.subject_id}
                    className="card hover:shadow-glow transition-all duration-200 p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <span className="badge-lavender">{subj.subject_code}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {subj.section}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-700 text-sm mt-2 leading-snug">{subj.name}</h3>
                      <p className="text-xs text-slate-500 mt-2 font-medium mb-4">
                        Students: {subj.enrolled_count || 0}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t border-slate-100 mt-auto">
                      <Link
                        to={`/dashboard/attendance/${subj.subject_id}`}
                        className="btn-attendance flex-1 text-xs py-2 px-3 text-center flex items-center justify-center gap-1"
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      {showTakeAttendance && (
        <TakeAttendanceModal
          subjects={subjects}
          onClose={() => setShowTakeAttendance(false)}
        />
      )}
      {showCreateSubject && (
        <CreateSubjectModal
          onClose={() => setShowCreateSubject(false)}
          onCreated={handleCreated}
        />
      )}
      {shareSubject && (
        <ShareModal
          subject={shareSubject}
          onClose={() => setShareSubject(null)}
        />
      )}
    </div>
  );
}

