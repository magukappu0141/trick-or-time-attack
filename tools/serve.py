# ゲーム用のローカルサーバー（ブラウザにキャッシュさせないので、ファイルを直したらリロードだけで反映される）
#   python3 tools/serve.py        → http://localhost:8765
import http.server, functools, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
handler = functools.partial(NoCache, directory=root)
print(f'http://localhost:{port}')
http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
