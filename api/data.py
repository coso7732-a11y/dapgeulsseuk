# GET /data/<이름>.csv : data 폴더의 가상 데이터 (vercel.json 이 이 파일로 연결해 줘요)
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _shared import send_json, server  # noqa: E402

ALLOWED = {"sample_reviews.csv", "sample_inquiries.csv"}  # 이 두 파일만 보여 줌


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        name = (parse_qs(urlparse(self.path).query).get("name") or [""])[0]
        if name not in ALLOWED:
            return send_json(self, 404, {"error": "없는 파일이에요."})
        data = (server.DATA / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
