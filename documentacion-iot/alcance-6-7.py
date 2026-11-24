from pathlib import Path
import hashlib,json,shutil
base=Path(__file__).resolve().parent
snapshot={str(p.relative_to(base)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (base/'laboratorio-8').rglob('*') if p.is_file()}
(base/'laboratorio-6/evidencias/lab8-sin-cambios.json').write_text(json.dumps(snapshot,indent=2)+'\n',encoding='utf-8')
infra=base/'laboratorio-6/infra';infra.mkdir(exist_ok=True)
for name in ['schema.sql','bootstrap.generated.sql']:
 target=infra/name
 if not target.exists():shutil.copy2(base/'laboratorio-8'/name,target)
source=(base/'laboratorio-8/create-card.cjs').read_text(encoding='utf-8').replace("require('../laboratorio-7/src/protocol.cjs')","require('./protocol.cjs')")
(base/'laboratorio-7/src/create-card.cjs').write_text(source,encoding='utf-8')
print('Contrato existente copiado como prerrequisito de infraestructura. Laboratorio 8 sin cambios.')
