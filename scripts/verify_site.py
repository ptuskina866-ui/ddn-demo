"""Dependency-free checks for the deployable, static Dream Design demo."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class ResourceParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.resources: list[str] = []
        self.form_actions: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form' and attrs.get('action'):
            self.form_actions.append(attrs['action'])
        for attr in ('src', 'poster'):
            if attrs.get(attr):
                self.resources.append(attrs[attr])
        if tag == 'link' and attrs.get('href'):
            self.resources.append(attrs['href'])
        if attrs.get('srcset'):
            self.resources.extend(part.strip().split()[0] for part in attrs['srcset'].split(',') if part.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=Path(__file__).resolve().parents[1] / 'dist')
    args = parser.parse_args()
    dist = args.dist.resolve()
    errors: list[str] = []
    warnings: list[str] = []
    checked_assets: set[str] = set()

    def error(message: str):
        errors.append(message)

    def check_asset(value, origin: str, base: Path | None = None):
        if not value or not isinstance(value, str):
            return
        value = value.strip()
        if value.startswith(('data:', 'blob:', '#', 'mailto:', 'tel:')):
            return
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc:
            error(f'{origin}: resource is not local: {value}')
            return
        if value.startswith('/'):
            error(f'{origin}: absolute path will break project Pages: {value}')
            return
        relative = unquote(parsed.path)
        if not relative:
            return
        candidate = ((base or dist) / relative).resolve()
        if not candidate.is_relative_to(dist):
            error(f'{origin}: resource escapes dist: {value}')
            return
        checked_assets.add(str(candidate.relative_to(dist)))
        if not candidate.is_file():
            error(f'{origin}: missing local resource: {value}')

    for required in ('index.html', 'app.js', 'styles.css', 'data/site.json'):
        if not (dist / required).is_file():
            error(f'Missing deployable file: {required}')
    if errors:
        print('\n'.join('ERROR ' + item for item in errors))
        return 1

    all_files = [item for item in dist.rglob('*') if item.is_file()]
    total_bytes = sum(item.stat().st_size for item in all_files)
    if total_bytes > 1_000_000_000:
        error(f'dist exceeds the 1 GB published GitHub Pages site limit: {total_bytes} bytes')
    for item in all_files:
        if item.stat().st_size > 100 * 1024 * 1024:
            error(f'File exceeds normal GitHub Git upload limit: {item.relative_to(dist)}')

    try:
        data = json.loads((dist / 'data/site.json').read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as exc:
        print(f'ERROR Unable to read site.json: {exc}')
        return 1
    if data.get('stats', {}).get('captureInProgress'):
        error('Source capture is still in progress; do not publish this snapshot yet')

    sections = ('categories', 'products', 'projects', 'pages')
    for section in sections:
        if not isinstance(data.get(section), list):
            error(f'site.json: {section} must be an array')
            data[section] = []

    ids = {}
    for section in ('categories', 'products', 'projects'):
        values = [str(item.get('id', '')) for item in data[section]]
        for identifier, count in Counter(values).items():
            if not identifier or count > 1:
                error(f'{section}: empty/duplicate id {identifier!r} ({count})')
        ids[section] = set(values)

    weapon_records = []
    sales_re = re.compile(r'\b(?:купить|купите|заказать|закажите|оформить\s+заказ|добавить\s+в\s+корзину|по\s+вопросам\s+приобретения|скидк[аиу]|распродажа)\b', re.I)
    for section in sections:
        for item in data[section]:
            origin = f'{section}/{item.get("slug", item.get("id", "?"))}'
            for field in ('image', 'thumbnail', 'cover'):
                check_asset(item.get(field), origin + ':' + field)
            for image in item.get('images', []):
                check_asset(image.get('src') if isinstance(image, dict) else image, origin + ':image')
            html = item.get('descriptionHtml', item.get('html', '')) or ''
            html_parser = ResourceParser()
            html_parser.feed(html)
            for value in html_parser.resources:
                check_asset(value, origin + ':html')
            for action in html_parser.form_actions:
                if action != '#':
                    error(f'{origin}: original live form action remains: {action}')
            if section == 'products':
                for category in item.get('categoryIds', []):
                    if str(category) not in ids['categories']:
                        error(f'{origin}: unknown category {category}')
            if section == 'categories':
                parent = item.get('parentId')
                if parent not in (None, '', 0, '0') and str(parent) not in ids['categories']:
                    error(f'{origin}: unknown parent category {parent}')
                for product in item.get('productIds', []):
                    if str(product) not in ids['products']:
                        error(f'{origin}: unknown product {product}')
            if item.get('isWeapon'):
                weapon_records.append(origin)
                description = ' '.join(str(item.get(k, '') or '') for k in ('descriptionText', 'descriptionHtml', 'text', 'html'))
                if sales_re.search(description):
                    error(f'{origin}: commercial weapon copy remains')
                for field in ('price', 'salePrice', 'regularPrice'):
                    if item.get(field) not in (None, '', 0, '0', False):
                        error(f'{origin}: weapon pricing remains in {field}')

    # Additional company-level images and the shared asset map.
    def walk_images(value, origin='site'):
        if isinstance(value, dict):
            for key, item in value.items():
                if key.lower() in ('logo', 'logoimage', 'heroimage') and isinstance(item, str):
                    check_asset(item, origin + ':' + key)
                elif isinstance(item, (list, dict)):
                    walk_images(item, origin + ':' + key)
        elif isinstance(value, list):
            for item in value:
                walk_images(item, origin)
    walk_images(data.get('company', {}), 'company')
    for key, value in data.get('assets', {}).items():
        if isinstance(value, str) and value.startswith(('assets/', './assets/')):
            check_asset(value, 'assets:' + key)

    trackers = re.compile(r'(?:mc\.yandex\.ru|googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|navigator\.sendBeacon\s*\()', re.I)
    secrets = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
    external_fetch = re.compile(r'fetch\s*\(\s*[\'\"]https?://', re.I)
    for path in dist.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in ('.html', '.js', '.css', '.json'):
            continue
        text = path.read_text(encoding='utf-8-sig')
        rel = str(path.relative_to(dist))
        if trackers.search(text):
            error(f'{rel}: tracker/external telemetry remains')
        if secrets.search(text):
            error(f'{rel}: potential secret')
        if path.suffix.lower() == '.js' and external_fetch.search(text):
            error(f'{rel}: direct external request needs review')
        if path.suffix.lower() == '.html':
            html_parser = ResourceParser()
            html_parser.feed(text)
            for value in html_parser.resources:
                check_asset(value, rel, path.parent)
            for action in html_parser.form_actions:
                if action != '#':
                    error(f'{rel}: live form action remains: {action}')
        if path.suffix.lower() == '.css':
            for match in re.finditer(r'url\(\s*[\'\"]?([^\)\'\"]+)', text):
                value = match.group(1).strip()
                check_asset(value, rel + ':url', path.parent)

    if not data['products']:
        warnings.append('No product records. Check the harvest report before publication.')
    report_path = dist.parent / 'manifest/report.json'
    print(f'Static site: {dist}')
    print(f'Deployable size: {total_bytes / 1_000_000:.1f} MB in {len(all_files)} files')
    print('Records: ' + ', '.join(f'{key}={len(data[key])}' for key in sections))
    print(f'Local resource references checked: {len(checked_assets)}')
    print(f'Neutral weapon records checked: {len(weapon_records)}')
    if report_path.is_file():
        print(f'Harvest coverage report: {report_path.relative_to(dist.parent)}')
        try:
            report = json.loads(report_path.read_text(encoding='utf-8-sig'))
            coverage = []
            for key, value in report.get('rest', {}).items():
                captured, expected = value.get('captured'), value.get('expected')
                coverage.append(f'{key}={captured}/{expected}')
                if isinstance(captured, int) and isinstance(expected, int) and captured != expected:
                    error(f'Incomplete REST capture for {key}: {captured}/{expected}')
            if coverage:
                print('Source REST coverage: ' + ', '.join(coverage))
            assets = report.get('assets', {})
            if assets:
                print(f'Source images: {assets.get("captured")}/{assets.get("requested")} captured')
                if assets.get('errors'):
                    warnings.append(f'{len(assets["errors"])} source images could not be downloaded; inspect the harvest report.')
            archives = report.get('archives', {})
            if archives:
                print(f'Source catalogue archives: {archives.get("capturedPages")}/{archives.get("expectedPages")} pages')
                if archives.get('capturedPages') != archives.get('expectedPages'):
                    warnings.append('Some catalogue archive pages were unavailable; compare REST coverage and category assignments.')
            if report.get('errors'):
                warnings.append(f'{len(report["errors"])} source requests failed; inspect the harvest report.')
            if report.get('missingCategoryProducts'):
                warnings.append(f'{len(report["missingCategoryProducts"])} products have no captured category assignment.')
        except (OSError, ValueError, TypeError) as exc:
            error(f'Cannot read harvest coverage report: {exc}')
    else:
        warnings.append('Harvest coverage report is not present; no completeness claim can be made.')
    for message in warnings:
        print('WARNING ' + message)
    for message in errors:
        print('ERROR ' + message)
    print(f'Result: {len(errors)} errors, {len(warnings)} warnings')
    return int(bool(errors))


if __name__ == '__main__':
    sys.exit(main())
