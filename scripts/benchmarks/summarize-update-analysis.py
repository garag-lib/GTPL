import json, pathlib, statistics, collections

root = pathlib.Path(__file__).resolve().parents[2] / 'artifacts/update-analysis'
report = json.loads((root / 'results.json').read_text())
summary = {'counts': {}, 'experiments': {}, 'profiles': {}}
for record in report['records']:
    if record['kind'] == 'counts':
        summary['counts'][record['name']] = record['operations'][0]['counts']

for name in ['append', 'remove', 'update', 'attrs', 'attrsNested']:
    rows = [r for r in report['records'] if r['kind'] == 'timing' and r['name'] == name]
    by_variant = {}
    for row in rows:
        by_variant.setdefault(row['variant'], []).append({
            'round': row['round'],
            **{metric: statistics.median(op[metric] for op in row['operations'])
               for metric in ['dispatchMs', 'applyMs', 'layoutMs', 'totalMs']}
        })
    baseline = {r['round']: r for r in by_variant['plain']}
    candidate = next(key for key in by_variant if key != 'plain')
    ratios = [r['totalMs'] / baseline[r['round']]['totalMs'] for r in by_variant[candidate]]
    summary['experiments'][name] = {
        'candidate': candidate, 'rounds': by_variant,
        'medianPairedReductionPercent': (1 - statistics.median(ratios)) * 100,
        'pairedReductionRangePercent': [(1 - max(ratios)) * 100, (1 - min(ratios)) * 100],
        'medians': {variant: {metric: statistics.median(r[metric] for r in rows)
                             for metric in ['dispatchMs', 'applyMs', 'layoutMs', 'totalMs']}
                    for variant, rows in by_variant.items()}
    }

for record in report['records']:
    if record['kind'] != 'profile':
        continue
    name = record['name']
    clock = next(r for r in report['records'] if r['kind'] == 'clock' and r['name'] == name)
    navigation = next(m['value'] for m in clock['metrics'] if m['name'] == 'NavigationStart') * 1e6
    windows = [(navigation + op['startRelative'] * 1000, navigation + op['endRelative'] * 1000)
               for op in record['operations']]
    profile = json.loads((root / (name + '.cpuprofile')).read_text())
    nodes = {n['id']: n for n in profile['nodes']}
    parents = {child: n['id'] for n in profile['nodes'] for child in n.get('children', [])}
    totals = collections.Counter()
    leaves = collections.Counter()
    sampled_us = 0
    now = profile['startTime']
    for node_id, delta in zip(profile['samples'], profile['timeDeltas']):
        old = now
        now += delta
        # Attribute only samples ending inside measured update windows; no resets or validation.
        window = next(((a, b) for a, b in windows if a <= now <= b), None)
        if window is None:
            continue
        delta = min(delta, now - window[0])
        stack = []
        cursor = node_id
        while cursor in nodes:
            stack.append(nodes[cursor]['callFrame']['functionName'])
            cursor = parents.get(cursor)
        sampled_us += delta
        leaves[stack[0]] += delta
        for function in set(stack):
            totals[function] += delta
    summary['profiles'][name] = {
        'sampledMs': sampled_us / 1000,
        'windowMs': sum(b - a for a, b in windows) / 1000,
        'selfTop': [(name, round(t / sampled_us * 100, 2)) for name, t in leaves.most_common(20)],
        'inclusiveTop': [(name, round(t / sampled_us * 100, 2)) for name, t in totals.most_common(30)],
        'note': 'Inclusive percentages overlap; profiler and diagnostic fixture differ from ranked benchmark.'
    }
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
for name, data in summary['experiments'].items():
    print(name, json.dumps({k: v for k, v in data.items() if k != 'rounds'}))
for name, data in summary['profiles'].items():
    print('PROFILE', name, json.dumps(data))
