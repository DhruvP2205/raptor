#!/usr/bin/env python3
"""Reference Bradley-Terry estimator for the pairwise-mode DESIGN
(stages/23-pairwise-mode.md). Not part of the running platform.

  python3 scripts/bradley-terry-reference.py [--runs 500]

MM updates (Hunter 2004) with a virtual reference item: every project
gets one pseudo-win and one pseudo-loss against it, so an undefeated /
winless project stays finite and a disconnected comparison graph still
yields a total order. Reports rank recovery vs. comparisons per project.
"""
import argparse, numpy as np

def bt_fit(n, comps, iters=500, tol=1e-10):
    """comps: list of (winner, loser). Returns (strengths, iterations)."""
    wins = np.full(n, 1.0)            # pseudo-win vs virtual item
    pair = np.zeros((n, n))
    for w, l in comps:
        wins[w] += 1.0; pair[w, l] += 1.0; pair[l, w] += 1.0
    p = np.ones(n)
    for it in range(iters):
        denom = (pair / (p[:, None] + p[None, :])).sum(axis=1) + 2.0 / (p + 1.0)
        new = wins / denom
        new /= np.exp(np.mean(np.log(new)))     # fix the scale
        if np.max(np.abs(np.log(new) - np.log(p))) < tol:
            return new, it + 1
        p = new
    return p, iters

def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float); rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])

def simulate(n, k, rng):
    true = rng.normal(0, 1, n)                       # log-strength
    need = np.full(n, k)                             # balanced: each project appears ~k times
    comps = []
    for _ in range(n * k // 2):
        pool = np.flatnonzero(need > 0)
        if len(pool) < 2: break
        i, j = rng.choice(pool, 2, replace=False)
        need[i] -= 1; need[j] -= 1
        pi = 1 / (1 + np.exp(-(true[i] - true[j])))
        comps.append((i, j) if rng.random() < pi else (j, i))
    s, it = bt_fit(n, comps)
    return spearman(true, np.log(s)), it, len(comps)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--runs", type=int, default=500); a = ap.parse_args()
    rng = np.random.default_rng(7); n = 40
    print(f"{n} projects, balanced random pairs, judge choice follows the BT model; {a.runs} runs each")
    print(f"{'comparisons/project':>20}{'total pairs':>13}{'Spearman vs truth':>19}{'MM iterations':>15}")
    for k in (3, 5, 8, 12, 20):
        r = [simulate(n, k, rng) for _ in range(a.runs)]
        print(f"{k:>20}{int(np.mean([x[2] for x in r])):>13}{np.mean([x[0] for x in r]):>19.3f}{np.mean([x[1] for x in r]):>15.1f}")
    # sanity: an undefeated project stays finite; a disconnected graph still ranks
    s, _ = bt_fit(4, [(0, 1), (0, 1), (2, 3)])
    print("\nsanity (0 beats 1 twice, 2 beats 3 once, two disconnected pairs):", np.round(s, 3), "all finite:", bool(np.all(np.isfinite(s))))
