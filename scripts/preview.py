#!/usr/bin/env python3
"""Loopback-only preview. Serves a single explicitly selected generated report."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--file", type=Path, default=Path(__file__).resolve().parents[1] / "reports/demo.html")
parser.add_argument("--port", type=int, default=4173)
args = parser.parse_args()
report = args.file.resolve()
if not report.is_file():
    parser.error("Report does not exist: " + str(report))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if self.path.split("?", 1)[0] not in ("/", "/report.html"):
            self.send_error(404)
            return
        body = report.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


print(f"Single-report preview: http://127.0.0.1:{args.port}/", flush=True)
HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
