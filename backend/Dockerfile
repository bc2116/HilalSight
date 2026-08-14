FROM python:3.13.14-slim-trixie

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --system --gid 10001 hilalsight \
    && useradd --system --uid 10001 --gid hilalsight --home-dir /app --shell /usr/sbin/nologin hilalsight \
    && mkdir -p /app/data/skyfield /app/.cache \
    && chown -R hilalsight:hilalsight /app

COPY --chown=hilalsight:hilalsight app ./app
COPY --chmod=0555 docker-entrypoint.py /usr/local/bin/hilalsight-entrypoint

EXPOSE 8000

ENTRYPOINT ["hilalsight-entrypoint"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
