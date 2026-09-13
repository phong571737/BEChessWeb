FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*
ENV STOCKFISH_PATH=/usr/games/stockfish

COPY recover_service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY recover_service/app ./recover_service/app
COPY recover_service_v4/*.py ./recover_service_v4/

EXPOSE 8000

CMD ["uvicorn", "recover_service.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
