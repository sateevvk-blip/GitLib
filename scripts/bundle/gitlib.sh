#!/bin/sh
# Запуск GitLib на macOS и Linux. Двойной клик на macOS — GitLib.command.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите Node.js 22 LTS (22.13 или новее): https://nodejs.org"
  exit 1
fi

exec node --disable-warning=ExperimentalWarning launch.mjs "$@"
