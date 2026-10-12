"""Generate VarStat's sample datasets (examples/*.csv).

Every value is simulated from a fixed seed and a simple effects model, so the
files are original to VarStat. Run: python3 tools_examples.py
"""
import csv, os
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'examples')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261012)


def save(name, header, rows):
    with open(os.path.join(OUT, name), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def r(x, d=1):
    return round(float(x), d)


# 1. Completely randomized, unequal replication
diets = {'Diet A': (24.0, 6), 'Diet B': (29.5, 5), 'Diet C': (27.0, 6), 'Diet D': (33.0, 4)}
save('crd_diets.csv', ['Diet', 'WeightGain'],
     [[d, r(m + rng.normal(0, 2.5))] for d, (m, n) in diets.items() for _ in range(n)])

# 2. Randomized complete blocks
cult = {'Aurora': 4.1, 'Bravo': 5.2, 'Cedar': 4.6, 'Delta': 6.0, 'Echo': 5.5, 'Falcon': 3.8}
blk = [0.3, -0.2, 0.1, -0.2]
save('rcbd_cultivars.csv', ['Block', 'Cultivar', 'Yield'],
     [[b + 1, c, r(m + blk[b] + rng.normal(0, 0.35), 2)] for b in range(4) for c, m in cult.items()])

# 3. Latin square 5x5 (cyclic square with shuffled rows, columns and letters)
L = np.array([[(i + j) % 5 for j in range(5)] for i in range(5)])
L = L[rng.permutation(5)][:, rng.permutation(5)]
letters = np.array(list('ABCDE'))[rng.permutation(5)]
teff = {'A': 0, 'B': 3.5, 'C': 1.5, 'D': 5.0, 'E': 2.0}
re_, ce = rng.normal(0, 1.5, 5), rng.normal(0, 1.0, 5)
save('latin_square.csv', ['Row', 'Column', 'Treatment', 'Yield'],
     [[i + 1, j + 1, letters[L[i, j]], r(40 + teff[letters[L[i, j]]] + re_[i] + ce[j] + rng.normal(0, 1.2))]
      for i in range(5) for j in range(5)])

# 4. 2x2x2 factorial in 4 blocks
rows = []
for b in range(4):
    for n in (0, 1):
        for p in (0, 1):
            for k in (0, 1):
                y = 3.0 + 0.9 * n + 0.5 * p + 0.15 * k + 0.35 * n * p + 0.1 * b + rng.normal(0, 0.2)
                rows.append([b + 1, n, p, k, r(y, 2)])
save('factorial_npk.csv', ['Block', 'N', 'P', 'K', 'Yield'], rows)

# 5. Factorial (irrigation x variety) in blocks
irr = {'Low': 0, 'Medium': 6, 'High': 9}
var = {'V1': 0, 'V2': 4, 'V3': 2, 'V4': 7}
save('factorial_blocks.csv', ['Block', 'Irrigation', 'Variety', 'Biomass'],
     [[b + 1, i, v, r(50 + ie + ve + (3 if (i == 'High' and v == 'V4') else 0) + 1.5 * b + rng.normal(0, 2))]
      for b in range(3) for i, ie in irr.items() for v, ve in var.items()])

# 6. Split plot: tillage on main plots, cultivar on subplots, 4 blocks
till = {'Conventional': 0, 'Minimum': 0.4, 'No-till': 0.7}
rows = []
for b in range(4):
    for t, te in till.items():
        wp = rng.normal(0, 0.25)
        for c, ceff in {'Early': 0, 'Late': 0.5}.items():
            rows.append([b + 1, t, c, r(5 + te + ceff + (0.3 if (t == 'No-till' and c == 'Late') else 0) + wp + rng.normal(0, 0.15), 2)])
save('split_plot.csv', ['Block', 'Tillage', 'Cultivar', 'Yield'], rows)

# 7. Split plot in time: 4 fertilizer rates (CRD, 5 pots each) measured at 3 dates
rows = []
for f, fe in {'0': 0, '50': 2, '100': 3.5, '150': 4}.items():
    for rep in range(5):
        pot = rng.normal(0, 1.0)
        for d, de in {'14': 0, '28': 8, '42': 15}.items():
            rows.append([f, rep + 1, d, r(10 + fe * (1 + int(d) / 28) + de + pot + rng.normal(0, 0.8))])
save('split_plot_time.csv', ['Fertilizer', 'Pot', 'Day', 'Height'], rows)

# 8. Regression on doses in blocks
save('doses.csv', ['Block', 'Dose', 'Yield'],
     [[b + 1, d, r(2.2 + 0.035 * d - 0.00012 * d * d + 0.15 * (b - 1.5) + rng.normal(0, 0.18), 2)]
      for b in range(4) for d in (0, 40, 80, 120, 160)])

# 9. Multiple regression
n = 30
X1, X2, X3 = rng.uniform(10, 40, n), rng.uniform(0, 5, n), rng.uniform(100, 300, n)
Y = 5 + 0.8 * X1 + 3.0 * X2 + 0.002 * X3 + rng.normal(0, 2.5, n)
save('multiple_regression.csv', ['X1', 'X2', 'X3', 'Y'], [[r(a), r(b, 2), r(c, 0), r(y)] for a, b, c, y in zip(X1, X2, X3, Y)])

# 10. One sample, descriptive statistics
save('soil_sample.csv', ['pH', 'Clay'], [[r(rng.normal(5.6, 0.45), 2), r(rng.gamma(6, 5))] for _ in range(40)])

# 11. Two groups
save('two_groups.csv', ['Group', 'Response'],
     [[g, r(m + rng.normal(0, 3))] for g, m in (('Control', 48.0), ('Treated', 52.5)) for _ in range(12)])

# 12. Normality
save('normality.csv', ['Symmetric', 'Skewed'], [[r(rng.normal(20, 3), 2), r(rng.lognormal(2, 0.7), 2)] for _ in range(25)])

# 13. Augmented blocks: 2 checks in every block, 9 new entries once per replicate
rows, plot = [], 0
newe = [f'G{i}' for i in range(1, 10)]
geff = dict(zip(newe, rng.normal(0, 0.45, 9)))
for rep in (1, 2):
    order = list(rng.permutation(newe))
    for bl in (1, 2, 3):
        beff = rng.normal(0, 0.4)
        entries = [('Check', 'C1', 0.2), ('Check', 'C2', -0.1)] + [('New', g, geff[g]) for g in order[(bl - 1) * 3: bl * 3]]
        for tipo, trat, e in entries:
            rows.append([rep, bl, tipo, trat, r(2.5 + 0.15 * (rep - 1.5) + beff + e + rng.normal(0, 0.3), 2)])
save('augmented_blocks.csv', ['Rep', 'Block', 'Type', 'Entry', 'Yield'], rows)

print('wrote', sorted(os.listdir(OUT)))
