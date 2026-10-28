#!/bin/sh
# GitLib.app: запускает сервер в фоне и сразу завершается — окна терминала нет,
# а повторный двойной клик снова доходит до сервера и просто открывает браузер.
APP="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="${GITLIB_DATA_DIR:-$HOME/Library/Application Support/GitLib}"
mkdir -p "$DATA"
# Приложение уже разрешено пользователем — снимаем карантин, чтобы macOS не спрашивала про вложенный бинарник.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
cd "$APP/Contents/Resources" || exit 1
nohup ./gitlib-server >>"$DATA/gitlib.log" 2>&1 &
