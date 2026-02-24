FROM python:3.12-slim

# Fairy-Stockfish をビルド
RUN apt-get update && \
    apt-get install -y --no-install-recommends git g++ make && \
    git clone --depth 1 https://github.com/fairy-stockfish/Fairy-Stockfish.git /tmp/fs && \
    cd /tmp/fs/src && \
    make -j$(nproc) build ARCH=x86-64 && \
    mv /tmp/fs/src/stockfish /usr/local/bin/fairy-stockfish && \
    rm -rf /tmp/fs && \
    apt-get purge -y git g++ make && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV ENGINE_PATH=/usr/local/bin/fairy-stockfish
ENV ENGINE_DEPTH=12

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
