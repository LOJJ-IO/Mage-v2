"""
Run this standalone to verify Playwright works in your environment.
Usage: python -m backend.scripts.test_playwright
Or:    cd backend && python scripts/test_playwright.py
"""
import asyncio
import sys


async def test():
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("FAIL: Playwright not installed. Run: pip install playwright")
        sys.exit(1)

    from app.knowledge.pipeline.crawl_http import _STEALTH_SCRIPT, _apply_stealth

    print("Playwright imported OK")

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            print(f"Browser launched OK: {browser.version}")

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            await context.add_init_script(_STEALTH_SCRIPT)
            page = await context.new_page()
            await _apply_stealth(page)

            # Test 1: simple page
            await page.goto("https://example.com", wait_until="networkidle", timeout=15000)
            html = await page.content()
            print(f"example.com: {len(html)} chars — {'OK' if len(html) > 500 else 'FAIL: too short'}")

            # Test 2: check webdriver is masked
            webdriver = await page.evaluate("navigator.webdriver")
            print(f"navigator.webdriver: {webdriver} — {'OK (undefined)' if webdriver is None else 'FAIL: exposed'}")

            # Test 3: hotel site with stealth script active
            print("Testing Hyatt...")
            try:
                resp = await page.goto(
                    "https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west",
                    wait_until="networkidle",
                    timeout=30000,
                )
                html = await page.content()
                print(f"Hyatt: status={resp.status if resp else 'none'}, {len(html)} chars")
                if "cloudflare" in html.lower() or "just a moment" in html.lower():
                    print("  -> Cloudflare challenge detected")
                elif "check-in" in html.lower() or "amenities" in html.lower():
                    print("  -> Content looks real -- OK")
                else:
                    print("  -> Content unclear -- may be JS shell")
            except Exception as e:
                print(f"Hyatt: FAIL — {e}")

            await browser.close()
            print("Done")

    except Exception as e:
        print(f"FAIL: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test())
