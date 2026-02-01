# uteki Backend

uteki.open的FastAPI后端服务。

## 快速启动

```bash
# SQLite模式（推荐，零依赖）
cd ..
./scripts/quickstart-sqlite.sh

# 或手动启动
poetry install
poetry run python -m uteki.main
```

## 数据库模式

- **SQLite** (开发): 文件数据库，零配置
- **PostgreSQL** (生产): 在线数据库，高性能

## 文档

查看项目根目录的文档：
- [QUICKSTART.md](../QUICKSTART.md)
- [START_GUIDE.md](../START_GUIDE.md)
- [DEPLOYMENT_MODES.md](../DEPLOYMENT_MODES.md)
