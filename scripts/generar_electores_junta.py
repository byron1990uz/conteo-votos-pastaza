"""Genera sql/06_electores_por_junta.sql con los electores reales de cada junta (padrón CNE 2027).

Cruza el padrón (hoja con Canton, nombreZona, nombreRecinto, junta, sexo, numEleJunta) con el
Distributivo de Recintos (que trae el código de recinto y el rango de juntas F/M) y verifica que
cada recinto sume exactamente sus electores y número de juntas antes de escribir el SQL.

Uso:
    python scripts/generar_electores_junta.py "PADRON Y RECINTOS PASTAZA SECCIONALES 2027.xlsx" \
        "Distributivo de juntas receptoras del voto 2027.xlsx"
"""
import collections
import sys
import unicodedata
from pathlib import Path

import openpyxl


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper()
    return ' '.join(s.replace('"', '').split())


def main(padron_xlsx, distributivo_xlsx):
    padron = [r for r in openpyxl.load_workbook(padron_xlsx, read_only=True, data_only=True)
              .worksheets[0].iter_rows(min_row=2, values_only=True) if r[0] and r[4] is not None]
    dist = [r for r in list(openpyxl.load_workbook(distributivo_xlsx, read_only=True)
                            .worksheets[0].iter_rows(values_only=True))[8:] if r[0] == 16]

    por_nombre = collections.defaultdict(list)
    for r in dist:
        por_nombre[(norm(r[3]), norm(r[9]))].append(r)

    juntas = {}                       # (recinto_id, sexo, numero) -> electores
    por_recinto = collections.defaultdict(list)
    for x in padron:
        cands = por_nombre.get((norm(x[1]), norm(x[3])), [])
        if len(cands) > 1:
            cands = [r for r in cands if norm(r[7] or r[5]) == norm(x[2])]
        if len(cands) != 1:
            sys.exit(f'No se pudo identificar el recinto: {x}')
        r = cands[0]
        numero, sexo = int(x[4]), str(x[5]).strip().upper()
        lo, hi = (r[16], r[17]) if sexo == 'F' else (r[18], r[19])
        if not lo <= numero <= hi:
            sys.exit(f'Junta {numero}{sexo} fuera del rango del recinto {r[8]} ({lo}-{hi})')
        clave = (r[8], sexo, numero)
        if clave in juntas:
            sys.exit(f'Junta repetida: {clave}')
        juntas[clave] = int(x[6])
        por_recinto[r[8]].append(int(x[6]))

    for r in dist:
        tot = por_recinto.get(r[8], [])
        if sum(tot) != r[20] or len(tot) != r[15]:
            sys.exit(f'Recinto {r[8]}: padrón {sum(tot)} electores/{len(tot)} juntas, distributivo {r[20]}/{r[15]}')

    filas = ',\n'.join(f"  ({rid}, '{s}', {n}, {e})" for (rid, s, n), e in sorted(juntas.items()))
    total = sum(juntas.values())
    sql = f"""-- Electores reales por junta — padrón CNE Elecciones Seccionales 2027, Pastaza
-- Generado por scripts/generar_electores_junta.py. {len(juntas)} juntas, {total} electores.
-- Reemplaza los valores referenciales (total del recinto repartido en partes iguales).
-- Se puede volver a ejecutar.

with v(recinto_id, sexo, numero, electores) as (values
{filas}
)
update public.junta j
   set electores = v.electores, electores_referencial = false
  from v
 where j.recinto_id = v.recinto_id and j.sexo = v.sexo and j.numero = v.numero;

-- Verificación: debe dar {len(juntas)} juntas, {total} electores y 0 referenciales
select count(*) as juntas, sum(electores) as electores,
       count(*) filter (where electores_referencial) as referenciales
  from public.junta;
"""
    dest = Path(__file__).resolve().parent.parent / 'sql' / '06_electores_por_junta.sql'
    dest.write_text(sql, encoding='utf-8')
    print(f'{dest}: {len(juntas)} juntas, {total} electores')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
