# Adds a content-based version tag to every script and stylesheet link (e.g. "/js/fx.js?v=1a2b3c4d").
# Browsers may keep these files for hours (Cloudflare's browser cache TTL), but pages are always fresh, so a changed
# file gets a new tag and every visitor loads the matching version right after a deploy.
#
#   python3 scripts/stamp.py           rewrite the tags in public/
#   python3 scripts/stamp.py --check   exit 1 if any tag is out of date (run by the tests)
#
# The same file always gets the same tag everywhere, so pages and scripts share one copy of each module
# (fx.js's storage listeners depend on that).
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
REF = re.compile(r"""(["'])(/(?:js|css|fonts)/[\w.-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?\1""")
ASSETS = sorted([*ROOT.glob("js/*.js"), *ROOT.glob("css/*.css"), *ROOT.glob("fonts/*.css")])
FILES = sorted({*ROOT.glob("*.html"), *ASSETS})

def strip(text):  # content without any tags, so a file's tag doesn't depend on its own previous tag
    return REF.sub(lambda m: m.group(1) + m.group(2) + m.group(1), text)

def stamped():
    texts = {f: f.read_text() for f in FILES}
    for _ in range(10):  # a file's tag depends on the tags inside it, so repeat until nothing changes
        tags = {"/" + a.relative_to(ROOT).as_posix(): hashlib.sha256(texts[a].encode()).hexdigest()[:8] for a in ASSETS}
        new = {f: REF.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={tags[m.group(2)]}{m.group(1)}" if m.group(2) in tags else m.group(0), strip(t)) for f, t in texts.items()}
        if new == texts: return texts
        texts = new
    raise SystemExit("version tags did not settle")

result = stamped()
stale = [f.relative_to(ROOT).as_posix() for f in FILES if f.read_text() != result[f]]
if "--check" in sys.argv:
    if stale: sys.exit("Out-of-date version tags in: " + ", ".join(stale) + "\nRun: python3 scripts/stamp.py")
    print("version tags up to date"); sys.exit(0)
for f in FILES:
    if f.read_text() != result[f]: f.write_text(result[f])
print("stamped", len(stale), "files" if len(stale) != 1 else "file")
