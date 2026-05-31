import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database import get_supabase_client

async def main():
    client = get_supabase_client()
    try:
        # Check teachers table
        teachers = client.table("teachers").select("teacher_id, username, name").limit(5).execute()
        print("Teachers:", teachers.data)
        
        # Check students table
        students = client.table("students").select("student_id, username, name").limit(5).execute()
        print("Students:", students.data)
        
        # Check subjects table
        subjects = client.table("subjects").select("subject_id, name").limit(5).execute()
        print("Subjects:", subjects.data)
        
        # Check enrollments vs subject_students
        try:
            enrollments = client.table("enrollments").select("*").limit(5).execute()
            print("Enrollments table exists! Data:", enrollments.data)
        except Exception as e:
            print("Enrollments table error:", e)
            
        try:
            subject_students = client.table("subject_students").select("*").limit(5).execute()
            print("Subject_students table exists! Data:", subject_students.data)
        except Exception as e:
            print("Subject_students table error:", e)

    except Exception as exc:
        print("Error connecting/querying:", exc)

if __name__ == "__main__":
    asyncio.run(main())
