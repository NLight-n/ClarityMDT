FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5100

# 2 Gunicorn workers = max 2 concurrent MPR jobs
# 600s timeout = allow up to 10 minutes per job
CMD ["gunicorn", "--bind", "0.0.0.0:5100", "--workers", "2", "--timeout", "600", "app:app"]
