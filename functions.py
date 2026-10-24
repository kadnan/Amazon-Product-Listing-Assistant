import json
import os
import time

import requests
CURRENCIES = {
            "amazon.com": "USD",
            "amazon.co.uk": "GBP",
            "amazon.ca": "CAD",
        }

def call_openrouter(system_instruction: str, json_payload: str, api_key) -> dict:
    models = [
        "qwen/qwen3.8-27b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
    ]


    max_attempts = 3
    errors = []

    payload = {
        "models": models,
        "messages": [
            {
                "role": "system",
                "content": system_instruction,
            },
            {
                "role": "user",
                "content": json_payload,
            },
        ],
        "temperature": 0.1,
        "provider": {
            "allow_fallbacks": True,
        },
    }

    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://simplenailideas.com",
                    "X-OpenRouter-Title": "Simple Nail Ideas",
                },
                json=payload,
                timeout=(10, 60),
            )

            try:
                decoded = response.json()
                print("OpenRouter model:", decoded.get("model"))
            except ValueError:
                decoded = None

            # Provider errors can also arrive with HTTP 200.
            if isinstance(decoded, dict) and "error" in decoded:
                error = decoded["error"]
                error = error if isinstance(error, dict) else {}

                errors.append({
                    "attempt": attempt,
                    "code": error.get("code", response.status_code),
                    "error": error.get("message", "Unknown OpenRouter error"),
                })

            elif not 200 <= response.status_code < 300:
                errors.append({
                    "attempt": attempt,
                    "code": response.status_code,
                    "error": response.text,
                })

            else:
                try:
                    content = decoded["choices"][0]["message"]["content"]

                    if not isinstance(content, str) or not content.strip():
                        raise ValueError("Missing response content")

                    # Parse the generated JSON; tolerate Markdown code fences.
                    response_text = content.strip()

                    if response_text.startswith("```"):
                        lines = response_text.splitlines()

                        if lines[-1].strip() == "```":
                            response_text = "\n".join(lines[1:-1]).strip()

                    result = json.loads(response_text)

                    if not isinstance(result, dict):
                        raise ValueError("Expected a JSON object")

                    return result

                except (KeyError, IndexError, TypeError, ValueError) as error:
                    errors.append({
                        "attempt": attempt,
                        "error": f"Invalid response: {error}",
                    })

        except requests.exceptions.RequestException as error:
            errors.append({
                "attempt": attempt,
                "error": str(error),
            })

        if attempt < max_attempts:
            time.sleep(2 * attempt)

    raise RuntimeError(json.dumps({
        "message": "All OpenRouter attempts failed",
        "errors": errors,
    }, indent=2))


import requests


class UpstreamError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def fetch_competitor(asin, marketplace, api_key):
    try:


        response = requests.get(
            "https://www.searchapi.io/api/v1/search",
            headers={
                "Authorization": f"Bearer {api_key}",
            },
            params={
                "engine": "amazon_product",
                "asin": asin,
                "amazon_domain": marketplace,
                "currency": CURRENCIES[marketplace],
            },
            timeout=(5, 40),
        )
    except requests.exceptions.Timeout:
        raise UpstreamError(
            f"Product lookup timed out for {asin}. Please try again.",
            504,
        )
    except requests.exceptions.RequestException:
        raise UpstreamError("Unable to connect to SearchAPI.")

    if response.status_code == 429:
        raise UpstreamError("SearchAPI request limit reached.", 429)

    if not response.ok:
        raise UpstreamError(f"SearchAPI lookup failed for {asin}.")

    try:
        payload = response.json()
    except ValueError:
        raise UpstreamError("SearchAPI returned invalid JSON.")

    if not isinstance(payload, dict) or payload.get("error"):
        raise UpstreamError(f"SearchAPI could not retrieve {asin}.")

    product = payload.get("product")

    if not isinstance(product, dict):
        raise UpstreamError(f"No product details returned for {asin}.")

    title = product.get("title")

    if not isinstance(title, str) or not title.strip():
        raise UpstreamError(f"No product title returned for {asin}.")

    if product.get("asin") != asin:
        raise UpstreamError(f"SearchAPI returned a different ASIN for {asin}.")

    buybox = product.get("buybox")
    buybox = buybox if isinstance(buybox, dict) else {}

    price = buybox.get("price")
    price = price if isinstance(price, dict) else {}

    competitor = {
        "asin": asin,
        "title": title.strip(),
        "price": price.get("value"),
        "currency": price.get("currency"),
    }

    for field in (
            "description",
            "feature_bullets",
            "attributes",
            "specifications",
    ):
        value = product.get(field)

        if isinstance(value, (str, list, dict)):
            competitor[field] = value

    return competitor
