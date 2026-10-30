"""
compare_benchmarks.py — before/after table for benchmark runs.

    python scripts/compare_benchmarks.py BEFORE.json AFTER.json
    python scripts/compare_benchmarks.py A-r1.json A-r2.json -- B-r1.json B-r2.json

With several runs per side (interleaved A, B, A, B on the same machine),
each metric is the median of the per-run medians, and the spread across
runs is shown so noise is visible. Prints Markdown. Lower is better for
every timing.
"""
import json
import statistics
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
    if isinstance(x, bool) or x is None:
        return str(x)
    if isinstance(x, float):
        return f"{x:,.2f}" if abs(x) < 100 else f"{x:,.0f}"
    return f"{x:,}" if isinstance(x, int) else str(x)


def value(v, key):
    if isinstance(v, dict):
        return v.get(key)
    return v if key == "median" and isinstance(v, (int, float)) and not isinstance(v, bool) else None


def combine(runs, key, field):
    vals = [value(r[key], field) for r in runs if key in r]
    vals = [v for v in vals if isinstance(v, (int, float))]
    if not vals:
        return None, None
    return statistics.median(vals), (min(vals), max(vals)) if len(vals) > 1 else None


def main(before_paths, after_paths):
    load = lambda ps: [json.load(open(p, encoding="utf-8")) for p in ps]
    before, after = load(before_paths), load(after_paths)
    b, a = [flatten(r) for r in before], [flatten(r) for r in after]
    print(f"Before: {', '.join(r['meta']['label'] for r in before)} · After: {', '.join(r['meta']['label'] for r in after)}")
    multi = len(b) > 1 or len(a) > 1
    section = None
    for key in b[0]:
        if not all(key in r for r in a):
            continue
        if key[0] != section:
            section = key[0]
            print(f"\n**{section}**\n")
            print("| Metric | Before | After | Change | % | Before p95 | After p95 |" + (" Before range | After range |" if multi else ""))
            print("|---|---|---|---|---|---|---|" + ("---|---|" if multi else ""))
        unit = b[0][key].get("unit", "") if isinstance(b[0][key], dict) else ""
        mb, rb = combine(b, key, "median")
        ma, ra = combine(a, key, "median")
        if mb is None or ma is None:
            continue
        pb, _ = combine(b, key, "p95")
        pa, _ = combine(a, key, "p95")
        d = ma - mb
        pct = f"{100 * d / mb:+.0f}%" if mb else ""
        row = (f"| {key[1]}{f' ({unit})' if unit else ''} | {fmt(mb)} | {fmt(ma)} | {d:+,.2f} | {pct} "
               f"| {fmt(pb) if pb is not None else ''} | {fmt(pa) if pa is not None else ''} |")
        if multi:
            rng = lambda r: f"{fmt(r[0])}–{fmt(r[1])}" if r else ""
            row += f" {rng(rb)} | {rng(ra)} |"
        print(row)


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--" in args:
        i = args.index("--")
        before, after = args[:i], args[i + 1:]
    elif len(args) == 2:
        before, after = [args[0]], [args[1]]
    else:
        sys.exit(__doc__)
    main(before, after)
