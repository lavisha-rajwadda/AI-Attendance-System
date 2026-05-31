/**
 * pages/AttendancePage.jsx — AI Attendance Processing with /recognize-team
 * =========================================================================
 * Single-photo team attendance recognition workflow.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { attendanceAPI, subjectsAPI } from '../api/client';

export default function AttendancePage() {
  const { subjectId } = useParams();

  // Subject metadata
  const [subject, setSubject] = useState(null);
  const [subjectLoading, setSubjectLoading] = useState(true);

  // Upload and processing state
  const [photos, setPhotos] = useState([]); // List of Files
  const [previews, setPreviews] = useState([]); // Previews list
  const [processing, setProcessing] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null); // { error_code, message }
  const [result, setResult] = useState(null); // API response payload

  const fileInputRef = useRef(null);

  // Load subject metadata on mount
  useEffect(() => {
    console.log('[AttendancePage] Loading subject_id:', subjectId);
    subjectsAPI.get(subjectId)
      .then(({ data }) => {
        setSubject(data);
      })
      .catch((err) => console.error('[AttendancePage] Failed to load subject:', err))
      .finally(() => setSubjectLoading(false));
  }, [subjectId]);

  // Clean up preview URLs on unmount or photos change
  useEffect(() => {
    if (photos.length === 0) {
      setPreviews([]);
      return;
    }
    const urls = photos.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [photos]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files && files.length > 0) {
      const combined = [...photos, ...files];
      if (combined.length > 5) {
        alert('Maximum 5 photos allowed.');
        setPhotos(combined.slice(0, 5));
      } else {
        setPhotos(combined);
      }
      setErrorDetails(null);
      setResult(null);
    }
    e.target.value = '';
  };

  const removePhoto = (index) => {
    setPhotos(photos.filter((_, i) => i !== index));
    setResult(null);
    setErrorDetails(null);
  };

  const handleProcess = async () => {
    if (photos.length === 0) {
      setErrorDetails({ message: 'Please select at least one photo first.' });
      return;
    }
    setProcessing(true);
    setErrorDetails(null);
    setResult(null);

    try {
      const { data } = await attendanceAPI.recognizeTeam(subjectId, photos);
      setResult(data);
    } catch (err) {
      console.error('[AttendancePage] AI Recognition error:', err);
      if (err.response && err.response.data) {
        setErrorDetails(err.response.data);
      } else {
        setErrorDetails({
          message: 'An unexpected error occurred. Please check your network and try again.'
        });
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setPhotos([]);
    setResult(null);
    setErrorDetails(null);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-700 font-sans">
      <Sidebar />

      <main className="flex-1 ml-64">
        <div className="page-container max-w-4xl">
          
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4 animate-fade-in">
            <Link to="/dashboard/subjects" className="hover:text-lavender-600 transition-colors">
              Subjects
            </Link>
            <span>›</span>
            <span className="text-slate-700 font-medium">
              {subjectLoading ? '...' : subject?.name}
            </span>
            <span>›</span>
            <span className="text-slate-400">Mark Attendance</span>
          </div>

          {/* Header */}
          <div className="mb-8 animate-slide-up">
            <h1 className="page-title text-3xl">
              {subjectLoading ? 'Loading Subject...' : `${subject?.name} — Group AI Attendance`}
            </h1>
            {subject && (
              <p className="text-slate-500 text-sm mt-1">
                {subject.subject_code} · Section {subject.section}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left side: Upload card / Image preview */}
            <div className="lg:col-span-2 space-y-6">
              <div className="card">
                <h2 className="text-lg font-semibold text-slate-800 mb-1">Group Photo Upload</h2>
                <p className="text-xs text-slate-500 mb-4">
                  Provide a group photo containing students in the classroom. Ensure their faces are relatively upright and well-lit.
                </p>

                {photos.length < 5 && (
                  <div
                    onClick={() => !processing && fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-slate-200 hover:border-lavender-400 hover:bg-lavender-50/50 rounded-2xl p-10
                               flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="w-14 h-14 bg-lavender-100 rounded-2xl flex items-center justify-center mb-4">
                      <svg className="w-7 h-7 text-lavender-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Choose Group Photo(s)</p>
                    <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP · Max 5 photos</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={processing}
                      id="photo-upload-input"
                    />
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="space-y-4 mt-4">
                    <div className="flex flex-wrap gap-3">
                      {previews.map((url, i) => (
                        <div key={i} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-50 w-24 h-24 flex items-center justify-center animate-fade-in">
                          <img src={url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removePhoto(i)}
                            disabled={processing}
                            className="absolute -top-1.5 -right-1.5 bg-rose-400 hover:bg-rose-500 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center shadow-md transition disabled:opacity-50"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    {!result && (
                      <button
                        onClick={handleProcess}
                        disabled={processing}
                        className="btn-primary w-full flex items-center justify-center gap-2 animate-fade-in"
                        id="process-attendance-btn"
                      >
                        {processing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Analyzing team faces...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                            </svg>
                            <span>Run AI Attendance ({photos.length} photo{photos.length !== 1 ? 's' : ''})</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Error State Custom display */}
              {errorDetails && (
                <div className="alert-error animate-fade-in flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-500 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-rose-700 text-sm uppercase tracking-wide">
                      {errorDetails.error_code ? errorDetails.error_code.replace(/_/g, ' ') : 'Recognition Failed'}
                    </h3>
                    <p className="text-rose-600 text-sm mt-1">{errorDetails.message || errorDetails.detail || 'Verification could not be processed.'}</p>
                    
                    {errorDetails.error_code === 'blurry_image' && (
                      <ul className="text-xs text-rose-500/80 mt-2 list-disc pl-4 space-y-1">
                        <li>Ensure camera focus is locked on students.</li>
                        <li>Clean your camera lens.</li>
                        <li>Increase ambient lighting or steady the camera.</li>
                      </ul>
                    )}
                    {errorDetails.error_code === 'no_face_in_group_photo' && (
                      <ul className="text-xs text-rose-500/80 mt-2 list-disc pl-4 space-y-1">
                        <li>Make sure students are looking towards the camera.</li>
                        <li>Avoid extreme angles or students hiding their faces.</li>
                      </ul>
                    )}
                    {errorDetails.error_code === 'attendance_before_enrollment' && (
                      <p className="text-xs text-rose-500/80 mt-2">
                        Please instruct students to self-enroll in this subject first, or share the enrollment ID with them.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Faces detection list details */}
              {result && result.faces && result.faces.length > 0 && (
                <div className="card space-y-4">
                  <h3 className="text-base font-bold text-slate-800">Detected Face Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {result.faces.map((f) => (
                      <div
                        key={f.face_index}
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          f.recognized
                            ? 'bg-mint-50 border-mint-200'
                            : 'bg-slate-50 border-slate-100'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold text-slate-400">Face #{f.face_index + 1}</div>
                          <div className={`text-sm font-bold ${f.recognized ? 'text-mint-700' : 'text-slate-700'}`}>
                            {f.assigned_name}
                          </div>
                        </div>
                        <div className="text-right">
                          {f.recognized ? (
                            <>
                              <span className="text-[10px] bg-mint-100 text-mint-700 px-2 py-0.5 rounded border border-mint-200 font-medium">
                                {Math.round(f.confidence_score * 100)}% Match
                              </span>
                              <div className="text-[9px] text-slate-400 mt-0.5">Dist: {f.distance.toFixed(3)}</div>
                            </>
                          ) : (
                            <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-medium">
                              Unrecognized
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Summary / Attendance results */}
            <div className="space-y-6">
              <div className="card">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Recognition Stats</h2>
                
                {result ? (
                  <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-center">
                        <div className="text-2xl font-black text-lavender-600">{result.total_faces_detected}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Faces Found</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-center">
                        <div className="text-2xl font-black text-mint-600">
                          {result.attendance_marked_for ? result.attendance_marked_for.length : 0}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Marked Present</div>
                      </div>
                    </div>

                    {result.unrecognized_count > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-center">
                        <div className="text-xl font-bold text-amber-600">{result.unrecognized_count}</div>
                        <div className="text-xs text-amber-700 mt-0.5">Unrecognized faces in photo</div>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
                        Students Marked Present
                      </h4>
                      {result.attendance_marked_for && result.attendance_marked_for.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                          {result.attendance_marked_for.map((name, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-mint-500 animate-pulse"></span>
                              <span className="text-xs text-slate-700 font-medium">{name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 pl-1">No enrolled students recognized in this photo.</p>
                      )}
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <button onClick={handleReset} className="btn-secondary w-full py-2.5">
                        Take Another Session
                      </button>
                      <Link to="/dashboard/subjects" className="btn-primary w-full py-2.5 text-center">
                        Back to Subjects
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                    </svg>
                    <p className="text-xs">Recognition statistics will display here after you upload and run the AI analysis.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
