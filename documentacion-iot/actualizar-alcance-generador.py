from pathlib import Path
p=Path(__file__).with_name('generar_entregas.py')
s=p.read_text(encoding='utf-8')
if "LAB8 = f'''# Laboratorio 8" in s:
    a=s.index("LAB8 = f'''# Laboratorio 8")
    b=s.index('\ndef clean(text):',a)
    s=s[:a]+s[b:]
s=s.replace('for n, content in [(6,LAB6),(7,LAB7),(8,LAB8)]:','for n, content in [(6,LAB6),(7,LAB7)]:')
if "index='''# Entrega de laboratorios 6, 7 y 8" in s:
    a=s.index("index='''# Entrega de laboratorios 6, 7 y 8")
    b=s.index("index='''# Entrega y ejecución de los laboratorios 6 y 7",a)
    s=s[:a]+s[b:]
p.write_text(s,encoding='utf-8')
print('Generador limitado a informes de laboratorios 6 y 7.')
