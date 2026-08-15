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

FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"
CACHE_TTL_SECONDS = int(os.environ.get("FRED_CACHE_TTL_SECONDS", "60"))
UPSTREAM_TIMEOUT_SECONDS = int(os.environ.get("FRED_TIMEOUT_SECONDS", "15"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_FILE_NAMES = ("fred_api_keys.txt", "fred_api_key.txt")
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
