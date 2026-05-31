import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database import get_supabase_client
from utils.auth import hash_password, verify_password

async def test_teacher_flow():
    client = get_supabase_client()
    username = "diag_teacher_2"
    password = "password123"
    
    # 1. Check if exists and delete
    try:
        client.table("teachers").delete().eq("username", username).execute()
        print("Cleaned up existing test teacher.")
    except Exception as e:
        print("Cleanup error:", e)
        
    # 2. Hash password
    h = hash_password(password)
    
    # 3. Register
    try:
        row = {
            "username": username,
            "password_hash": h,
            "name": "Diagnostic Teacher"
        }
        res = client.table("teachers").insert(row).execute()
        print("Teacher Insert response:", res.data)
        inserted_id = res.data[0]["teacher_id"]
    except Exception as e:
        print("Teacher Insert failed:", e)
        return
        
    # 4. Fetch and Verify
    try:
        user = client.table("teachers").select("*").eq("username", username).limit(1).execute()
        if not user.data:
            print("Failed to fetch teacher after insert.")
            return
        user_row = user.data[0]
        print("Fetched teacher row:", user_row)
        match = verify_password(password, user_row["password_hash"])
        print("Password matches?", match)
    except Exception as e:
        print("Teacher verification failed:", e)

async def test_student_flow():
    client = get_supabase_client()
    username = "diag_student_2"
    password = "password123"
    
    # 1. Clean up
    try:
        client.table("students").delete().eq("username", username).execute()
        print("Cleaned up existing test student.")
    except Exception as e:
        print("Cleanup error:", e)
        
    # 2. Hash password
    h = hash_password(password)
    
    # 3. Register
    try:
        row = {
            "username": username,
            "password_hash": h,
            "name": "Diagnostic Student",
            "face_embedding": [0.1] * 128
        }
        res = client.table("students").insert(row).execute()
        print("Student Insert response:", res.data)
        inserted_id = res.data[0]["student_id"]
    except Exception as e:
        print("Student Insert failed:", e)
        return
        
    # 4. Fetch and Verify
    try:
        user = client.table("students").select("*").eq("username", username).limit(1).execute()
        if not user.data:
            print("Failed to fetch student after insert.")
            return
        user_row = user.data[0]
        print("Fetched student row:", user_row)
        match = verify_password(password, user_row["password_hash"])
        print("Password matches?", match)
    except Exception as e:
        print("Student verification failed:", e)

async def main():
    print("--- Testing Teacher ---")
    await test_teacher_flow()
    print("\n--- Testing Student ---")
    await test_student_flow()

if __name__ == "__main__":
    asyncio.run(main())
