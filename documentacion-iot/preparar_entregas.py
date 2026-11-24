from pathlib import Path
import os, subprocess, importlib.util

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
if os.name == 'nt':
    exe = Path(r'C:\Program Files\Docker\Docker\Docker Desktop.exe')
    if exe.exists():
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        subprocess.Popen([str(exe)], startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print({m: bool(importlib.util.find_spec(m)) for m in ['docx', 'PIL', 'reportlab']})
