#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_HOME:?Android SDK obrigatório}"
: "${JAVA_HOME:?JDK obrigatório}"
: "${APK_KEYSTORE:?Chave de assinatura obrigatória}"
: "${APK_PASSWORD_FILE:?Arquivo privado de senha obrigatório}"
ROOT="$(dirname "$(realpath "$0")")"
WORK="$(mktemp -d /tmp/inventory-apk.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
TOOLS="$ANDROID_HOME/build-tools/35.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-35/android.jar"
export PATH="$JAVA_HOME/bin:$PATH"
mkdir -p "$WORK/classes" "$WORK/dex"
"$TOOLS/aapt2" compile --dir "$ROOT/res" -o "$WORK/resources.zip"
"$TOOLS/aapt2" link -I "$PLATFORM" --manifest "$ROOT/AndroidManifest.xml" -o "$WORK/app.apk" "$WORK/resources.zip"
javac --release 8 -classpath "$PLATFORM" -d "$WORK/classes" "$ROOT/src/app/countquick/inventory/MainActivity.java"
jar cf "$WORK/classes.jar" -C "$WORK/classes" .
"$TOOLS/d8" --lib "$PLATFORM" --min-api 26 --output "$WORK/dex" "$WORK/classes.jar"
python3 - "$WORK/app.apk" "$WORK/dex/classes.dex" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(sys.argv[2], 'classes.dex')
PY
"$TOOLS/zipalign" -f 4 "$WORK/app.apk" "$WORK/aligned.apk"
OUTPUT="${APK_OUTPUT:-/tmp/apk-build/Inventario.apk}"
mkdir -p "$(dirname "$OUTPUT")"
"$TOOLS/apksigner" sign --ks "$APK_KEYSTORE" --ks-key-alias inventory --ks-pass "file:$APK_PASSWORD_FILE" --out "$OUTPUT" "$WORK/aligned.apk"
"$TOOLS/apksigner" verify --verbose "$OUTPUT"
"$TOOLS/aapt2" dump badging "$OUTPUT"