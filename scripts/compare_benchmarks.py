"""
compare_benchmarks.py — before/after table for two benchmark runs.

    python scripts/compare_benchmarks.py docs/benchmarks/baseline.json docs/benchmarks/after.json

Prints a Markdown table (median and p95, absolute and percentage change)
for every metric present in both runs. Lower is better for every timing.
"""
import json
import sys


def flatten(results):
    out = {}
    for section, metrics in results.items():
        if section == "meta" or not isinstance(metrics, dict):
            continue
        for name, v in metrics.items():
            out[(section, name)] = v
    return out


def fmt(x):
    if isinstance(x, float):
        return f"{x:,.2f}" if abs(x) < 100 else f"{x:,.0f}"
    return f"{x:,}" if isinstance(x, int) else str(x)


def change(a, b):
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or isinstance(a, bool):
        return "", ""
    d = b - a
    pct = f"{100 * d / a:+.0f}%" if a else ""
    return f"{d:+,.2f}" if isinstance(d, float) else f"{d:+,}", pct


def main(before_path, after_path):
    before, after = (json.load(open(p, encoding="utf-8")) for p in (before_path, after_path))
    b, a = flatten(before), flatten(after)
    print(f"Before: {before['meta']['label']} ({before['meta']['date']}) · After: {after['meta']['label']} ({after['meta']['date']})\n")
    section = None
    for key in b:
        if key not in a:
            continue
        if key[0] != section:
            section = key[0]
            print(f"\n**{section}**\n")
            print("| Metric | Before median | After median | Change | % | Before p95 | After p95 | n |")
            print("|---|---|---|---|---|---|---|---|")
        vb, va = b[key], a[key]
        if isinstance(vb, dict) and "median" in vb and isinstance(va, dict) and "median" in va:
            d, pct = change(vb["median"], va["median"])
            print(f"| {key[1]} ({vb['unit']}) | {fmt(vb['median'])} | {fmt(va['median'])} | {d} | {pct} "
                  f"| {fmt(vb['p95'])} | {fmt(va['p95'])} | {vb['n']} / {va['n']} |")
        elif not isinstance(vb, dict):
            d, pct = change(vb, va)
            print(f"| {key[1]} | {fmt(vb)} | {fmt(va)} | {d} | {pct} | | | |")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
