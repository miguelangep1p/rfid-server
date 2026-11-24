from pathlib import Path
import hashlib
import json
import zipfile
import pymupdf
from docx import Document

base=Path(__file__).resolve().parent
review=base/'revision-formato'
review.mkdir(exist_ok=True)
for n in [6,7]:
    folder=base/f'laboratorio-{n}'
    pdf=pymupdf.open(folder/f'INFORME_LABORATORIO_{n}.pdf')
    assert len(pdf)>3
    text='\n'.join(p.get_text() for p in pdf)
    assert 'Conclusiones' in text or 'conclusiones' in text
    assert 'por confirmar' in text or 'pendiente' in text
    assert '\ufffd' not in text
    doc=Document(folder/f'INFORME_LABORATORIO_{n}.docx')
    assert len(doc.tables)>=3
    # Render pages for direct visual review, without changing delivered PDFs.
    for page_no in [0, min(3,len(pdf)-1), len(pdf)-1]:
        pdf[page_no].get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(review/f'lab-{n}-pagina-{page_no+1}.png')
    print(f'Laboratorio {n}: PDF {len(pdf)} paginas; DOCX {len(doc.tables)} tablas, {len(doc.inline_shapes)} figuras.')

secret_file=base/'laboratorio-6/.env.local'
secrets=[]
for line in secret_file.read_text(encoding='utf-8').splitlines():
    key,_,value=line.partition('=')
    if any(word in key for word in ['PASSWORD','COOKIE','DATABASE_URL']) and value:secrets.append(value.encode('utf-8'))
with zipfile.ZipFile(base/'ENTREGA_LABORATORIOS_6_7.zip') as archive:
    names=archive.namelist()
    assert not any('/laboratorio-8/' in name for name in names)
    assert not any('.generated.' in name or '/.env' in name or 'node_modules/' in name for name in names)
    for name in names:
        data=archive.read(name)
        for secret in secrets:
            assert secret not in data, f'Secreto detectado en {name}'
    manifest=json.loads(archive.read('documentacion-iot/MANIFIESTO_ENTREGA_6_7.json'))
    for item in manifest['files']:
        assert hashlib.sha256(archive.read(item['path'])).hexdigest()==item['sha256']
    print(f'Paquete: {len(names)} archivos; hashes verificados; no contiene credenciales locales.')
snapshot=json.loads((base/'laboratorio-6/evidencias/lab8-sin-cambios.json').read_text(encoding='utf-8'))
for name,expected in snapshot.items():
    assert hashlib.sha256((base/name).read_bytes()).hexdigest()==expected, f'Cambió un archivo del laboratorio 8: {name}'
assert len(list((base/'laboratorio-8').rglob('*')))>0
assert set(snapshot)=={str(p.relative_to(base)) for p in (base/'laboratorio-8').rglob('*') if p.is_file()}, 'Cambió la lista de archivos del laboratorio 8'
print('Archivos del laboratorio 8: sin modificaciones respecto del inicio de este trabajo.')
