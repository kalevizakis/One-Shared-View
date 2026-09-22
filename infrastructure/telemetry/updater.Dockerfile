FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir psycopg2-binary==2.9.*
COPY update-server.py update-dashboard.py pricing.py ./

EXPOSE 4319

CMD ["python", "update-server.py"]
