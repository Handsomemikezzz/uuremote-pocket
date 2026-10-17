#!/bin/zsh
# 构建「Pocket Mac.app」。Pocket Mac 不需要任何系统权限，默认 ad-hoc 签名即可（SIGN_IDENTITY 可换成自己的证书）。
# 用法：scripts/build-app.sh [--install]    --install：复制到 /Applications 并启动
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="0.1.0"
APP_NAME="Pocket Mac"
APP="build/$APP_NAME.app"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"

swift build -c release --product PocketMac
BIN="$(swift build -c release --show-bin-path)/PocketMac"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/PocketMac"
if [[ -f "assets/AppIcon.icns" ]]; then
  cp "assets/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
fi
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>local.pocketmac.app</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleExecutable</key><string>PocketMac</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST
codesign --force --sign "$SIGN_IDENTITY" --identifier local.pocketmac.app "$APP"
codesign --verify --strict "$APP"
echo "✅ 已生成 $APP"

if [[ "${1:-}" == "--install" ]]; then
  pkill -x PocketMac 2>/dev/null && sleep 3 || true
  rm -rf "/Applications/$APP_NAME.app"
  cp -R "$APP" /Applications/
  open "/Applications/$APP_NAME.app"
  echo "✅ 已安装到 /Applications 并启动"
fi

if [[ "${1:-}" == "--dmg" ]]; then
  DMG="build/PocketMac.dmg"
  DMG_TEMP="build/dmg_temp"
  rm -rf "$DMG" "$DMG_TEMP"
  mkdir -p "$DMG_TEMP"
  cp -R "$APP" "$DMG_TEMP/"
  ln -s /Applications "$DMG_TEMP/Applications"
  hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_TEMP" -ov -format UDZO "$DMG" >/dev/null
  rm -rf "$DMG_TEMP"
  echo "✅ 已生成 DMG 安装包：$DMG"
fi
