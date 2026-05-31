/**
 * App.jsx — Root Application with React Router
 * ==============================================
 * Route structure:
 *   /                     → redirect based on role
 *   /login                → unified login page (teacher & student)
 *   /register/teacher     → teacher registration
 *   /register/student     → student registration (with webcam capture)
 *   /dashboard            → teacher dashboard (protected)
 *   /dashboard/subjects   → teacher subjects list
 *   /dashboard/subjects/new → create subject
 *   /dashboard/attendance/:subjectId → process attendance
 *   /portal               → student portal (protected)
 *   /enroll/:subjectId    → student enrollment page
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages (lazy-loaded below)
import LoginPage            from './pages/LoginPage';
import TeacherRegisterPage  from './pages/TeacherRegisterPage';
import StudentRegisterPage  from './pages/StudentRegisterPage';
import TeacherDashboard     from './pages/TeacherDashboard';
import SubjectsPage         from './pages/SubjectsPage';
import AttendancePage       from './pages/AttendancePage';
import StudentPortal        from './pages/StudentPortal';
import EnrollPage           from './pages/EnrollPage';
import NotFoundPage         from './pages/NotFoundPage';


// ── Protected Route wrapper ───────────────────────────────────────────────────
function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated — redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    console.log(
      `[ProtectedRoute] Role mismatch: required=${requiredRole}, actual=${user?.role}`
    );
    // Redirect to the correct dashboard for their role
    return <Navigate to={user?.role === 'teacher' ? '/dashboard' : '/portal'} replace />;
  }

  return children;
}

// ── Root redirect ─────────────────────────────────────────────────────────────
function RootRedirect() {
  const { isAuthenticated, isTeacher, isStudent } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isTeacher)        return <Navigate to="/dashboard" replace />;
  if (isStudent)        return <Navigate to="/portal" replace />;
  return <Navigate to="/login" replace />;
}

// ── Router ────────────────────────────────────────────────────────────────────
function AppRouter() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"                    element={<RootRedirect />} />
      <Route path="/login"               element={<LoginPage />} />
      <Route path="/register/teacher"    element={<TeacherRegisterPage />} />
      <Route path="/register/student"    element={<StudentRegisterPage />} />
      <Route path="/enroll/:subjectId"   element={<EnrollPage />} />

      {/* Teacher — protected */}
      <Route path="/dashboard" element={
        <ProtectedRoute requiredRole="teacher">
          <TeacherDashboard />
        </ProtectedRoute>
      } />
      <Route path="/dashboard/subjects" element={
        <ProtectedRoute requiredRole="teacher">
          <SubjectsPage />
        </ProtectedRoute>
      } />
      <Route path="/dashboard/attendance/:subjectId" element={
        <ProtectedRoute requiredRole="teacher">
          <AttendancePage />
        </ProtectedRoute>
      } />

      {/* Student — protected */}
      <Route path="/portal" element={
        <ProtectedRoute requiredRole="student">
          <StudentPortal />
        </ProtectedRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
