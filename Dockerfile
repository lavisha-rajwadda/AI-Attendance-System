FROM python:3.10-bullseye

# Optimize Python environment runtime configurations
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# Install system dependencies required for compiling dlib and running OpenCV
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

# MANDATORY HUGGING FACE SECURITY: Configure a non-root system user
RUN useradd -m -u 1000 user
ENV PATH="/home/user/.local/bin:${PATH}"
RUN chown -R user:user /app

USER user

# Upgrade foundational package installation tools
RUN pip install --no-cache-dir --upgrade pip "setuptools<70.0.0" wheel

# Install core face recognition ecosystem dependencies from source
RUN pip install --no-cache-dir dlib==19.24.2 && \
    pip install --no-cache-dir --no-deps face_recognition==1.3.0 && \
    pip install --no-cache-dir git+https://github.com

# Copy requirements block with explicit user permissions
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all remaining repository directories and python source scripts
COPY --chown=user:user . .

# Hugging Face Spaces route public internet web traffic through port 7860
EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]