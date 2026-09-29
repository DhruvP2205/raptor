#!/usr/bin/env python3
"""Normalization proof: independent reference implementation of the method
specified in stages/09-normalization.md, run on the organizer-supplied
fixtures.json. Deterministic; needs Python 3 + numpy.

  python3 scripts/normalization-proof.py path/to/fixtures.json [--sims 2000]

Prints (1) the fixture's design, (2) raw vs normalized scores and rank
movement per project, (3) the edge cases the fixture plants, and (4) a
simulation with KNOWN ground truth on the fixture's real judge/project
incidence, comparing raw averaging, this platform's method, and an
alternative that is evaluated but NOT implemented.
"""
import argparse, json, collections, statistics as st
import numpy as np

WEIGHTS_PCT = None  # filled from criteria key order: even split, remainder to last

def weights(keys):
    n = len(keys); base = 100 // n
    w = [base] * n; w[-1] += 100 - base * n
    return dict(zip(keys, w))

def load_reviews(fx):
    """Apply the Module 16 import rules: one submission per team (later
    entry wins), and a judge who scored both entries keeps the later one."""
    proj = {p["id"]: p for p in fx["projects"]}
    by_team = collections.defaultdict(list)
    for p in fx["projects"]:
        by_team[p["team"]].append(p)
    keep = {}                      # project id -> canonical project id
    for team, ps in by_team.items():
        latest = max(ps, key=lambda p: p["submitted_at"])
        for p in ps:
            keep[p["id"]] = latest["id"]
    w = weights(list(fx["scores"][0]["criteria"].keys()))
    reviews = {}                   # (judge, canonical project) -> rawTotal
    src = {}                       # remember whether it came from the later entry
    for s in fx["scores"]:
        cp = keep[s["project"]]
        raw = sum(s["criteria"][k] * w[k] for k in w) / 100.0
        key = (s["judge"], cp)
        is_later = (s["project"] == cp)
        if key not in reviews or (is_later and not src[key]):
            reviews[key] = raw; src[key] = is_later
    return reviews, sorted(set(keep.values())), w

def platform_normalize(reviews, min_n=3):
    """Per-judge z-score; judges with < min_n reviews use the event baseline;
    zero-variance judges get z = 0 and are flagged."""
    vals = np.array(list(reviews.values()))
    ev_mu, ev_sd = vals.mean(), vals.std(ddof=1)
    by_j = collections.defaultdict(list)
    for (j, p), v in reviews.items():
        by_j[j].append(v)
    prof, flags = {}, {}
    for j, vs in by_j.items():
        if len(vs) >= min_n:
            mu, sd = float(np.mean(vs)), float(np.std(vs, ddof=1))
            prof[j] = (mu, sd, "own")
        else:
            prof[j] = (ev_mu, ev_sd, "event-baseline")
        flags[j] = (prof[j][1] == 0.0)
    z = collections.defaultdict(list)
    for (j, p), v in reviews.items():
        mu, sd, _ = prof[j]
        z[p].append(0.0 if sd == 0.0 else (v - mu) / sd)
    return {p: float(np.mean(v)) for p, v in z.items()}, prof, flags

def dense_ranks(primary, secondary):
    """Rank by primary, then secondary; a full tie shares the rank (dense)."""
    order = sorted(primary, key=lambda p: (-round(primary[p], 9), -round(secondary[p], 9)))
    ranks, r, prev = {}, 0, None
    for p in order:
        key = (round(primary[p], 9), round(secondary[p], 9))
        if key != prev:
            r += 1; prev = key
        ranks[p] = r
    return ranks

def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float); rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])

def additive_ridge(judges, projs, y, lam_j=1.0, lam_p=1e-3):
    """Alternative (evaluated, NOT implemented): y = mu + project + judge."""
    ji = {j: i for i, j in enumerate(sorted(set(judges)))}
    pi = {p: i for i, p in enumerate(sorted(set(projs)))}
    n, J, P = len(y), len(ji), len(pi)
    X = np.zeros((n, P + J))
    for r, (j, p) in enumerate(zip(judges, projs)):
        X[r, pi[p]] = 1.0; X[r, P + ji[j]] = 1.0
    yc = np.array(y) - np.mean(y)
    pen = np.diag([lam_p] * P + [lam_j] * J)
    beta = np.linalg.solve(X.T @ X + pen, X.T @ yc)
    return {p: beta[i] for p, i in pi.items()}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("fixtures"); ap.add_argument("--sims", type=int, default=2000)
    a = ap.parse_args()
    fx = json.load(open(a.fixtures))
    reviews, projects, w = load_reviews(fx)
    raw_sum, raw_n = collections.defaultdict(float), collections.Counter()
    for (j, p), v in reviews.items():
        raw_sum[p] += v; raw_n[p] += 1
    raw = {p: raw_sum[p] / raw_n[p] for p in projects}
    norm, prof, flags = platform_normalize(reviews)
    r_raw = dense_ranks(raw, raw)
    r_norm = dense_ranks(norm, raw)
    title = {p["id"]: p["title"] for p in fx["projects"]}

    per_j = collections.Counter(j for (j, p) in reviews)
    print("== 1. FIXTURE DESIGN (after import rules) ==")
    print(f"projects scored: {len(projects)}   judges: {len(per_j)}   reviews: {len(reviews)}")
    print(f"criteria weights (even split, remainder to last key): {w}")
    print(f"reviews per project  min/median/max: {min(raw_n.values())}/{st.median(raw_n.values())}/{max(raw_n.values())}")
    print(f"reviews per judge    min/median/max: {min(per_j.values())}/{st.median(per_j.values())}/{max(per_j.values())}")
    own = [j for j, (m, s, k) in prof.items() if k == "own"]
    fb = [j for j, (m, s, k) in prof.items() if k != "own"]
    print(f"judges using their own profile (>=3 reviews): {len(own)}   using event baseline: {len(fb)}")
    jm = [prof[j][0] for j in own]
    print(f"leniency spread across judges (sd of judge means, raw scale): {np.std(jm, ddof=1):.3f}"
          f"   range {min(jm):.2f}..{max(jm):.2f}")
    print("after normalization every own-profile judge has mean z = 0 by construction")

    print("\n== 2. RAW vs NORMALIZED (dense rank; ties share) ==")
    print(f"{'project':<8}{'title':<22}{'raw':>6}{'norm':>8}{'rawRk':>7}{'normRk':>8}{'move':>6}")
    moves = []
    for p in sorted(projects, key=lambda p: (r_norm[p], -raw[p])):
        mv = r_raw[p] - r_norm[p]   # positive = moved up under normalization
        moves.append(mv)
        print(f"{p:<8}{title[p][:20]:<22}{raw[p]:>6.2f}{norm[p]:>8.2f}{r_raw[p]:>7}{r_norm[p]:>8}{mv:>+6}")
    ch = sum(1 for m in moves if m != 0)
    print(f"\nprojects whose rank changed: {ch}/{len(projects)}   max move: {max(abs(m) for m in moves)}"
          f"   Spearman(raw, normalized): {spearman([raw[p] for p in projects],[norm[p] for p in projects]):.3f}")
    top_raw = sorted(projects, key=lambda p: r_raw[p])[:5]; top_norm = sorted(projects, key=lambda p: r_norm[p])[:5]
    print(f"top-5 by raw:        {top_raw}\ntop-5 by normalized: {top_norm}")

    print("\n== 3. EDGE CASES THE FIXTURE PLANTS ==")
    zv = [j for j, f in flags.items() if f]
    print(f"zero-variance judges (z=0, flagged for organizer): {zv}")
    print(f"judges below minimum-N (event baseline used): {sorted(fb)}")
    dup = [t for t, ps in collections.defaultdict(list, {}).items()]
    print("resubmission: team with two entries collapsed to one submission; judges who scored both keep the later score")

    print(f"\n== 4. SIMULATION WITH KNOWN TRUTH ({a.sims} runs, fixture's real judge/project incidence) ==")
    print("score = judge_bias + judge_scale * true_quality + noise ;  Spearman vs true quality")
    inc = list(reviews.keys())
    judges = [j for j, p in inc]; projs = [p for j, p in inc]
    pl = sorted(set(projs)); js = sorted(set(judges))
    rng = np.random.default_rng(42)
    def lenience_ratio(vals_by_review):
        byj = collections.defaultdict(list)
        for (j, p), v in vals_by_review.items(): byj[j].append(v)
        means = [np.mean(v) for v in byj.values() if len(v) >= 3]
        return float(np.std(means, ddof=1) / np.std(list(vals_by_review.values()), ddof=1))
    R_fix = lenience_ratio(reviews)
    scen = [(f"tau={t}", t) for t in (0.0, 0.25, 0.5, 0.75, 1.0, 1.5)]
    print(f"{'scenario':<12}{'leniency R':>11}{'raw mean':>10}{'platform z':>12}{'additive*':>11}   platform>=raw")
    for name, tau in scen:
        rs, zs, ads, Rs = [], [], [], []
        for _ in range(a.sims):
            q = {p: rng.normal() for p in pl}
            b = {j: rng.normal(0, tau) for j in js}
            s = {j: float(np.exp(rng.normal(0, 0.25))) for j in js}
            y = {k: b[k[0]] + s[k[0]] * q[k[1]] + rng.normal(0, 0.7) for k in inc}
            truth = [q[p] for p in pl]
            Rs.append(lenience_ratio(y))
            rsum = collections.defaultdict(list)
            for (j, p), v in y.items(): rsum[p].append(v)
            rs.append(spearman(truth, [np.mean(rsum[p]) for p in pl]))
            zn, _, _ = platform_normalize(y); zs.append(spearman(truth, [zn[p] for p in pl]))
            ar = additive_ridge(judges, projs, [y[k] for k in inc]); ads.append(spearman(truth, [ar[p] for p in pl]))
        print(f"{name:<12}{np.mean(Rs):>11.3f}{np.mean(rs):>10.3f}{np.mean(zs):>12.3f}{np.mean(ads):>11.3f}   {np.mean(np.array(zs)>=np.array(rs)):.0%}")
    print("* additive = project+judge effects with ridge on judges; evaluated only, NOT implemented in the platform")
    print(f"\n== 5. WHERE THE REAL FIXTURE SITS ==")
    print("leniency R = sd(judge means, judges with >=3 reviews) / sd(all review scores). Higher = judges differ more.")
    print(f"fixture R = {R_fix:.3f}   (compare with the R column above: the row with the closest R is the regime this data resembles)")

if __name__ == "__main__":
    main()
