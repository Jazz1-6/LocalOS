#!/usr/bin/env bash
set -e
echo "==> Building LocalOS"
cargo fetch
cargo build
cargo test
echo "✅ Done"