# Slim serving image. The trained model.pkl is baked in at build time (the CI
# retrain workflow trains, then builds this image with the fresh model). At
# runtime you can instead point MODEL_URI at the MLflow registry to hot-swap
# without rebuilding.
FROM python:3.11-slim

WORKDIR /app

# Serving-only deps (no lightgbm/mlflow) keep the image small. The GLM model
# needs only scikit-learn; if your Production model is lightgbm, add it here.
COPY requirements-serve.txt .
RUN pip install --no-cache-dir -r requirements-serve.txt

COPY models.py serve.py ./
COPY model.pkl ./model.pkl

ENV MODEL_PATH=/app/model.pkl PORT=8080
EXPOSE 8080

# Cloud Run sets $PORT; default 8080 for local runs.
CMD ["sh", "-c", "uvicorn serve:app --host 0.0.0.0 --port ${PORT:-8080}"]
