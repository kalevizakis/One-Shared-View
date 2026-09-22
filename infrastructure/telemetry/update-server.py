"""
Tiny HTTP API server for triggering dashboard updates from the browser.
Runs on port 4319, single endpoint: GET /update

Usage:
    py.exe update-server.py
"""
import http.server
import json
import subprocess
import sys
import os
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('UPDATE_SERVER_PORT', '4319'))
BIND = os.environ.get('UPDATE_SERVER_BIND', '127.0.0.1')
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
UPDATE_SCRIPT = os.path.join(SCRIPT_DIR, 'update-dashboard.py')
DASHBOARD_PATH = os.environ.get(
    'DASHBOARD_PATH',
    os.path.join(SCRIPT_DIR, 'essence-token-dashboard.html')
)


VALID_PERIODS = {'24h', '1w', '1m', '3m', '6m', 'all'}


class UpdateHandler(http.server.BaseHTTPRequestHandler):

    def _cors(self):
        # Allow file:// (dashboard HTML) and localhost origins only
        origin = self.headers.get('Origin', '')
        allowed = origin if origin in ('null', '') or origin.startswith(('http://localhost', 'http://127.0.0.1', 'file://')) else ''
        self.send_header('Access-Control-Allow-Origin', allowed or 'null')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/update':
            params = parse_qs(parsed.query)
            period = params.get('period', ['all'])[0]
            if period not in VALID_PERIODS:
                period = 'all'
            # Workspace is dynamic (validated against the live DB list inside the
            # update script), so no static whitelist here. Cap length defensively.
            workspace = params.get('workspace', ['all'])[0][:200]
            self._run_update(period, workspace)
        elif parsed.path == '/health':
            self._json_response(200, {'status': 'ok'})
        else:
            self._json_response(404, {'error': 'Not found'})

    def _run_update(self, period='all', workspace='all'):
        try:
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            cmd = [sys.executable, UPDATE_SCRIPT, '--period', period,
                   '--workspace', workspace, '--dashboard', DASHBOARD_PATH]
            result = subprocess.run(
                cmd,
                capture_output=True, text=True, timeout=90,
                cwd=SCRIPT_DIR, env=env, encoding='utf-8'
            )
            ok = result.returncode == 0
            
            # NOTE: the full dashboard HTML is returned inline in this JSON response
            # on purpose. The dashboard is opened via a file:// URL, so the browser
            # cannot re-fetch it cross-origin — the refresh button rebuilds the DOM
            # from this payload (the v2.5.1 DOMParser approach). Returning a URL or
            # hash instead would not work under the file:// origin. The ~0.5 MB
            # payload is the accepted trade-off for a zero-dependency local refresh.
            html_content = ""
            if ok and os.path.exists(DASHBOARD_PATH):
                try:
                    with open(DASHBOARD_PATH, "r", encoding="utf-8") as f:
                        html_content = f.read()
                except Exception:
                    pass

            self._json_response(200 if ok else 500, {
                'success': ok,
                'html': html_content,
                'output': result.stdout[-2000:] if result.stdout else '',
                'error': result.stderr[-500:] if result.stderr else ''
            })
        except subprocess.TimeoutExpired:
            self._json_response(504, {'success': False, 'error': 'Update timed out (90s)'})
        except Exception as e:
            self._json_response(500, {'success': False, 'error': str(e)})

    def _json_response(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f'[update-server] {args[0]}')


if __name__ == '__main__':
    server = http.server.HTTPServer((BIND, PORT), UpdateHandler)
    print(f'Update server listening on http://{BIND}:{PORT}')
    print('  GET /update  - trigger dashboard refresh')
    print('  GET /health  - health check')
    print(f'  Script: {UPDATE_SCRIPT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
        server.server_close()
