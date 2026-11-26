# GET /api/status : 지금 모의 모드인지 AI 모드인지, 키가 있는지 (키 값은 절대 보내지 않음)
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _shared import send_json, server  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, 200, server.mode_status())
