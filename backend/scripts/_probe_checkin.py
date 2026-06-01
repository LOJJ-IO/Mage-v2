import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"}


def main() -> None:
    urls = [
        "https://www.comfortinnedmonton.com/",
        "https://www.comfortinnedmonton.com/about-amenities",
    ]
    for url in urls:
        print("===", url, "===")
        t = httpx.get(url, headers=UA, follow_redirects=True, timeout=25).text
        print("4:00 PM matches:", len(re.findall(r"4\s*:\s*00\s*PM", t, re.I)))
        print("3:00 PM matches:", len(re.findall(r"3\s*:\s*00\s*PM", t, re.I)))
        idx = t.lower().find("information &amp; policies")
        if idx < 0:
            idx = t.lower().find("information & policies")
        if idx >= 0:
            chunk = t[idx : idx + 2500]
            print("POLICIES BLOCK:")
            print(re.sub(r"\s+", " ", chunk)[:2000])
        for m in re.finditer(r"(?is)check[- ]?in.{0,80}", t):
            s = re.sub(r"\s+", " ", m.group(0))
            if "pm" in s.lower() or "am" in s.lower():
                print("CHECKIN:", s[:100])


if __name__ == "__main__":
    main()
