import asyncio

import httpx

URL = "https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west"

PROFILES = {
    "googlebot": {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "application/xml,text/xml,text/html,*/*",
    },
    "chrome": {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    },
}


async def main() -> None:
    for name, headers in PROFILES.items():
        async with httpx.AsyncClient(follow_redirects=True, timeout=25, headers=headers) as client:
            resp = await client.get(URL)
            lower = resp.text.lower()
            print(name, resp.status_code, len(resp.text), "og:title" in lower)


if __name__ == "__main__":
    asyncio.run(main())
