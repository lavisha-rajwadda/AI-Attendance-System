/**
 * pages/StudentPortal.jsx — Student Dashboard
 * =============================================
 * Shows the student's name, enrolled subjects, and quick-enroll button.
 * Students can browse their attendance history per subject.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subjectsAPI, attendanceAPI } from '../api/client';

function StudentHeader({ user, onLogout }) {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-20 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500
                          flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <span className="font-bold text-lg text-slate-800">
            Snap Attendance
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600
                            flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {user?.name?.[0]?.toUpperCase() || 'S'}
            </div>
            <span className="text-sm font-semibold text-slate-700 hidden sm:block">{user?.name}</span>
            <span className="text-xs bg-lavender-100 text-lavender-700 px-2 py-0.5 rounded font-medium">Student</span>
          </div>
          <button onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-rose-500 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSubjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await subjectsAPI.list();
      setSubjects(data);
    } catch (err) {
      console.error('[StudentPortal] Failed to fetch subjects:', err);
      setError('Could not load subjects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleSubjectClick = async (subject) => {
    setSelectedSubject(subject);
    setDetailLoading(true);
    setSummary(null);
    setHistory(null);
    try {
      const summaryPromise = attendanceAPI.summary(subject.subject_id);
      const historyPromise = attendanceAPI.history(subject.subject_id);
      
      const [sumRes, histRes] = await Promise.all([summaryPromise, historyPromise]);
      
      setSummary(sumRes.data);
      setHistory(histRes.data);
    } catch (err) {
      console.error('[StudentPortal] Failed to fetch attendance details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f7ff] text-slate-700 flex flex-col font-sans">
      <StudentHeader user={user} onLogout={logout} />

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-8 animate-fade-in">
        
        {/* Left column: Enrollment & Subject list */}
        <div className="flex-1 space-y-6">
          <div className="card">
            <h1 className="text-2xl font-bold text-slate-800 mb-1">
              Hi, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-slate-500 text-sm">
              Manage your subject enrollments and view real-time class attendance logs.
            </p>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Enroll in a Subject</h2>
            <p className="text-sm text-slate-500 mb-4">
              Ask your instructor for the subject enrollment ID or code, then enter it below.
            </p>
            <EnrollInline onSuccess={fetchSubjects} />
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center justify-between">
              <span>My Enrolled Subjects</span>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium">
                {subjects.length} Total
              </span>
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <span className="spinner w-8 h-8" />
                <p className="text-sm text-slate-400">Loading subjects...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-rose-500 text-sm mb-3">{error}</p>
                <button onClick={fetchSubjects} className="btn-secondary text-xs px-4 py-2">
                  Retry
                </button>
              </div>
            ) : subjects.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <p className="text-sm text-slate-600 font-medium">No subjects enrolled yet</p>
                <p className="text-xs text-slate-500 mt-1">Submit a subject ID above to get started.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {subjects.map((sub) => {
                  const isSelected = selectedSubject?.subject_id === sub.subject_id;
                  return (
                    <button
                      key={sub.subject_id}
                      onClick={() => handleSubjectClick(sub)}
                      className={`text-left p-4 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                        isSelected
                          ? 'bg-lavender-50 border-lavender-300 text-slate-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-800 text-sm sm:text-base">{sub.name}</div>
                        <div className="text-xs text-slate-500">
                          {sub.subject_code} • Section {sub.section}
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-slate-400 transition-transform ${isSelected ? 'text-lavender-500 translate-x-1' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Subject Details & Attendance Progress */}
        <div className="w-full md:w-96 flex flex-col">
          <div className="card min-h-[300px] flex-1">
            {!selectedSubject ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-4 border border-slate-100">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-slate-600 font-medium text-sm">Select a subject</p>
                <p className="text-xs text-slate-500 max-w-[200px] mt-1 mx-auto">
                  Click on an enrolled subject to view your full attendance analytics.
                </p>
              </div>
            ) : detailLoading ? (
              <div className="h-full flex flex-col items-center justify-center py-12 space-y-3">
                <span className="spinner w-8 h-8" />
                <p className="text-sm text-slate-400">Loading details...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-slate-800">{selectedSubject.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedSubject.subject_code} • Section {selectedSubject.section}
                  </p>
                </div>

                {/* Overall Attendance Summary card */}
                {summary && summary.students && summary.students.length > 0 ? (
                  (() => {
                    const studentData = summary.students[0]; // Students endpoint returns only this student
                    const pct = studentData.attendance_percentage;
                    const present = studentData.sessions_present;
                    const total = studentData.total_sessions;
                    
                    let strokeColor = 'stroke-indigo-500';
                    let textColor = 'text-indigo-600';
                    if (pct >= 85) {
                      strokeColor = 'stroke-mint-500';
                      textColor = 'text-mint-500';
                    } else if (pct < 75) {
                      strokeColor = 'stroke-rose-500';
                      textColor = 'text-rose-500';
                    }

                    return (
                      <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center gap-4">
                          {/* Radial progress bar */}
                          <div className="relative w-16 h-16 flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <path
                                className="stroke-slate-200"
                                strokeWidth="3"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className={`${strokeColor} transition-all duration-500`}
                                strokeDasharray={`${pct}, 100`}
                                strokeWidth="3.2"
                                strokeLinecap="round"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-bold text-sm text-slate-700">
                              {Math.round(pct)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 font-medium">Overall Attendance</div>
                            <div className="text-lg font-bold text-slate-800 mt-0.5">
                              {present} / {total} <span className="text-xs font-normal text-slate-500">Sessions</span>
                            </div>
                          </div>
                        </div>

                        {/* Session log list */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Session History
                          </h4>
                          {history && history.sessions && history.sessions.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                              {history.sessions.map((sess, sidx) => {
                                const record = sess.records[0]; // returns only this student
                                const dateObj = new Date(sess.timestamp);
                                const dateStr = dateObj.toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                });
                                return (
                                  <div
                                    key={sidx}
                                    className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between animate-fade-in"
                                  >
                                    <div>
                                      <div className="text-xs font-semibold text-slate-700">{dateStr}</div>
                                      {record && record.confidence !== null && (
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                          Confidence: {Math.round(record.confidence * 100)}%
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      {record?.is_present ? (
                                        <span className="badge-present">
                                          Present
                                        </span>
                                      ) : (
                                        <span className="badge-absent">
                                          Absent
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-xs text-slate-400">
                              No history found.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-600 font-medium">No sessions run yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Your attendance will show here once the teacher runs AI attendance analysis.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inline Enroll Form ────────────────────────────────────────────────────────
function EnrollInline({ onSuccess }) {
  const [subjectInput, setSubjectInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEnroll = async (e) => {
    e.preventDefault();
    const input = subjectInput.trim();
    if (!input) {
      setError('Please enter a subject ID or code.');
      return;
    }
    setLoading(true);
    setError('');

    // Simple UUID check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const payload = uuidRegex.test(input)
      ? { subject_id: input }
      : { subject_code: input };

    try {
      const { data } = await subjectsAPI.enroll(payload);
      setSubjectInput('');
      
      if (data.already_enrolled) {
        alert(data.message || 'You are already enrolled in this subject.');
      } else {
        alert(data.message || 'Successfully enrolled in the subject!');
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.detail || 'Enrollment failed. Check the subject ID or code.';
      setError(errMsg);
      alert(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleEnroll} className="flex gap-2">
        <input
          type="text"
          placeholder="Paste subject ID (UUID) or code here..."
          value={subjectInput}
          onChange={(e) => {
            setSubjectInput(e.target.value);
            setError('');
          }}
          className="input"
          disabled={loading}
          id="enroll-subject-id-input"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primary py-2.5 h-[46px] whitespace-nowrap"
          id="enroll-btn"
        >
          {loading ? 'Enrolling...' : 'Enroll'}
        </button>
      </form>
      {error && <p className="text-xs text-rose-500 font-medium pl-1">{error}</p>}
    </div>
  );
}
