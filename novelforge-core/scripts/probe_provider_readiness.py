import asyncio, time, sys, json
from datetime import datetime
from pathlib import Path

def load_env():
    config = {}
    env_path = Path('.env')
    if env_path.exists():
        for line in open(env_path, 'r', encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                config[k.strip()] = v.strip()
    return config

def check_config(cfg):
    return {
        'api_key_present': bool(cfg.get('OPENAI_API_KEY') and 'your-api-key' not in cfg.get('OPENAI_API_KEY', '')),
        'base_url_present': bool(cfg.get('OPENAI_BASE_URL')),
        'models_present': bool(cfg.get('OPENAI_MODEL')),
        'fast_model': cfg.get('NOVELFORGE_FAST_MODEL', 'not_configured'),
        'pro_model': cfg.get('NOVELFORGE_PRO_MODEL', 'not_configured'),
        'default_model': cfg.get('OPENAI_MODEL', 'not_configured'),
    }

class ProbeResult:
    def __init__(self, route, model, start, end, latency, success, error=None, status=None, parse_ok=False):
        self.route_name = route; self.model = model; self.start_timestamp = start; self.end_timestamp = end
        self.latency_ms = latency; self.success = success; self.error_type = error; self.http_status = status
        self.response_parse_ok = parse_ok; self.model_health_recorded = True; self.timeout_setting_ms = 25000

async def probe_route(route_name, model, base_url, api_key, timeout_seconds=30.0):
    start_dt = datetime.now().isoformat()
    started = time.time()
    try:
        import httpx
    except ImportError:
        return ProbeResult(route_name, model, start_dt, datetime.now().isoformat(), int((time.time()-started)*1000), False, 'httpx_not_installed')
    url = base_url.rstrip('/') + '/chat/completions'
    headers = {'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json'}
    payload = {'model': model, 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 10, 'temperature': 0.1}
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            end_dt = datetime.now().isoformat()
            latency_ms = int((time.time() - started) * 1000)
            if response.status_code == 200:
                try:
                    body = response.json()
                    content = body.get('choices', [{}])[0].get('message', {}).get('content', '')
                    parse_ok = bool(content and content.strip())
                except Exception:
                    parse_ok = False
                return ProbeResult(route_name, model, start_dt, end_dt, latency_ms, True, status=response.status_code, parse_ok=parse_ok)
            else:
                return ProbeResult(route_name, model, start_dt, end_dt, latency_ms, False, status=response.status_code, error='http_' + str(response.status_code))
    except asyncio.TimeoutError:
        return ProbeResult(route_name, model, start_dt, datetime.now().isoformat(), int((time.time()-started)*1000), False, 'timeout')
    except Exception as exc:
        text = str(exc).lower()
        if any(m in text for m in ('timeout', 'timed out', 'gateway')): error_type = 'gateway_timeout'
        elif any(m in text for m in ('401', '403', 'unauthorized', 'auth')): error_type = 'auth_failed'
        elif any(m in text for m in ('429', 'rate limit')): error_type = 'rate_limited'
        elif any(m in text for m in ('connection', 'connect', 'refused', 'dns', 'name')): error_type = 'connection_error'
        else: error_type = 'upstream_error'
        return ProbeResult(route_name, model, start_dt, datetime.now().isoformat(), int((time.time()-started)*1000), False, error_type)

def determine_status(results):
    if not results: return 'PROVIDER_CONFIG_BLOCKED'
    successes = [r for r in results if r.success]
    failures = [r for r in results if not r.success]
    if failures and all(r.error_type == 'auth_failed' for r in failures) and not successes: return 'PROVIDER_CONFIG_BLOCKED'
    if failures and all(r.error_type in {'gateway_timeout', 'timeout', 'connection_error', 'upstream_error'} for r in failures) and not successes: return 'PROVIDER_STILL_UNAVAILABLE'
    if successes: return 'PROVIDER_RECOVERED' if len(successes) == len(results) else 'PROVIDER_PARTIAL'
    return 'PROVIDER_STILL_UNAVAILABLE'

async def main():
    env = load_env()
    config_check = check_config(env)
    if not (config_check['api_key_present'] and config_check['base_url_present'] and config_check['models_present']):
        print('PROVIDER_CONFIG_BLOCKED')
        return 1
    base_url = env.get('OPENAI_BASE_URL', '')
    api_key = env.get('OPENAI_API_KEY', '')
    fast_model = env.get('NOVELFORGE_FAST_MODEL', env.get('OPENAI_MODEL', ''))
    pro_model = env.get('NOVELFORGE_PRO_MODEL', env.get('OPENAI_MODEL', ''))
    default_model = env.get('OPENAI_MODEL', '')
    repair_model = pro_model
    routes = [('fast/flash', fast_model), ('pro', pro_model), ('repair', repair_model), ('default', default_model)]
    seen = set()
    deduped = []
    for name, model in routes:
        if model and model not in seen:
            seen.add(model)
            deduped.append((name, model))
    results = []
    for route_name, model in deduped:
        result = await probe_route(route_name, model, base_url, api_key, timeout_seconds=30.0)
        results.append(result)
    status = determine_status(results)
    print(json.dumps({'status': status, 'config': config_check, 'results': [{
        'route_name': r.route_name, 'model': r.model, 'start_timestamp': r.start_timestamp,
        'end_timestamp': r.end_timestamp, 'latency_ms': r.latency_ms, 'success': r.success,
        'error_type': r.error_type, 'http_status': r.http_status, 'response_parse_ok': r.response_parse_ok
    } for r in results]}))
    return 0 if status in ('PROVIDER_RECOVERED', 'PROVIDER_PARTIAL') else 1

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
