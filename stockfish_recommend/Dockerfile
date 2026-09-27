FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STOCKFISH_PATH=/usr/games/stockfish

WORKDIR /service

RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && /usr/games/stockfish bench 1 1 1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 api

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

USER api
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
