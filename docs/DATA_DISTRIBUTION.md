# Data Distribution Strategy

## Overview

uteki.open provides **two data acquisition modes** for first-time users:

1. **Quick Start** (推荐): Download pre-packaged seed data
2. **Live Fetch**: Download latest data from APIs (requires API keys)

---

## Quick Start Mode (Recommended)

### What's Included

Pre-packaged data bundle (~500MB compressed):
- **Crypto**: BTC, ETH daily K-lines (3 years)
- **Stocks**: SP500 constituent stocks daily K-lines (10 years)
- **Financials**: Basic financial statements (5 years)
- **On-chain**: BTC/ETH daily metrics (1 year)

**Data Currency**: Updated monthly (e.g., 2024-01 release contains data up to 2023-12-31)

### Usage

```bash
# 1. Download seed data bundle
poetry run python scripts/download_seed_data.py

# Output:
# Downloading uteki-seed-data-2024-01.tar.gz (523 MB)...
# [====================] 100%

# 2. Import to databases
poetry run python scripts/import_seed_data.py

# Output:
# Importing klines to ClickHouse... ✓ (2.3M rows)
# Importing financials to PostgreSQL... ✓ (15K rows)
# Total time: 5m 32s
```

**Time**: ~10 minutes
**Requirements**: None (no API keys needed)

---

## Live Fetch Mode

### What's Included

Download **latest data** directly from APIs:
- FMP API: Stock K-lines, financials, filings
- OKX/Binance API: Crypto K-lines
- Glassnode: On-chain metrics (optional)

### Usage

```bash
# 1. Configure API keys in .env
cat > backend/.env <<EOF
FMP_API_KEY=your_fmp_key
OKX_API_KEY=your_okx_key  # optional
GLASSNODE_API_KEY=your_key  # optional
EOF

# 2. Fetch latest data
poetry run python scripts/seed_data_live.py

# Output:
# Fetching BTC-USDT 3y daily K-lines from OKX... ✓ (1095 rows)
# Fetching AAPL 10y daily K-lines from FMP... ✓ (2520 rows)
# [Progress: 50/505 stocks]
# Total time: 45m 12s
```

**Time**: ~30-60 minutes
**Requirements**: FMP API key (free tier: 250 requests/day)

---

## Comparison

| Feature | Quick Start | Live Fetch |
|---------|-------------|------------|
| **Speed** | 5-10 min | 30-60 min |
| **API Key** | Not required | Required |
| **Data Currency** | Up to 1 month old | Real-time |
| **Network** | Single file download | 1000+ API calls |
| **Rate Limits** | No limits | FMP free: 250/day |
| **Recommended For** | First-time users, testing | Production, latest data |

---

## Data Update Strategy

### After Initial Seed

Once seeded (either mode), **daily updates** run automatically:

```python
# APScheduler job (runs daily at UTC 00:00)
async def daily_update():
    # Update yesterday's K-lines
    await update_crypto_klines(date=yesterday)
    await update_stock_klines(date=yesterday)
    # Only 1-2 API calls per asset, within free tier
```

**Incremental updates are always live** (no pre-packaged daily data).

---

## Implementation

### Seed Data Package Structure

```
uteki-seed-data-2024-01.tar.gz
├── klines/
│   ├── crypto_btc_3y.parquet      (BTC 3y daily)
│   ├── crypto_eth_3y.parquet      (ETH 3y daily)
│   ├── stocks_sp500_10y.parquet   (SP500 10y daily)
│   └── metadata.json              (symbols, date ranges)
├── financials/
│   ├── income_statements.parquet
│   ├── balance_sheets.parquet
│   └── cash_flows.parquet
├── onchain/
│   ├── btc_metrics_1y.parquet
│   └── eth_metrics_1y.parquet
└── README.txt                     (data description)
```

**Format**: Parquet (columnar, ~10x compression vs CSV)
**Storage**: GitHub Releases or S3 bucket

---

### Download Script

```python
# scripts/download_seed_data.py
import requests
from tqdm import tqdm

RELEASE_URL = "https://github.com/uteki/uteki-seed-data/releases/latest/download"
SEED_FILE = "uteki-seed-data-2024-01.tar.gz"

def download_seed_data():
    url = f"{RELEASE_URL}/{SEED_FILE}"

    # Download with progress bar
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))

    with open(SEED_FILE, 'wb') as f:
        with tqdm(total=total_size, unit='B', unit_scale=True) as pbar:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                pbar.update(len(chunk))

    print(f"✓ Downloaded {SEED_FILE}")
```

---

### Import Script

```python
# scripts/import_seed_data.py
import pandas as pd
import tarfile
from clickhouse_driver import Client

def import_seed_data():
    # Extract archive
    with tarfile.open("uteki-seed-data-2024-01.tar.gz", "r:gz") as tar:
        tar.extractall("seed_data/")

    # Import to ClickHouse
    ch = Client(host="localhost", database="uteki")

    # Import crypto K-lines
    df = pd.read_parquet("seed_data/klines/crypto_btc_3y.parquet")
    ch.insert_dataframe("INSERT INTO klines VALUES", df)
    print(f"✓ Imported {len(df)} BTC K-lines")

    # Import stock K-lines
    df = pd.read_parquet("seed_data/klines/stocks_sp500_10y.parquet")
    ch.insert_dataframe("INSERT INTO klines VALUES", df)
    print(f"✓ Imported {len(df)} stock K-lines")

    # ... (financials, on-chain, etc.)
```

---

## Hosting Strategy

### Option 1: GitHub Releases (Free, Recommended)
- ✅ Free CDN bandwidth
- ✅ Version control
- ⚠️ Max file size: 2GB per file (sufficient)

```bash
# Release process
gh release create v2024.01 \
  uteki-seed-data-2024-01.tar.gz \
  --title "Seed Data - January 2024" \
  --notes "BTC/ETH 3y, SP500 10y, updated to 2023-12-31"
```

### Option 2: AWS S3 + CloudFront (Paid)
- ✅ Unlimited size
- ✅ Global CDN
- ❌ Costs ~$5-10/month

---

## Monthly Update Process

1. **Automated Pipeline** (GitHub Actions):
   ```yaml
   # .github/workflows/generate-seed-data.yml
   on:
     schedule:
       - cron: '0 0 1 * *'  # First day of each month

   jobs:
     generate:
       - Fetch latest data from APIs
       - Generate Parquet files
       - Compress to .tar.gz
       - Upload to GitHub Releases
   ```

2. **User Update**:
   ```bash
   # Check for updates
   poetry run python scripts/check_seed_updates.py

   # Output:
   # Current version: 2024-01
   # Latest version: 2024-02 (released 2024-02-01)
   # Run: poetry run python scripts/download_seed_data.py
   ```

---

## Advantages of This Approach

1. **Lower Barrier to Entry**
   - New users can try without API keys
   - Fast setup (10 min vs 60 min)

2. **Reduced API Load**
   - Only incremental updates hit APIs
   - No 1000+ requests on first start

3. **Offline Capability**
   - Download once, use offline
   - Great for demos, testing

4. **Cost Savings for Users**
   - Free tier API limits not exhausted
   - No Glassnode subscription needed initially

5. **Reliable Onboarding**
   - No API rate limit failures
   - Consistent experience for all users

---

## Recommendation

**For uteki.open MVP**:
1. ✅ Implement Quick Start with pre-packaged data
2. ✅ Also support Live Fetch for advanced users
3. ✅ Default to Quick Start in documentation
4. ✅ Monthly seed data releases on GitHub

**Data Freshness Trade-off**:
- Initial data: Up to 1 month old (acceptable for testing)
- Daily updates: Real-time (once operational)
- Users can always re-run Live Fetch for latest historical data

---

## Next Steps

1. Week 5: Implement `seed_data_live.py` (API-based)
2. Week 5: Generate first seed data package
3. Week 5: Implement `download_seed_data.py`
4. Week 6: Set up GitHub Actions for monthly updates
5. Week 13: Document both modes in user guide
