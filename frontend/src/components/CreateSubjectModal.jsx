import { useState } from 'react';
import { subjectsAPI } from '../api/client';

export default function CreateSubjectModal({ onClose, onCreated }) {
  const [form,    setForm]    = useState({ subject_code: '', name: '', section: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleChange = (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject_code || !form.name || !form.section) {
      setError('All fields are required.'); return;
    }
    setLoading(true);
    console.log('[CreateSubjectModal] Creating subject:', form);
    try {
      const { data } = await subjectsAPI.create(form);
      console.log('[CreateSubjectModal] ✅ Subject created:', data.subject_id);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to create subject.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-glow-lg p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-800">New Subject</h2>
          <button onClick={onClose} className="btn-ghost p-1.5" id="close-create-subject-modal-btn">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="label">Subject Code</label>
            <input name="subject_code" type="text" placeholder="CS101" value={form.subject_code}
              onChange={handleChange} className="input" disabled={loading} id="create-subject-code-input" />
          </div>
          <div className="form-group">
            <label className="label">Subject Name</label>
            <input name="name" type="text" placeholder="Introduction to Computer Science"
              value={form.name} onChange={handleChange} className="input" disabled={loading} id="create-subject-name-input" />
          </div>
          <div className="form-group">
            <label className="label">Section</label>
            <input name="section" type="text" placeholder="A" value={form.section}
              onChange={handleChange} className="input" disabled={loading} id="create-subject-section-input" />
          </div>

          {error && <div className="alert-error"><span>{error}</span></div>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1" id="create-subject-submit-btn">
              {loading ? <><span className="spinner" /><span>Creating...</span></> : 'Create Subject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
