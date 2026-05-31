/**
 * pages/NotFoundPage.jsx — 404 Page
 */
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="auth-wrapper">
      <div className="auth-card text-center">
        <div className="text-8xl mb-4">🔍</div>
        <h1 className="text-4xl font-bold text-slate-800 mb-2">404</h1>
        <p className="text-slate-400 mb-6">This page doesn't exist.</p>
        <Link to="/" className="btn-primary inline-flex">← Go Home</Link>
      </div>
    </div>
  );
}
