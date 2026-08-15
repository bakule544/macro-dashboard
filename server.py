from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import argparse
import json
import os
import re
import sys
import time

import threading
from datetime import datetime

FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"
CACHE_TTL_SECONDS = int(os.environ.get("FRED_CACHE_TTL_SECONDS", "60"))
UPSTREAM_TIMEOUT_SECONDS = int(os.environ.get("FRED_TIMEOUT_SECONDS", "15"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_FILE_NAMES = ("fred_api_keys.txt", "fred_api_key.txt")
VISITOR_LOG_FILE = os.path.join(BASE_DIR, "visitors_log.json")
VISITORS = []


def load_visitors():
    global VISITORS
    if os.path.exists(VISITOR_LOG_FILE):
        try:
            with open(VISITOR_LOG_FILE, "r", encoding="utf-8") as f:
                VISITORS = json.load(f)
        except Exception:
            VISITORS = []

load_visitors()


def save_visitors():
    try:
        with open(VISITOR_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(VISITORS[-300:], f, indent=2)
    except Exception as e:
        print(f"Error saving visitor log: {e}")


def resolve_and_log_ip(ip, user_agent, path):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
    entry = {
        "ip": ip,
        "time": now_str,
        "path": path,
        "user_agent": user_agent,
        "city": "Unknown",
        "country": "Unknown",
        "countryCode": "",
        "isp": "Unknown"
    }

    if ip in ("127.0.0.1", "localhost", "::1") or ip.startswith("192.168.") or ip.startswith("10."):
        entry["city"] = "Localhost"
        entry["country"] = "Local Dev"
        entry["isp"] = "Internal Network"
    else:
        try:
            req = Request(f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city,isp,org", headers={"User-Agent": "FredDashboard/1.0"})
            with urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("status") == "success":
                    entry["city"] = data.get("city", "Unknown")
                    entry["country"] = data.get("country", "Unknown")
                    entry["countryCode"] = data.get("countryCode", "")
                    entry["isp"] = data.get("isp", "Unknown")
        except Exception as e:
            print(f"Geo IP lookup error for {ip}: {e}")

    VISITORS.append(entry)
    if len(VISITORS) > 500:
        VISITORS.pop(0)
    save_visitors()
    print(f"[VISITOR LOGGED] IP: {ip} | Location: {entry['city']}, {entry['country']} ({entry['isp']}) | Time: {now_str}")


ADMIN_DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MacroDash - Visitor Intelligence Console</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body { background: #060911; color: #f8fafc; padding: 24px; min-height: 100vh; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
    .title { font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); padding: 18px; border-radius: 12px; backdrop-filter: blur(10px); }
    .stat-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-val { font-size: 26px; font-weight: 800; color: #38bdf8; margin-top: 6px; }
    .search-box { width: 100%; max-width: 320px; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 14px; color: #fff; font-size: 13px; outline: none; }
    .table-container { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; overflow-x: auto; backdrop-filter: blur(10px); }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; min-width: 700px; }
    th { background: rgba(255, 255, 255, 0.03); color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    td { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #cbd5e1; }
    tr:hover { background: rgba(255,255,255,0.02); }
    .ip-badge { font-family: monospace; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; padding: 2px 7px; border-radius: 4px; font-size: 12px; }
    .flag-img { width: 20px; height: 14px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; }
    .badge-device { background: rgba(129, 140, 248, 0.15); color: #a5b4fc; border: 1px solid rgba(129, 140, 248, 0.3); }
    .refresh-btn { background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .refresh-btn:hover { background: rgba(56, 189, 248, 0.25); }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title"><i class="fas fa-user-shield"></i> Visitor Intelligence Console</div>
      <div class="subtitle">Live Server-Side Python Geolocation & IP Telemetry Stream</div>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      <input type="text" id="searchInput" class="search-box" placeholder="Filter by IP, Country, City, or ISP...">
      <button onclick="loadVisitorData()" class="refresh-btn"><i class="fas fa-sync-alt" id="refIcon"></i> Refresh</button>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Visits Logged</div>
      <div class="stat-val" id="totalVisits">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Unique IP Addresses</div>
      <div class="stat-val" id="uniqueIps" style="color: #a5b4fc;">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Countries Represented</div>
      <div class="stat-val" id="totalCountries" style="color: #34d399;">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Recent Activity (24h)</div>
      <div class="stat-val" id="recent24h" style="color: #fbbf24;">0</div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Time (UTC)</th>
          <th>IP Address</th>
          <th>Location</th>
          <th>ISP / Network</th>
          <th>Device & OS</th>
          <th>Page Path</th>
        </tr>
      </thead>
      <tbody id="visitorTableBody">
        <tr><td colspan="6" style="text-align:center; padding: 30px; color:#64748b;">Loading visitor telemetry...</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    let allVisitors = [];

    function parseDevice(ua) {
      if (!ua) return "Unknown";
      let os = "Desktop";
      if (ua.includes("Windows")) os = "Windows";
      else if (ua.includes("Mac OS")) os = "macOS";
      else if (ua.includes("Android")) os = "Android";
      else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
      else if (ua.includes("Linux")) os = "Linux";

      let browser = "Browser";
      if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
      else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
      else if (ua.includes("Firefox")) browser = "Firefox";
      else if (ua.includes("Edg")) browser = "Edge";

      return `${os} • ${browser}`;
    }

    async function loadVisitorData() {
      const refIcon = document.getElementById('refIcon');
      if (refIcon) refIcon.classList.add('fa-spin');
      try {
        const res = await fetch('/api/admin/visitors?format=json');
        const data = await res.json();
        allVisitors = data.visitors || [];
        renderTable(allVisitors);
      } catch (err) {
        console.error(err);
      } finally {
        if (refIcon) setTimeout(() => refIcon.classList.remove('fa-spin'), 500);
      }
    }

    function renderTable(visitors) {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const filtered = visitors.filter(v => 
        (v.ip && v.ip.toLowerCase().includes(query)) ||
        (v.country && v.country.toLowerCase().includes(query)) ||
        (v.city && v.city.toLowerCase().includes(query)) ||
        (v.isp && v.isp.toLowerCase().includes(query))
      );

      document.getElementById('totalVisits').innerText = visitors.length;
      document.getElementById('uniqueIps').innerText = new Set(visitors.map(v => v.ip)).size;
      document.getElementById('totalCountries').innerText = new Set(visitors.map(v => v.country).filter(c => c && c !== 'Unknown')).size;
      document.getElementById('recent24h').innerText = filtered.length;

      const tbody = document.getElementById('visitorTableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color:#64748b;">No visitors logged yet. Visit your site to log the first entry!</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(v => {
        const flag = v.countryCode ? `<img class="flag-img" src="https://flagcdn.com/24x18/${v.countryCode.toLowerCase()}.png" alt="${v.country}">` : '🌐 ';
        const device = parseDevice(v.user_agent);
        return `
          <tr>
            <td style="font-size: 12px; color: #94a3b8;"><i class="far fa-clock"></i> ${v.time}</td>
            <td><span class="ip-badge">${v.ip}</span></td>
            <td><strong style="color: #f8fafc;">${flag} ${v.city !== 'Unknown' ? v.city + ', ' : ''}${v.country}</strong></td>
            <td style="font-size: 12px; color: #94a3b8;">${v.isp || 'Internal Network'}</td>
            <td><span class="badge badge-device">${device}</span></td>
            <td style="font-family: monospace; font-size: 12px; color: #38bdf8;">${v.path || '/'}</td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('searchInput').addEventListener('input', () => renderTable(allVisitors));
    loadVisitorData();
    setInterval(loadVisitorData, 15000);
  </script>
</body>
</html>"""
ALLOWED_PARAMS = {
    "series_id",
    "api_key",
    "file_type",
    "units",
    "observation_start",
    "observation_end",
    "realtime_start",
    "realtime_end",
    "sort_order",
    "limit",
}
CACHE = {}


def get_configured_key():
    raw_sources = [
        os.environ.get("FRED_API_KEYS") or "",
        os.environ.get("FRED_API_KEY") or "",
    ]

    for filename in KEY_FILE_NAMES:
        path = os.path.join(BASE_DIR, filename)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as file:
                raw_sources.append(file.read())

    keys = [
        key.strip()
        for raw in raw_sources
        for key in re.split(r"[\s,]+", raw)
        if key.strip()
    ]

    if not keys:
        return ""

    index = int(time.time()) % len(keys)
    return keys[index]


def json_bytes(payload):
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "FredDashboardProxy/1.0"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if any(self.path.endswith(ext) for ext in (".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        clean_path = parsed.path.lower().rstrip("/")

        if clean_path in ("/api/admin/visitors", "/api/visitors", "/visitors", "/admin/visitors"):
            query_params = parse_qs(parsed.query)
            if query_params.get("format", [""])[0] == "json" or "application/json" in self.headers.get("Accept", ""):
                self.send_json(200, {
                    "status": "success",
                    "total_visitors": len(VISITORS),
                    "visitors": list(reversed(VISITORS))
                })
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(ADMIN_DASHBOARD_HTML.encode("utf-8"))
            return

        if parsed.path in ("/", "/index.html"):
            client_ip = self.headers.get("X-Forwarded-For", "").split(",")[0].strip() or self.client_address[0]
            user_agent = self.headers.get("User-Agent", "Unknown")
            threading.Thread(target=resolve_and_log_ip, args=(client_ip, user_agent, parsed.path), daemon=True).start()

        if parsed.path == "/api/log-view":
            query_params = parse_qs(parsed.query)
            view_path = query_params.get("view", ["/"])[0]
            if not view_path.startswith("/"):
                view_path = "/" + view_path
            client_ip = self.headers.get("X-Forwarded-For", "").split(",")[0].strip() or self.client_address[0]
            user_agent = self.headers.get("User-Agent", "Unknown")
            threading.Thread(target=resolve_and_log_ip, args=(client_ip, user_agent, view_path), daemon=True).start()
            self.send_json(200, {"status": "ok"})
            return

        if parsed.path == "/api/fred/observations":
            self.handle_fred_observations(parsed.query)
            return

        if parsed.path == "/api/cot/positions":
            self.handle_cot_positions(parsed.query)
            return

        if parsed.path == "/api/calendar":
            self.handle_calendar(parsed.query)
            return

        if parsed.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def handle_fred_observations(self, query):
        raw_query = parse_qs(query, keep_blank_values=True)
        force_refresh = "refresh" in raw_query or "nocache" in raw_query or "force" in raw_query

        params, err = self.clean_fred_params(query)
        if err:
            self.send_json(400, {"error": err})
            return

        cache_key = urlencode(sorted((key, value) for key, value in params.items() if key != "api_key"))
        cached = CACHE.get(cache_key)
        if not force_refresh and cached and cached["expires_at"] > time.time():
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", f"public, max-age={CACHE_TTL_SECONDS}")
            self.send_header("X-FRED-Cache", "HIT")
            self.end_headers()
            self.wfile.write(cached["body"])
            return

        upstream_url = f"{FRED_OBSERVATIONS_URL}?{urlencode(params)}"
        request = Request(
            upstream_url,
            headers={
                "Accept": "application/json",
                "User-Agent": "FredDashboardProxy/1.0",
            },
        )

        try:
            with urlopen(request, timeout=UPSTREAM_TIMEOUT_SECONDS) as response:
                status = response.status
                body = response.read()
                content_type = response.headers.get("Content-Type", "application/json; charset=utf-8")
        except HTTPError as exc:
            status = exc.code
            body = exc.read() or json_bytes({"error": exc.reason})
            content_type = exc.headers.get("Content-Type", "application/json; charset=utf-8")
        except URLError as exc:
            self.send_json(502, {"error": f"FRED upstream unreachable: {exc.reason}"})
            return
        except TimeoutError:
            self.send_json(504, {"error": "FRED upstream timed out"})
            return

        if status == 200:
            CACHE[cache_key] = {
                "body": body,
                "expires_at": time.time() + CACHE_TTL_SECONDS,
            }

        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", f"public, max-age={CACHE_TTL_SECONDS if status == 200 else 0}")
        self.send_header("X-FRED-Cache", "MISS")
        self.end_headers()
        self.wfile.write(body)

    def clean_fred_params(self, query):
        raw = parse_qs(query, keep_blank_values=True)
        params = {}

        for key, values in raw.items():
            if key in ALLOWED_PARAMS and values:
                params[key] = values[0].strip()

        params["file_type"] = "json"
        params["api_key"] = params.get("api_key") or get_configured_key()

        if not params.get("api_key"):
            return None, "Missing FRED API key"

        if not params.get("series_id"):
            return None, "Missing FRED series_id"

        if not re.fullmatch(r"[A-Za-z0-9_.:-]+", params["series_id"]):
            return None, "Invalid FRED series_id"

        return params, None

    def handle_cot_positions(self, query):
        params = parse_qs(query)
        market_names_raw = params.get("market_names", [""])
        limit_str = params.get("limit", ["24"])[0].strip()

        try:
            limit = int(limit_str)
        except ValueError:
            limit = 24

        if market_names_raw and market_names_raw[0].strip():
            names_list = []
            for item in market_names_raw:
                names_list.extend([n.strip() for n in item.split(",") if n.strip()])
            
            joined = ", ".join(f"'{n}'" for n in names_list)
            where_clause = f"market_and_exchange_names in ({joined})"
        else:
            market_name = params.get("market_name", [""])[0].strip()
            if not market_name:
                self.send_json(400, {"error": "Missing market_name or market_names parameter"})
                return
            where_clause = f"market_and_exchange_names='{market_name}'"

        socrata_params = {
            "$where": where_clause,
            "$order": "report_date_as_yyyy_mm_dd desc",
            "$limit": str(limit)
        }
        socrata_url = f"https://publicreporting.cftc.gov/resource/6dca-aqww.json?{urlencode(socrata_params)}"

        request = Request(
            socrata_url,
            headers={
                "Accept": "application/json",
                "User-Agent": "FredDashboardProxy/1.0",
            },
        )

        try:
            with urlopen(request, timeout=15) as response:
                status = response.status
                body = response.read()
                content_type = response.headers.get("Content-Type", "application/json; charset=utf-8")
        except HTTPError as exc:
            status = exc.code
            body = exc.read() or json_bytes({"error": exc.reason})
            content_type = exc.headers.get("Content-Type", "application/json; charset=utf-8")
        except URLError as exc:
            self.send_json(502, {"error": f"CFTC upstream unreachable: {exc.reason}"})
            return
        except TimeoutError:
            self.send_json(504, {"error": "CFTC upstream timed out"})
            return

        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def handle_calendar(self, query=""):
        raw_query = parse_qs(query)
        force_refresh = "refresh" in raw_query or "nocache" in raw_query or "force" in raw_query
        cache_key = "ff_calendar_thisweek"
        cached = CACHE.get(cache_key)
        if not force_refresh and cached and cached["expires_at"] > time.time():
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=3600")
            self.send_header("X-Calendar-Cache", "HIT")
            self.end_headers()
            self.wfile.write(cached["body"])
            return

        upstream_url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
        request = Request(
            upstream_url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        )

        try:
            with urlopen(request, timeout=10) as response:
                status = response.status
                body = response.read()
                content_type = response.headers.get("Content-Type", "application/json; charset=utf-8")
        except HTTPError as exc:
            status = exc.code
            body = exc.read() or json_bytes({"error": exc.reason})
            content_type = exc.headers.get("Content-Type", "application/json; charset=utf-8")
        except URLError as exc:
            self.send_json(502, {"error": f"Calendar upstream unreachable: {exc.reason}"})
            return
        except TimeoutError:
            self.send_json(504, {"error": "Calendar upstream timed out"})
            return

        if status == 200:
            CACHE[cache_key] = {
                "body": body,
                "expires_at": time.time() + 3600,
            }

        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "public, max-age=3600" if status == 200 else "no-cache")
        self.send_header("X-Calendar-Cache", "MISS")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        message = fmt % args
        message = re.sub(r"(api_key=)[^&\s]+", r"\1REDACTED", message)
        sys.stderr.write(f"{self.address_string()} - - [{self.log_date_time_string()}] {message}\n")


def main():
    default_host = os.environ.get("HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    parser = argparse.ArgumentParser(description="Serve the dashboard and proxy FRED API requests.")
    parser.add_argument("--host", default=default_host)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Dashboard running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
