"""답글쓱 MVP 서버 (1단계: 모의 모드)

하는 일
1. public 폴더의 웹페이지 파일과 data 폴더의 가상 데이터를 브라우저에 보여 줍니다.
2. /api/reply  : 답글 초안을 돌려줍니다. (kind: "review" 리뷰 답글 / "inquiry" 문의 답글)
3. /api/report : 리뷰 분류 결과와 할 일 3줄을 돌려줍니다.

MOCK=1 로 실행하면 AI 대신 data 폴더의 샘플 결과를 돌려줍니다.
MOCK 없이 실행하면 ai.py 를 통해 AI(Claude)에게 묻습니다. (2단계)
AI 키는 .env 파일에만 두고, 화면이나 이 파일에 적지 않습니다.

실행: MOCK=1 python3 server.py  → 모의 모드
      python3 server.py         → AI 모드
브라우저에서 http://localhost:8123
"""

import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
PORT = int(os.environ.get("PORT", "8123"))
MOCK = os.environ.get("MOCK", "0") == "1"

TONES = ("친근한", "정중한", "간결한")


def load_json(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def with_period(text):
    """문장 끝에 마침표가 없으면 붙여서 다음 문장과 자연스럽게 이어지게 합니다."""
    text = text.strip()
    if text and text[-1] not in ".!?。":
        text += "."
    return text


# ---------- 답글 초안 ----------

def fill(template, values):
    for key, val in values.items():
        template = template.replace("{" + key + "}", val)
    return re.sub(r"\s+", " ", template).strip()


def mock_reply(payload):
    """kind 가 "review" 면 리뷰 답글, "inquiry" 면 문의 답글을 만듭니다."""
    kind = payload.get("kind") or "review"
    text = (payload.get("text") or "").strip()
    rating = int(payload.get("rating") or 0)
    tone = payload.get("tone") if payload.get("tone") in TONES else "친근한"
    store = payload.get("store") or {}
    if not text:
        return 400, {"error": "내용이 비어 있어요."}

    sample = load_json("sample_reply.json")
    ph = sample["placeholders"]
    values = {
        "호칭": (store.get("customerCall") or "").strip() or ph["호칭"],
        "교환안내": with_period(store.get("exchangePolicy") or "") or ph["교환안내"],
        "배송안내": with_period(store.get("shippingPolicy") or "") or ph["배송안내"],
        "문의채널": (store.get("contactChannel") or "").strip() or ph["문의채널"],
        "인사말": (store.get("closing") or "").strip() or ph["인사말"],
    }

    if kind == "inquiry":
        inq = sample["inquiry"]
        # 모의 모드: 문의 내용에 든 낱말로 주제를 고릅니다. 맞는 게 없으면 '정책 없음'.
        topic = next((t for t, words in inq["keywords"].items()
                      if any(w in text for w in words)), "정책 없음")
        draft = fill(" ".join([inq["opening"][tone], inq["body"][topic], inq["closing"][tone]]), values)
        return 200, {
            "draft": draft, "topic": topic, "mock": True,
            "note": f"모의 모드: 문의 낱말로 '{topic}' 틀을 골랐어요. 2단계에서는 AI가 문의 내용을 읽고 씁니다.",
        }

    # 리뷰: 모의 모드에서는 별점으로만 불만/칭찬 틀을 고릅니다. (실제 판단은 2단계 AI가 리뷰 내용으로 함)
    tpl = "complaint" if rating <= 3 else "praise"
    return 200, {
        "draft": fill(sample[tpl][tone], values),
        "topic": "불만" if tpl == "complaint" else "칭찬",
        "mock": True,
        "note": "모의 모드: 별점으로 불만/칭찬 틀을 골랐어요. 2단계에서는 AI가 리뷰 내용을 읽고 씁니다.",
    }




# ---------- 리포트 ----------

def mock_report(payload):
    rows = payload.get("rows") or []
    if not rows:
        return 400, {"error": "리뷰가 없어요."}

    sample = load_json("sample_report.json")
    by_id = {c["review_id"]: c for c in sample["classifications"]}

    sample_csv = {}
    with open(DATA / "sample_reviews.csv", encoding="utf-8") as f:
        lines = f.read().strip().splitlines()[1:]
    for line in lines:
        parts = line.split(",", 4)
        sample_csv[parts[0]] = parts[4].strip()

    unknown = [r.get("review_id", "") for r in rows
               if sample_csv.get(r.get("review_id")) != (r.get("리뷰내용") or "").strip()]
    if unknown:
        return 422, {
            "error": "1단계(모의 모드)의 샘플 결과는 '가상 데이터 불러오기'로 넣은 15행에만 있어요. "
                     "다른 리뷰는 2단계에서 AI가 분류합니다.",
            "unmatched": unknown[:10],
        }

    return 200, {
        "classifications": [by_id[r["review_id"]] for r in rows],
        "todos": sample["todos"],
        "mock": True,
    }




# 2단계: 모의 모드가 아니면 ai.py 의 AI 연결을 씁니다.
if MOCK:
    ROUTES = {"/api/reply": mock_reply, "/api/report": mock_report}
else:
    import ai
    ROUTES = {"/api/reply": ai.ai_reply, "/api/report": ai.ai_report}


def mode_status():
    if MOCK:
        return {"mode": "mock"}
    return {"mode": "ai", **ai.status()}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def translate_path(self, path):
        # /data/... 주소는 data 폴더의 가상 데이터를 보여 줌
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/data/"):
            name = Path(clean).name
            target = DATA / name
            if name.endswith((".csv",)) and target.is_file():
                return str(target)
            return str(DATA / "__없음__")
        return super().translate_path(path)

    def do_GET(self):
        if self.path == "/api/status":
            return self.send_json(200, mode_status())
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        handler = ROUTES.get(self.path)
        if not handler:
            return self.send_json(404, {"error": "없는 주소예요."})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 2_000_000:
                return self.send_json(413, {"error": "입력이 너무 커요."})
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self.send_json(400, {"error": "보낸 내용을 읽지 못했어요."})
        try:
            status, body = handler(payload)
        except Exception as e:  # 예상 못 한 오류도 화면에는 쉬운 말로 알려 줌
            print(f"[오류] {self.path}: {type(e).__name__}: {e}")
            status, body = 500, {"error": "서버에서 예상 못 한 오류가 났어요. 서버 창의 [오류] 줄을 확인해 주세요."}
        self.send_json(status, body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    if MOCK:
        mode = "모의 모드(샘플 결과)"
    else:
        st = ai.status()
        mode = f"AI 모드 · 모델 {st['model']} · 키 {'있음' if st['hasKey'] else '없음 (.env 확인 필요)'}"
    print(f"답글쓱 서버 시작: http://localhost:{PORT}  [{mode}]")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
