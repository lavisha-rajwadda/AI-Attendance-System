import { useState, useRef } from 'react';
import { attendanceAPI } from '../api/client';

export default function TakeAttendanceModal({ subjects, onClose }) {
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processErr, setProcessErr] = useState('');
  const [report, setReport] = useState(null);
  const [editedRecords, setEditedRecords] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const combined = [...photos, ...files];
    if (combined.length > 5) {
      alert('Maximum 5 photos allowed.');
      setPhotos(combined.slice(0, 5));
    } else {
      setPhotos(combined);
    }
    setProcessErr('');
    e.target.value = '';
  };

  const removePhoto = (index) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
    if (!selectedSubjectId) {
      setProcessErr('Please select a course.');
      return;
    }
    if (photos.length === 0) {
      setProcessErr('Please upload at least one photo.');
      return;
    }
    setProcessing(true);
    setProcessErr('');
    setReport(null);
    console.log(`[TakeAttendanceModal] Starting face analysis for subject ${selectedSubjectId} with ${photos.length} photo(s)...`);

    try {
      const { data } = await attendanceAPI.process(selectedSubjectId, photos);
      console.log('[TakeAttendanceModal] ✅ ML report received:', data);
      setReport(data);
      setEditedRecords(data.records.map((r) => ({ ...r })));
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Analysis failed. Make sure students with valid face embeddings are enrolled in the course.';
      console.error('[TakeAttendanceModal] ML processing error:', err.response?.data);
      setProcessErr(msg);
    } finally {
      setProcessing(false);
    }
  };

  const togglePresence = (studentId) => {
    setEditedRecords((prev) =>
      prev.map((r) =>
        r.student_id === studentId ? { ...r, is_present: !r.is_present } : r
      )
    );
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await attendanceAPI.confirm({
        subject_id: selectedSubjectId,
        records: editedRecords,
      });
      setConfirmed(true);
    } catch (err) {
      console.error('[TakeAttendanceModal] Confirm failed:', err.response?.data);
      alert(err.response?.data?.message || err.response?.data?.detail || 'Failed to save attendance.');
    } finally {
      setConfirming(false);
    }
  };

  const presentCount = editedRecords.filter((r) => r.is_present).length;
  const totalCount = editedRecords.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-glow-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1.5" id="close-attendance-modal-btn">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-slate-800 mb-5">Take Attendance</h2>

        {confirmed ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-mint-100 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-mint-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Attendance Saved Successfully!</h3>
            <p className="text-sm text-slate-500">
              Headcount: <strong className="text-mint-600 font-bold" id="saved-headcount-text">{presentCount} present students out of {totalCount} total students</strong>.
            </p>
            <button onClick={onClose} className="btn-primary px-6 py-2 mt-4" id="finished-modal-btn">
              Close Window
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Select Course */}
            <div>
              <label className="label text-slate-700 font-semibold mb-2">1) Select Course</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setReport(null);
                  setEditedRecords([]);
                  setProcessErr('');
                }}
                className="input w-full"
                disabled={processing}
                id="modal-select-course"
              >
                <option value="">-- Choose a Course --</option>
                {subjects.map((subj) => (
                  <option key={subj.subject_id} value={subj.subject_id}>
                    {subj.subject_code} - {subj.name} (§ {subj.section})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Upload Pictures (max 5) */}
            <div>
              <label className="label text-slate-700 font-semibold mb-2">2) Upload Pictures (Maximum 5)</label>
              <div
                onClick={() => !processing && fileInputRef.current?.click()}
                className={`border-2 border-dashed border-slate-200 rounded-2xl p-6
                            flex flex-col items-center justify-center cursor-pointer
                            hover:border-lavender-400 hover:bg-lavender-50/50
                            transition-all duration-200 ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="w-12 h-12 bg-lavender-100 rounded-xl flex items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-lavender-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">Click to select classroom pictures</p>
                <p className="text-xs text-slate-400 mt-0.5">Up to 5 pictures maximum</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={processing}
                  id="modal-photo-upload"
                />
              </div>

              {/* Picture previews */}
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-4">
                  {photos.map((file, i) => {
                    const url = URL.createObjectURL(file);
                    return (
                      <div key={i} className="relative group">
                        <img src={url} alt={`Preview ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-xl border border-lavender-100" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-rose-400 text-white rounded-full
                                     text-xs flex items-center justify-center"
                        >✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3: Run Face Analysis */}
            <div>
              <label className="label text-slate-700 font-semibold mb-2">3) Run Face Analysis</label>
              <button
                type="button"
                onClick={handleProcess}
                disabled={processing || !selectedSubjectId || photos.length === 0}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                id="modal-run-analysis-btn"
              >
                {processing ? (
                  <>
                    <span className="spinner" />
                    <span>Running face analysis using SVM/SVC model...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Run Face Analysis ({photos.length} photo{photos.length !== 1 ? 's' : ''})</span>
                  </>
                )}
              </button>
            </div>

            {processErr && (
              <div className="alert-error animate-fade-in">
                <span>{processErr}</span>
              </div>
            )}

            {/* Face analysis results */}
            {report && (
              <div className="border-t border-slate-100 pt-5 space-y-4">
                {/* Headcount banner */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    AI Face Recognition Result
                  </span>
                  <div className="text-xl font-bold text-slate-800">
                    Headcount: <span className="text-lavender-600 font-bold" id="headcount-value">{presentCount} present students out of {totalCount} total students</span>
                  </div>
                </div>

                {/* Student list */}
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="table w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                        <th className="px-4 py-2 text-left">Student</th>
                        <th className="px-4 py-2 text-left">Confidence</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedRecords.map((record) => {
                        const pct = record.confidence ? Math.round(record.confidence * 100) : null;
                        return (
                          <tr key={record.student_id} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-3 font-medium text-slate-700">{record.name}</td>
                            <td className="px-4 py-3">
                              {pct != null ? (
                                <span className={`badge text-xs px-2 py-0.5 rounded-full ${pct >= 80 ? 'bg-mint-100 text-mint-600' : 'bg-lavender-100 text-lavender-600'}`}>
                                  {pct}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {record.is_present ? (
                                <span className="badge-present bg-mint-100 text-mint-700 px-2.5 py-1 rounded-full font-medium text-xs">Present</span>
                              ) : (
                                <span className="badge-absent bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full font-medium text-xs">Absent</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => togglePresence(record.student_id)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${record.is_present ? 'bg-mint-400' : 'bg-slate-200'}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${record.is_present ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 justify-end pt-3">
                  <button type="button" onClick={onClose} className="btn-secondary px-5 py-2">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="btn-primary px-6 py-2"
                    id="modal-confirm-save-btn"
                  >
                    {confirming ? <><span className="spinner" /><span>Saving...</span></> : 'Confirm & Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
