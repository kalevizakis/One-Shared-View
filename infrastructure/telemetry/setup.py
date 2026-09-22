#!/usr/bin/env python3
"""
ESSENCE Token Dashboard — Setup Script
Deploys the full telemetry pipeline to ~/.essence-telemetry/ and starts Docker containers.

Usage:
    python setup.py              # Interactive setup
    python setup.py --no-prompt  # Non-interactive (accept all defaults)
    python setup.py --sync       # Re-copy source files (hash-compare, skip unchanged)
    python setup.py --install-launcher  # Install essence-code to PATH
    python setup.py --uninstall  # Stop containers and remove files

Requirements:
    - Docker Desktop running
    - VS Code 1.121+ with github.copilot.chat.otel settings

What it does:
    1. Creates ~/.essence-telemetry/ with all pipeline files
    2. Starts 4 Docker containers (postgres, receiver, aspire, updater)
    3. Configures VS Code OTLP settings (user-level)
    4. Opens the dashboard in your default browser
"""

import os
import sys
import json
import shutil
import subprocess
import argparse
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
INSTALL_DIR = Path.home() / '.essence-telemetry'
DASHBOARD_FILE = 'essence-token-dashboard.html'
_SETTINGS_FILENAME = 'settings.json'

# Files to copy from the skill package to the install directory
COPY_FILES = [
    'docker-compose.yml',
    '.env.example',
    'init.sql',
    'updater.Dockerfile',
    'update-server.py',
    'update-dashboard.py',
    'pricing.py',  # updater.Dockerfile COPYs this into the build context
    DASHBOARD_FILE,
]
COPY_DIRS = [
    'receiver',
]

# VS Code settings to apply
VSCODE_OTEL_SETTINGS = {
    "github.copilot.chat.otel.enabled": True,
    "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
    "github.copilot.chat.otel.captureContent": False,
    "github.copilot.chat.otel.dbSpanExporter.enabled": True,
}


def check_docker():
    """Verify Docker is available and running."""
    try:
        result = subprocess.run(
            ['docker', 'info'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            print('ERROR: Docker is installed but not running.')
            print('       Start Docker Desktop and try again.')
            return False
        return True
    except FileNotFoundError:
        print('ERROR: Docker not found on PATH.')
        print('       Install Docker Desktop: https://www.docker.com/products/docker-desktop/')
        return False
    except subprocess.TimeoutExpired:
        print('ERROR: Docker timed out — it may be starting up.')
        return False


def copy_files():
    """Copy pipeline files to ~/.essence-telemetry/."""
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    for f in COPY_FILES:
        src = SCRIPT_DIR / f
        dst = INSTALL_DIR / f
        if src.exists():
            shutil.copy2(src, dst)
            print(f'  ✓ {f}')
        else:
            print(f'  ✗ {f} (not found in skill package)')

    for d in COPY_DIRS:
        src = SCRIPT_DIR / d
        dst = INSTALL_DIR / d
        if src.exists():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print(f'  ✓ {d}/')
        else:
            print(f'  ✗ {d}/ (not found in skill package)')


def write_env_file():
    """Write .env file for docker-compose with credentials and dashboard directory."""
    import secrets
    env_path = INSTALL_DIR / '.env'
    # Preserve existing secrets if .env already exists
    existing = {}
    if env_path.exists():
        for line in env_path.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                existing[k.strip()] = v.strip()
    pg_pass = existing.get('POSTGRES_PASSWORD') or secrets.token_urlsafe(16)
    aspire_key = existing.get('ASPIRE_API_KEY') or secrets.token_urlsafe(16)
    env_path.write_text(
        f'ESSENCE_DASHBOARD_DIR={INSTALL_DIR}\n'
        f'POSTGRES_PASSWORD={pg_pass}\n'
        f'ASPIRE_API_KEY={aspire_key}\n',
        encoding='utf-8'
    )
    os.chmod(str(env_path), 0o600)
    print(f'  ✓ .env (credentials generated, ESSENCE_DASHBOARD_DIR={INSTALL_DIR})')


def start_containers():
    """Run docker compose up -d."""
    print('\nStarting Docker containers...')
    result = subprocess.run(
        ['docker', 'compose', 'up', '-d', '--build'],
        cwd=str(INSTALL_DIR),
        capture_output=True, text=True, timeout=300
    )
    if result.returncode == 0:
        print('  ✓ All containers started')
        return True
    else:
        print(f'  ✗ docker compose failed:\n{result.stderr[-500:]}')
        return False


def stop_containers():
    """Run docker compose down."""
    print('\nStopping Docker containers...')
    result = subprocess.run(
        ['docker', 'compose', 'down'],
        cwd=str(INSTALL_DIR),
        capture_output=True, text=True, timeout=60
    )
    if result.returncode == 0:
        print('  ✓ Containers stopped')
    else:
        print(f'  ✗ docker compose down failed:\n{result.stderr[-300:]}')


def get_vscode_settings_path():
    """Find the VS Code user settings.json path (cross-platform)."""
    if sys.platform == 'win32':
        base = Path(os.environ.get('APPDATA', ''))
        return base / 'Code' / 'User' / _SETTINGS_FILENAME
    elif sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Code' / 'User' / _SETTINGS_FILENAME
    else:
        return Path.home() / '.config' / 'Code' / 'User' / _SETTINGS_FILENAME


def configure_vscode():
    """Add OTLP settings to VS Code user settings.json."""
    settings_path = get_vscode_settings_path()
    if not settings_path.exists():
        print(f'  ⚠ VS Code settings not found at {settings_path}')
        print('    Add these settings manually:')
        print(json.dumps(VSCODE_OTEL_SETTINGS, indent=2))
        return

    try:
        text = settings_path.read_text(encoding='utf-8')
        # Strip trailing comma issues and comments for basic JSON parse
        settings = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        print(f'  ⚠ Could not parse {settings_path} — add settings manually:')
        print(json.dumps(VSCODE_OTEL_SETTINGS, indent=2))
        return

    changed = False
    for key, value in VSCODE_OTEL_SETTINGS.items():
        if settings.get(key) != value:
            settings[key] = value
            changed = True

    if changed:
        settings_path.write_text(
            json.dumps(settings, indent=2, ensure_ascii=False) + '\n',
            encoding='utf-8'
        )
        print('  ✓ VS Code OTLP settings applied')
    else:
        print('  ✓ VS Code OTLP settings already configured')


def open_dashboard():
    """Open the dashboard HTML in the default browser."""
    dash = INSTALL_DIR / DASHBOARD_FILE
    if dash.exists():
        import webbrowser
        url = dash.as_uri() if hasattr(dash, 'as_uri') else f'file://{dash}'
        webbrowser.open(url)
        print(f'\n  Dashboard opened: {dash}')


def verify_health():
    """Check that all services are responding."""
    import urllib.request
    checks = [
        ('Receiver',  'http://localhost:4318/api/health'),
        ('Updater',   'http://localhost:4319/health'),
        ('Aspire',    'http://localhost:18888'),
    ]
    print('\nHealth checks:')
    for name, url in checks:
        try:
            req = urllib.request.urlopen(url, timeout=5)
            print(f'  ✓ {name} ({url}) — {req.getcode()}')
        except Exception:
            print(f'  ✗ {name} ({url}) — not responding yet (may need a moment)')


def setup(args):
    """Run the full setup."""
    print('='*60)
    print('  ESSENCE Token Dashboard — Setup')
    print('='*60)

    # Pre-flight
    if not check_docker():
        sys.exit(1)

    if not args.no_prompt:
        print('\nThis will:')
        print(f'  1. Copy pipeline files to {INSTALL_DIR}')
        print('  2. Start 4 Docker containers (postgres, receiver, aspire, updater)')
        print('  3. Configure VS Code OTLP settings')
        print('  4. Open the dashboard in your browser')
        resp = input('\nProceed? [Y/n] ').strip().lower()
        if resp and resp != 'y':
            print('Aborted.')
            return

    # Step 1: Copy files
    print(f'\nCopying files to {INSTALL_DIR}...')
    copy_files()
    write_env_file()

    # Step 2: Start containers
    if not start_containers():
        print('\nSetup failed at container startup. Check Docker logs.')
        sys.exit(1)

    # Step 3: VS Code settings
    print('\nConfiguring VS Code...')
    configure_vscode()

    # Step 4: Health check
    verify_health()

    # Step 5: Open dashboard
    open_dashboard()

    print('\n' + '='*60)
    print('  Setup complete!')
    print('='*60)
    print(f'\n  Dashboard:  {INSTALL_DIR / DASHBOARD_FILE}')
    print('  Aspire UI:  http://localhost:18888')
    print('  Receiver:   http://localhost:4318')
    print('  Updater:    http://localhost:4319')
    print('\n  Click "Refresh Data" in the dashboard to update.')
    print('  Telemetry flows automatically from VS Code → receiver → PostgreSQL.')


def uninstall(args):
    """Stop containers and optionally remove files."""
    print('='*60)
    print('  ESSENCE Token Dashboard — Uninstall')
    print('='*60)

    if INSTALL_DIR.exists():
        stop_containers()

        if not args.no_prompt:
            resp = input(f'\nRemove {INSTALL_DIR}? [y/N] ').strip().lower()
            if resp == 'y':
                # Keep the PostgreSQL volume by default
                print('  Note: PostgreSQL data volume (essence-telemetry-pgdata) preserved.')
                print('        Run "docker volume rm essence-telemetry-pgdata" to remove it.')
                shutil.rmtree(INSTALL_DIR)
                print(f'  ✓ Removed {INSTALL_DIR}')
            else:
                print('  Files preserved.')
        else:
            shutil.rmtree(INSTALL_DIR)
            print(f'  ✓ Removed {INSTALL_DIR}')
    else:
        print(f'  Nothing to uninstall — {INSTALL_DIR} does not exist.')


def _file_hash(path):
    """Return SHA-256 hex digest for a file."""
    import hashlib
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _sync_copy_files():
    """Sync individual files from source to install dir. Returns list of changed names."""
    changed = []
    for f in COPY_FILES:
        src = SCRIPT_DIR / f
        dst = INSTALL_DIR / f
        if not src.exists():
            continue
        if not dst.exists() or _file_hash(src) != _file_hash(dst):
            shutil.copy2(src, dst)
            changed.append(f)
            print(f'  ✓ {f} (updated)')
        else:
            print(f'  · {f} (unchanged)')
    return changed


def _sync_copy_dirs():
    """Sync directories from source to install dir. Returns list of changed dir names."""
    changed = []
    for d in COPY_DIRS:
        src = SCRIPT_DIR / d
        dst = INSTALL_DIR / d
        if not src.exists():
            continue
        if _dir_needs_update(src, dst):
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            changed.append(f'{d}/')
            print(f'  ✓ {d}/ (updated)')
        else:
            print(f'  · {d}/ (unchanged)')
    return changed


def _dir_needs_update(src, dst):
    """Check whether a source directory differs from its deployed copy."""
    src_files = sorted(src.rglob('*'))
    dst_files = sorted(dst.rglob('*')) if dst.exists() else []
    if len(src_files) != len(dst_files):
        return True
    for sf in src_files:
        df = dst / sf.relative_to(src)
        if not df.exists() or (sf.is_file() and _file_hash(sf) != _file_hash(df)):
            return True
    return False


def _rebuild_updater_if_needed(changed_files):
    """Recreate the updater container if its source files changed."""
    updater_triggers = {'update-server.py', 'update-dashboard.py', 'pricing.py', 'updater.Dockerfile', 'docker-compose.yml'}
    if not updater_triggers & set(changed_files):
        return
    print('\n  Updater source changed — recreating container...')
    result = subprocess.run(
        ['docker', 'compose', 'up', '-d', '--no-deps', '--build', 'updater'],
        cwd=str(INSTALL_DIR),
        capture_output=True, text=True, timeout=120
    )
    if result.returncode == 0:
        print('  ✓ Updater container recreated')
    else:
        print(f'  ✗ Updater recreate failed:\n{result.stderr[-300:]}')


def sync(_args):
    """Re-copy source files to ~/.essence-telemetry/ and optionally recreate the updater."""
    print('='*60)
    print('  ESSENCE Token Dashboard — Sync')
    print('='*60)

    if not INSTALL_DIR.exists():
        print(f'\n  ✗ {INSTALL_DIR} does not exist. Run setup first.')
        sys.exit(1)

    changed_files = _sync_copy_files() + _sync_copy_dirs()
    _rebuild_updater_if_needed(changed_files)

    if not changed_files:
        print('\n  Everything is up to date.')
    else:
        print(f'\n  Synced {len(changed_files)} file(s). Dashboard is now current.')


def _install_launcher_windows(launcher_src, args):
    """Install the essence-code launcher on Windows and optionally add to PATH."""
    dst_dir = INSTALL_DIR
    dst_dir.mkdir(parents=True, exist_ok=True)
    ps1_dst = dst_dir / 'essence-code.ps1'
    cmd_dst = dst_dir / 'essence-code.cmd'
    shutil.copy2(launcher_src, ps1_dst)
    # Create a .cmd wrapper so it works from cmd.exe and PowerShell without
    # needing to type the .ps1 extension or adjust execution policy
    cmd_dst.write_text(
        '@echo off\r\n'
        f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{ps1_dst}" %*\r\n',
        encoding='utf-8'
    )
    print(f'  ✓ Installed {ps1_dst}')
    print(f'  ✓ Created   {cmd_dst}')

    _ensure_on_path_windows(dst_dir, args)


def _ensure_on_path_windows(dst_dir, args):
    """Check if INSTALL_DIR is on user PATH and add it if not (Windows only)."""
    import winreg
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r'Environment', 0, winreg.KEY_READ)
        user_path, _ = winreg.QueryValueEx(key, 'Path')
        winreg.CloseKey(key)
    except FileNotFoundError:
        user_path = ''

    install_str = str(dst_dir)
    if install_str.lower() in user_path.lower():
        print(f'  ✓ {install_str} is already on PATH')
        return

    if not args.no_prompt:
        resp = input(f'\n  Add {install_str} to your user PATH? [Y/n] ').strip().lower()
        if resp and resp != 'y':
            print(f'\n  Skipped. Add {install_str} to PATH manually, or use the full path.')
            return
    new_path = user_path.rstrip(';') + ';' + install_str if user_path else install_str
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                         r'Environment', 0, winreg.KEY_SET_VALUE)
    winreg.SetValueEx(key, 'Path', 0, winreg.REG_EXPAND_SZ, new_path)
    winreg.CloseKey(key)
    # Notify running processes
    import ctypes
    HWND_BROADCAST = 0xFFFF
    WM_SETTINGCHANGE = 0x001A
    ctypes.windll.user32.SendMessageTimeoutW(
        HWND_BROADCAST, WM_SETTINGCHANGE, 0, 'Environment', 0x0002, 5000, None)
    print(f'  ✓ Added {install_str} to user PATH')
    print('    Open a new terminal for the change to take effect.')


def _install_launcher_unix(_launcher_src):
    """Install the essence-code launcher on Unix via ~/.local/bin."""
    bin_dir = Path.home() / '.local' / 'bin'
    bin_dir.mkdir(parents=True, exist_ok=True)
    link = bin_dir / 'essence-code'
    sh_src = SCRIPT_DIR / 'essence-code.sh'
    if sh_src.exists():
        shutil.copy2(sh_src, link)
        # 0o700: owner rwx only — a personal launcher in ~/.local/bin needs no group/other access
        os.chmod(str(link), 0o700)
        print(f'  ✓ Installed {link}')
    else:
        print('  ✗ essence-code.sh not found.')


def install_launcher(args):
    """Copy essence-code launcher to a directory on PATH for easy workspace tagging."""
    launcher_src = SCRIPT_DIR / 'essence-code.ps1'
    if not launcher_src.exists():
        print(f'  ✗ {launcher_src} not found in skill package.')
        sys.exit(1)

    if sys.platform == 'win32':
        _install_launcher_windows(launcher_src, args)
    else:
        _install_launcher_unix(launcher_src)

    print('\n  Usage: essence-code C:\\path\\to\\project')
    print('  This tags VS Code spans with workspace.name for the Token Dashboard.')


def main():
    parser = argparse.ArgumentParser(description='ESSENCE Token Dashboard Setup')
    parser.add_argument('--uninstall', action='store_true', help='Stop and remove')
    parser.add_argument('--sync', action='store_true', help='Re-copy source files to deployed location (hash-compare, skip unchanged)')
    parser.add_argument('--install-launcher', action='store_true', help='Install essence-code to PATH for workspace tagging')
    parser.add_argument('--no-prompt', action='store_true', help='Non-interactive mode')
    args = parser.parse_args()

    if args.uninstall:
        uninstall(args)
    elif args.sync:
        sync(args)
    elif args.install_launcher:
        install_launcher(args)
    else:
        setup(args)


if __name__ == '__main__':
    main()
