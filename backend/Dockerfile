# ============================================================
#  Snap Attendance - Backend Production Dockerfile (Render)
# ============================================================

FROM python:3.10-bullseye

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    gfortran \
    git \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgl1-mesa-dev \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy prebuilt wheels
COPY wheels/ /app/wheels/

COPY requirements.txt .

# Install dlib from prebuilt wheel, then rest of dependencies
RUN pip install --no-cache-dir "setuptools<70.0.0" wheel && \
    if ls /app/wheels/dlib*.whl 1>/dev/null 2>&1; then \
    pip install --no-cache-dir /app/wheels/dlib*.whl; \
    fi && \
    pip install --no-cache-dir --no-deps face_recognition==1.3.0 && \
    pip install --no-cache-dir git+https://github.com/ageitgey/face_recognition_models && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]