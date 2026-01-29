FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY pyproject.toml poetry.lock* ./

# 安装 Poetry 和依赖
RUN pip install poetry && \
    poetry config virtualenvs.create false && \
    poetry install --without dev --no-root --no-interaction --no-ansi

# 复制应用代码
COPY . .

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# 运行数据库迁移和启动服务
CMD python -m uteki.scripts.init_db && \
    uvicorn uteki.main:app --host 0.0.0.0 --port $PORT
