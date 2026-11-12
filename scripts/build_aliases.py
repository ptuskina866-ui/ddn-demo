"""Generate safe static redirects from original ddn.by paths to demo routes."""
from __future__ import annotations

import argparse
import html
import json
import os
import re
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit

MARKER = '<!-- ddn-demo:generated-alias -->'
PAGE_ROUTES = {
    'about-us': '#/about', 'contacts': '#/contacts', 'catalog': '#/catalog',
    'our-works': '#/projects', 'getting-started': '#/',
    'my-account': '#/privacy', 'checkout': '#/privacy',
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=Path(__file__).resolve().parents[1] / 'dist')
    args = parser.parse_args()
    dist = args.dist.resolve()
    source = dist / 'data/site.json'
    if not (dist / 'index.html').is_file():
        raise SystemExit('dist/index.html must exist before aliases are generated')
    data = json.loads(source.read_text(encoding='utf-8-sig'))
    generated, skipped, conflicts = [], [], []
    plans: dict[str, tuple[str, str]] = {}

    def add_plan(original: str, route: str):
        parsed = urlsplit(original)
        if parsed.scheme not in ('http', 'https') or parsed.hostname not in ('ddn.by', 'www.ddn.by'):
            skipped.append({'url': original, 'reason': 'not an original ddn.by URL'})
            return
        decoded = unquote(parsed.path)
        if decoded in ('', '/'):
            skipped.append({'url': original, 'reason': 'root is served by the real dist/index.html'})
            return
        parts = PurePosixPath(decoded).parts
        if '..' in parts or '\\' in decoded or re.search(r'[<>:"|?*\x00-\x1f]', decoded):
            skipped.append({'url': original, 'reason': 'unsafe or unsupported path'})
            return
        relative = decoded.lstrip('/')
        existing = plans.get(relative)
        if existing and existing[0] != route:
            conflicts.append({'url': original, 'reason': 'one source path maps to multiple routes'})
            return
        plans[relative] = (route, original)

    for section, prefix in [('products', 'product'), ('categories', 'category'), ('projects', 'project'), ('pages', 'page')]:
        for item in data.get(section, []):
            original = item.get('url') or ''
            route = '#/' + prefix + '/' + quote(str(item.get('slug', '')), safe='')
            if item.get('isWeapon'):
                route = '#/reference'
            elif section == 'pages':
                route = '#/privacy' if item.get('service') else PAGE_ROUTES.get(item.get('slug'), route)
            add_plan(original, route)

    # Old catalogue page numbers do not correspond to the new page size/order.
    # Keep the original archive paths usable without pretending the lists match.
    capture_report = dist.parent / 'manifest/report.json'
    if capture_report.is_file():
        captured = json.loads(capture_report.read_text(encoding='utf-8-sig'))
        for original in captured.get('archives', {}).get('pages', {}):
            if re.fullmatch(r'/catalog/page/\d+/?', urlsplit(original).path):
                add_plan(original, '#/catalog/all')

    for relative, (route, original) in sorted(plans.items()):
        path = dist / relative
        # Pretty URLs are directories; an explicit .html source URL remains a file.
        target = path if path.suffix.lower() in ('.html', '.htm') else path / 'index.html'
        target = target.resolve()
        if not target.is_relative_to(dist) or target == dist / 'index.html':
            conflicts.append({'url': original, 'reason': 'target escapes dist or would replace the real home'})
            continue
        if target.exists() and MARKER not in target.read_text(encoding='utf-8-sig'):
            conflicts.append({'url': original, 'reason': 'existing real file was not overwritten'})
            continue
        relative_root = Path(os.path.relpath(dist, target.parent)).as_posix()
        destination = relative_root.rstrip('/') + '/index.html' + route
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            '<!doctype html>\n' + MARKER + '\n'
            '<html lang="ru"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta name="robots" content="noindex,nofollow">'
            '<meta http-equiv="refresh" content="0;url=' + html.escape(destination, quote=True) + '">'
            '<title>Dream Design — демонстрационная версия</title></head>'
            '<body><p>Переходим к демонстрационной странице.</p>'
            '<p><a href="' + html.escape(destination, quote=True) + '">Открыть страницу</a></p>'
            '<script>location.replace(new URL(' + json.dumps(destination, ensure_ascii=False) + ',location.href).href);</script>'
            '</body></html>\n', encoding='utf-8')
        generated.append({'source': original, 'file': target.relative_to(dist).as_posix(), 'route': route})

    # Only create or update these two explicitly owned demo configuration files.
    (dist / '.nojekyll').write_text('', encoding='utf-8')
    (dist / 'robots.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')
    report = {'generatedCount': len(generated), 'generated': generated, 'skipped': skipped, 'conflicts': conflicts}
    manifest = dist.parent / 'manifest'
    manifest.mkdir(parents=True, exist_ok=True)
    (manifest / 'aliases.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Original-path aliases: {len(generated)} generated, {len(skipped)} skipped, {len(conflicts)} conflicts')
    for conflict in conflicts:
        print('ERROR ' + conflict['url'] + ': ' + conflict['reason'])
    return int(bool(conflicts))


if __name__ == '__main__':
    raise SystemExit(main())
