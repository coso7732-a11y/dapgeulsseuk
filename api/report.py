# POST /api/report : 리뷰 분류와 할 일 3줄 (내용은 server.py / ai.py 에 있어요)
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _shared import post_handler  # noqa: E402

# Vercel 은 'class handler' 모양을 찾아 함수로 만듭니다.
class handler(post_handler("report")):
    pass
