import { useState, useEffect } from 'react';
import { subjectsAPI } from '../api/client';

export default function ShareModal({ subject, onClose }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    console.log('[ShareModal] Fetching QR for subject_id:', subject.subject_id);
    subjectsAPI.getQR(subject.subject_id)
      .then(({ data }) => {
        console.log('[ShareModal] ✅ QR received.');
        setQrData(data);
      })
      .catch((err) => {
        setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to generate QR code.');
        console.error('[ShareModal] Error:', err.response?.data);
      })
      .finally(() => setLoading(false));
  }, [subject.subject_id]);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        if (type === 'code') {
          setCopiedCode(true);
          setTimeout(() => setCopiedCode(false), 2000);
        } else {
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
        }
      })
      .catch((err) => console.error('Failed to copy:', err));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-glow-lg p-6 animate-slide-up">
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1.5" id="close-share-modal-btn">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-slate-800 mb-1">Share Subject</h2>
        <p className="text-sm text-slate-500 mb-6">{subject.name} ({subject.section})</p>

        {loading && (
          <div className="flex justify-center py-12">
            <span className="spinner w-8 h-8" />
          </div>
        )}
        {error && <div className="alert-error mb-4"><span>{error}</span></div>}

        {qrData && (
          <div className="space-y-6">
            {/* Method 1: QR Code */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Method 1: Scan QR Code
              </span>
              <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-card">
                <img
                  src={qrData.qr_code_base64}
                  alt="Enrollment QR"
                  className="w-44 h-44 object-contain"
                  id="share-qr-image"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Students scan this QR code to enroll</p>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-4">
              {/* Method 2: Subject Code */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Method 2: Use Subject Code
                </span>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-mono text-slate-700 font-bold flex items-center justify-between">
                    <span id="share-subject-code-value">{subject.subject_code}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(subject.subject_code, 'code')}
                    className="btn-secondary text-xs px-4 whitespace-nowrap"
                    id="copy-subject-code-btn"
                  >
                    {copiedCode ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Method 3: Enrollment Link */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Method 3: Share Enrollment Link
                </span>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-mono text-slate-500 truncate flex items-center">
                    <span id="share-enrollment-link-value">{qrData.enrollment_link}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(qrData.enrollment_link, 'link')}
                    className="btn-secondary text-xs px-4 whitespace-nowrap"
                    id="copy-enrollment-link-btn"
                  >
                    {copiedLink ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
