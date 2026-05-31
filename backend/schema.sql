-- ============================================================
--  Snap Attendance — Supabase Database Schema
--  Run this in the Supabase SQL Editor to create all tables.
-- ============================================================

-- Enable UUID extension (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ──────────────────────────────────────────────────────────────
-- TABLE: teachers
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
    teacher_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE teachers IS 'Teacher accounts. Passwords are bcrypt-hashed.';


-- ──────────────────────────────────────────────────────────────
-- TABLE: students
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    student_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username       TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    name           TEXT NOT NULL,
    face_embedding JSONB,          -- 128-element float array from dlib ResNet
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE students IS 'Student accounts with face embeddings for recognition.';
COMMENT ON COLUMN students.face_embedding IS '128D float vector: face_recognition.face_encodings()[0].tolist()';


-- ──────────────────────────────────────────────────────────────
-- TABLE: subjects
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    subject_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_code TEXT NOT NULL,
    name         TEXT NOT NULL,
    section      TEXT NOT NULL,
    teacher_id   UUID NOT NULL REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE subjects IS 'Subjects/courses created by teachers.';
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON subjects(teacher_id);


-- ──────────────────────────────────────────────────────────────
-- TABLE: enrollments
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id    UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    enrolled_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (subject_id, student_id)   -- prevent duplicate enrollments
);

COMMENT ON TABLE enrollments IS 'Many-to-many: students enrolled in subjects.';
CREATE INDEX IF NOT EXISTS idx_enrollments_subject_id ON enrollments(subject_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);


-- ──────────────────────────────────────────────────────────────
-- TABLE: attendance_logs
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id  UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    is_present  BOOLEAN NOT NULL DEFAULT FALSE,
    confidence  FLOAT,             -- SVM + Euclidean combined confidence (0–1)
    timestamp   TIMESTAMPTZ NOT NULL,   -- Server-generated session timestamp
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE attendance_logs IS 'Permanent attendance records, one row per student per session.';
CREATE INDEX IF NOT EXISTS idx_attendance_logs_subject_id ON attendance_logs(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_student_id ON attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_timestamp  ON attendance_logs(timestamp);
