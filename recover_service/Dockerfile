FROM python:3.12-slim

WORKDIR /app

COPY recover_service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY recover_service ./recover_service
COPY recover_service_v3 ./recover_service_v3

EXPOSE 8000

CMD ["uvicorn", "recover_service.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
