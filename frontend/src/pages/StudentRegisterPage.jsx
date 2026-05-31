/**
 * pages/StudentRegisterPage.jsx — Student Registration with Webcam Face Capture
 * ===============================================================================
 * Steps:
 *   1. Fill in username, name, password
 *   2. Open webcam → take a face photo → preview it
 *   3. Submit → backend extracts embedding → account created
 *
 * Uses the browser's MediaDevices API directly (no external library).
 * The captured photo is converted to base64 and sent as face_image_base64.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api/client';

const STEPS = ['details', 'capture', 'submit'];

export default function StudentRegisterPage() {
  const navigate = useNavigate();

  // Form state
  const [form, setForm] = useState({ username: '', name: '', password: '', confirmPassword: '' });
  const [capturedImage, setCapturedImage] = useState(null);   // base64 string

  // UI state
  const [step,      setStep]    = useState('details');   // 'details' | 'capture' | 'submit'
  const [loading,   setLoading] = useState(false);
  const [error,     setError]   = useState('');
  const [success,   setSuccess] = useState('');
  const [camActive, setCamActive] = useState(false);
  const [camError,  setCamError]  = useState('');

  // Refs
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleChange = (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validateDetails = () => {
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

  const handleDetailsNext = (e) => {
    e.preventDefault();
    const err = validateDetails();
    if (err) { setError(err); return; }
    setError('');
    setStep('capture');
    // Start camera a moment after step transition
    setTimeout(() => startCamera(), 200);
  };

  // ── Camera helpers ─────────────────────────────────────────────────────────
  const startCamera = async () => {
    console.log('[StudentRegister] Starting webcam...');
    setCamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCamActive(true);
      console.log('[StudentRegister] ✅ Webcam stream active.');
    } catch (err) {
      console.error('[StudentRegister] Webcam error:', err);
      setCamError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : `Could not access camera: ${err.message}`
      );
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamActive(false);
      console.log('[StudentRegister] Webcam stopped.');
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth  || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.92);
    console.log(`[StudentRegister] Photo captured — base64 length=${base64.length}`);
    setCapturedImage(base64);
    stopCamera();
    setStep('submit');
  }, [stopCamera]);

  const retakePhoto = () => {
    setCapturedImage(null);
    setError('');
    setStep('capture');
    setTimeout(() => startCamera(), 200);
  };

  // ── Final Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!capturedImage) { setError('Please capture a photo first.'); return; }

    setLoading(true);
    setError('');
    console.log(`[StudentRegister] Submitting registration for username='${form.username}'`);

    try {
      // Strip the Data URI prefix — backend accepts raw base64
      const base64Payload = capturedImage.split(',')[1];

      await authAPI.studentRegister({
        username:          form.username.toLowerCase(),
        name:              form.name,
        password:          form.password,
        face_image_base64: base64Payload,
      });

      console.log('[StudentRegister] ✅ Registration successful!');
      setSuccess('Account created! Redirecting to login...');
      setTimeout(() => navigate(`/login${window.location.search}`), 1800);

    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Registration failed. Please try again.';
      console.error('[StudentRegister] Error:', err.response?.data);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="auth-wrapper">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-lavender-200 rounded-full opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-mint-200 rounded-full opacity-20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-glow-lg p-8 border border-lavender-100 animate-slide-up">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-lavender-400 to-lavender-600 flex items-center justify-center shadow-glow">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Student Registration</h1>
          <p className="text-sm text-slate-400 mt-1">Create your account with face enrollment</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: 'details', label: 'Details' },
            { key: 'capture', label: 'Face Photo' },
            { key: 'submit',  label: 'Confirm' },
          ].map(({ key, label }, idx) => {
            const stepIdx = STEPS.indexOf(step);
            const thisIdx = STEPS.indexOf(key);
            const isActive = step === key;
            const isDone   = stepIdx > thisIdx;
            return (
              <div key={key} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 ${idx > 0 ? 'flex-1' : ''}`}>
                  {idx > 0 && (
                    <div className={`flex-1 h-0.5 ${isDone ? 'bg-lavender-400' : 'bg-slate-200'}`} />
                  )}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                    ${isActive ? 'bg-lavender-500 text-white' :
                      isDone   ? 'bg-lavender-400 text-white' :
                                 'bg-slate-200 text-slate-500'}`}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                </div>
                <span className={`ml-1.5 text-xs font-medium flex-shrink-0 ${isActive ? 'text-lavender-600' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ─── STEP 1: Details ──────────────────────────────────────── */}
        {step === 'details' && (
          <form onSubmit={handleDetailsNext} className="space-y-4 animate-fade-in">
            <div className="form-group">
              <label htmlFor="name" className="label">Full Name</label>
              <input id="name" name="name" type="text" placeholder="Alex Johnson"
                value={form.name} onChange={handleChange} className="input" disabled={loading} />
            </div>
            <div className="form-group">
              <label htmlFor="username" className="label">Username</label>
              <input id="username" name="username" type="text" placeholder="alex_j"
                value={form.username} onChange={handleChange} className="input" disabled={loading} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label htmlFor="password" className="label">Password</label>
                <input id="password" name="password" type="password" placeholder="Min 6 chars"
                  value={form.password} onChange={handleChange} className="input" disabled={loading} />
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword" className="label">Confirm</label>
                <input id="confirmPassword" name="confirmPassword" type="password" placeholder="Repeat"
                  value={form.confirmPassword} onChange={handleChange} className="input" disabled={loading} />
              </div>
            </div>
            {error && (
              <div className="alert-error animate-fade-in">
                <span>{error}</span>
              </div>
            )}
            <button type="submit" className="btn-primary w-full" id="student-details-next-btn">
              Next: Take Face Photo →
            </button>
          </form>
        )}

        {/* ─── STEP 2: Webcam Capture ───────────────────────────────── */}
        {step === 'capture' && (
          <div className="space-y-4 animate-fade-in">
            <div className="alert-info text-xs">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Position your face clearly in the frame. Ensure good lighting and look directly at the camera.</span>
            </div>

            {camError ? (
              <div className="alert-error">{camError}</div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                {/* Face guide overlay */}
                {camActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-48 border-2 border-dashed border-lavender-300 rounded-[50%] opacity-60" />
                  </div>
                )}
                {!camActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="spinner w-8 h-8 border-2 border-white/30 border-t-white" />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { stopCamera(); setStep('details'); }} className="btn-secondary flex-1">
                ← Back
              </button>
              <button onClick={capturePhoto} disabled={!camActive} className="btn-primary flex-1" id="capture-photo-btn">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Capture Photo
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Review & Submit ─────────────────────────────── */}
        {step === 'submit' && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center">
              <p className="text-sm text-slate-500 mb-3">Review your face photo before submitting:</p>
              {capturedImage && (
                <div className="relative inline-block">
                  <img
                    src={capturedImage}
                    alt="Captured face"
                    className="w-40 h-40 object-cover rounded-2xl shadow-card mx-auto border-2 border-lavender-200"
                  />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-mint-400 rounded-full
                                  flex items-center justify-center text-white text-sm shadow">✓</div>
                </div>
              )}
            </div>

            <div className="bg-lavender-50 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Name</span>
                <span className="font-medium text-slate-700">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Username</span>
                <span className="font-medium text-slate-700">{form.username.toLowerCase()}</span>
              </div>
            </div>

            {error && <div className="alert-error animate-fade-in"><span>{error}</span></div>}
            {success && <div className="alert-success animate-fade-in"><span>{success}</span></div>}

            <div className="flex gap-3">
              <button onClick={retakePhoto} className="btn-secondary flex-1" disabled={loading}>
                ↺ Retake
              </button>
              <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1" id="student-register-submit-btn">
                {loading ? (
                  <><span className="spinner" /><span>Enrolling...</span></>
                ) : (
                  <span>Create Account ✓</span>
                )}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-slate-400 mt-6">
          Already registered?{' '}
          <Link to="/login" className="text-lavender-600 font-medium hover:text-lavender-700 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
