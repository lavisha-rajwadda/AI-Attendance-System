# Use a highly optimized, lightweight Python base
FROM python:3.10-slim-bullseye

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# Only install the bare minimum system requirements for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Security: Non-root user
RUN useradd -m -u 1000 user
ENV PATH="/home/user/.local/bin:${PATH}"
RUN chown -R user:user /app
USER user

RUN pip install --no-cache-dir --upgrade pip wheel

# ==========================================
# THE MAGIC FIX: ZERO-COMPILATION DLIB
# ==========================================
# 1. Install the pre-compiled dlib binary (Takes 3 seconds, 0 memory issues)
RUN pip install --no-cache-dir dlib-bin==19.24.2

# 2. Install face_recognition without dependencies so it doesn't try to re-download the old dlib
RUN pip install --no-cache-dir --no-deps face_recognition face_recognition_models click

# Install your remaining backend requirements
COPY --chown=user:user backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your app logic
COPY --chown=user:user backend/ .

EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]