#!/bin/bash
# Export a .pptx to PDF through Microsoft PowerPoint (macOS).
# Usage: export_pdf.sh /abs/in.pptx /abs/out.pdf
set -euo pipefail
IN="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
osascript <<OSA
tell application "Microsoft PowerPoint"
  open POSIX file "$IN"
  delay 1
  save active presentation in (POSIX file "$OUT") as save as PDF
  close active presentation saving no
end tell
OSA
