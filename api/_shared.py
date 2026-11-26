"""Vercel 배포용 공통 처리

Vercel 은 server.py 를 계속 켜 두지 않고, 요청이 올 때마다 api 폴더의 파일을 잠깐 실행합니다.
그래서 여기서는 server.py 에 이미 있는 기능(ROUTES, mode_status)을 그대로 가져다 씁니다.
(이름이 _ 로 시작하는 파일은 Vercel 이 주소로 만들지 않습니다.)
"""

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402  (server.py: MOCK=1 이면 모의 모드, 아니면 AI 모드)

MAX_BODY = 1_000_000  # 1MB 보다 큰 요청은 받지 않음 (AI 사용료 보호)


def send_json(h, status, body):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(data)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(data)


def post_handler(route):
    """POST /api/<route> 를 server.py 의 같은 기능으로 연결하는 처리기를 만듭니다."""
    fn = server.ROUTES["/api/" + route]

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if length > MAX_BODY:
                    return send_json(self, 413, {"error": "입력이 너무 커요. 나눠서 넣어 주세요."})
                payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                return send_json(self, 400, {"error": "보낸 내용을 읽지 못했어요."})
            try:
                status, body = fn(payload)
            except Exception as e:  # 예상 못 한 오류는 Vercel 로그(Logs)에 남기고 화면엔 쉬운 말로
                print(f"[오류] /api/{route}: {type(e).__name__}: {e}")
                status, body = 500, {"error": "서버에서 예상 못 한 오류가 났어요. 잠시 뒤 다시 시도해 주세요."}
            send_json(self, status, body)

        def do_GET(self):
            send_json(self, 405, {"error": "이 주소는 POST 로만 쓸 수 있어요."})

    return Handler
