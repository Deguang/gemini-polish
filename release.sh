#!/bin/bash

# Gemini Polish | Typography & Pro Diagramming Release Script
# 使用方法: 
#   bash release.sh               (打包并上传)
#   bash release.sh --upload-only (仅上传 release/ 下最新的 zip)

set -e

# 1. 提取版本号 (从 manifest.json)
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
RELEASE_DIR="release"

# 参数检查
UPLOAD_ONLY=false
if [[ "$1" == "--upload-only" ]]; then
    UPLOAD_ONLY=true
fi

if [ "$UPLOAD_ONLY" = false ]; then
    ZIP_NAME="gemini-graph-viewer-v$VERSION.zip"
    ZIP_PATH="$RELEASE_DIR/$ZIP_NAME"

    echo "🚀 Preparing release for v$VERSION..."

    # 2. 创建并清理 release 目录
    mkdir -p "$RELEASE_DIR"
    rm -f "$RELEASE_DIR"/*.zip

    # 3. 执行打包
    echo "📦 Packaging extension into $RELEASE_DIR/..."
    zip -r "$ZIP_PATH" . -x "*.git*" -x "*.DS_Store*" -x "node_modules/*" -x "package.json" -x "package-lock.json" -x "release.sh" -x "README.md" -x "README_CN.md" -x "$RELEASE_DIR/*" -x "docs/*" -x ".github/*"
else
    # 查找最新的 zip 文件
    ZIP_PATH=$(ls -t "$RELEASE_DIR"/*.zip | head -1)
    if [ -z "$ZIP_PATH" ]; then
        echo "❌ Error: No zip file found in $RELEASE_DIR/ folder."
        exit 1
    fi
    echo "📤 Found existing package: $ZIP_PATH"
fi

# 4. 检查 GitHub CLI 是否安装
if ! command -v gh &> /dev/null
then
    echo "⚠️  GitHub CLI (gh) could not be found. Please install it to support auto-release."
    exit 1
fi

# 5. 检查是否已登录 GitHub
if ! gh auth status &> /dev/null
then
    echo "🔑 Please login to GitHub first using: gh auth login"
    exit 1
fi

# 6. 发布到 GitHub
echo "📤 Uploading to GitHub Release..."
gh release create "v$VERSION" "$ZIP_PATH" --title "Release v$VERSION" --notes "Release version $VERSION" || \
gh release upload "v$VERSION" "$ZIP_PATH" --clobber

echo "✅ Success! Release v$VERSION has been processed."
