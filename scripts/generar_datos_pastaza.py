"""
Genera sql/02_datos_pastaza.sql a partir del Distributivo de Recintos del CNE (hoja PASTAZA).

Uso:
    python3 scripts/generar_datos_pastaza.py "Distributivo_Recintos....xlsx" sql/02_datos_pastaza.sql

Requiere: pip install openpyxl
"""
import sys
import openpyxl

# Parroquias urbanas (cabeceras cantonales). Revise y ajuste si su circunscripción es distinta;
# también puede cambiarse luego desde el módulo de Administración > Parroquias.
PARROQUIAS_URBANAS = {5825, 5650, 6395, 6705}  # PUYO, MERA, SANTA CLARA, ARAJUNO

DIGNIDADES = [
    ("PREFECTO", "PREFECTO/A Y VICEPREFECTO/A", "PROVINCIAL", 1),
    ("ALCALDE", "ALCALDE/SA", "CANTONAL", 2),
    ("CONCEJAL_URBANO", "CONCEJALES URBANOS", "CANTONAL_URBANA", 3),
    ("CONCEJAL_RURAL", "CONCEJALES RURALES", "CANTONAL_RURAL", 4),
    ("VOCAL_JPR", "VOCALES JUNTAS PARROQUIALES RURALES", "PARROQUIAL_RURAL", 5),
    ("CPCCS_MUJERES", "CPCCS - MUJERES", "NACIONAL", 6),
    ("CPCCS_HOMBRES", "CPCCS - HOMBRES", "NACIONAL", 7),
    ("CPCCS_PUEBLOS", "CPCCS - PUEBLOS Y NACIONALIDADES / EXTERIOR", "NACIONAL", 8),
]


def q(v):
    """Literal SQL seguro."""
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).strip().replace("'", "''") + "'"


def t(v):
    """Literal de texto (fuerza tipo text aunque el Excel traiga números)."""
    if v is None or str(v).strip() == "":
        return "null::text"
    return q(str(v)) + "::text"


def main(xlsx, salida):
    wb = openpyxl.load_workbook(xlsx, data_only=True, read_only=True)
    ws = wb["PASTAZA"]
    filas = [r for r in ws.iter_rows(min_row=9, values_only=True) if r[0]]

    cantones, parroquias, zonas = {}, {}, {}
    for r in filas:
        cantones[r[2]] = r[3]
        parroquias[r[4]] = (r[2], r[5])
        zonas[(r[4], r[6])] = r[7]

    out = []
    w = out.append
    w("-- Generado automáticamente desde el Distributivo de Recintos Electorales (CNE), hoja PASTAZA")
    w(f"-- Recintos: {len(filas)} | Juntas: {sum(r[15] for r in filas)} | Electores: {sum(r[20] for r in filas)}")
    w("begin;")
    w("insert into public.canton (id, nombre) values")
    w(",\n".join(f"  ({k}, {q(v)})" for k, v in sorted(cantones.items())) + "\non conflict (id) do update set nombre = excluded.nombre;")

    w("insert into public.parroquia (id, canton_id, nombre, tipo) values")
    w(",\n".join(
        f"  ({k}, {c}, {q(n)}, '{'URBANA' if k in PARROQUIAS_URBANAS else 'RURAL'}')"
        for k, (c, n) in sorted(parroquias.items())
    ) + "\non conflict (id) do update set canton_id = excluded.canton_id, nombre = excluded.nombre;")

    w("insert into public.zona (parroquia_id, codigo, nombre) values")
    w(",\n".join(
        f"  ({p}, {z}, {q(n if n else 'SIN ZONA')})" for (p, z), n in sorted(zonas.items())
    ) + "\non conflict (parroquia_id, codigo) do update set nombre = excluded.nombre;")

    w("insert into public.recinto (id, zona_id, nombre, direccion, telefono, cda, electores, num_juntas,")
    w("  latitud, longitud, contingencia_codigo, contingencia_nombre, contingencia_direccion,")
    w("  contingencia_distancia, contingencia_tiempo, contingencia_telefono)")
    w("select v.id, z.id, v.nombre, v.direccion, v.telefono, v.cda, v.electores, v.num_juntas, v.lat, v.lon,")
    w("       v.c_cod, v.c_nom, v.c_dir, v.c_dist, v.c_tiempo, v.c_tel")
    w("from (values")
    vals = []
    for r in filas:
        tel = str(r[12]) if r[12] not in (None, 0) else None
        vals.append(
            f"  ({r[8]}, {r[4]}, {r[6]}, {t(r[9])}, {t(r[11])}, {t(tel)}, {q(r[10] == 'SI')}, {r[20]}, {r[15]}, "
            f"{q(r[24])}::numeric, {q(r[23])}::numeric, {q(r[25])}::integer, {t(r[26])}, {t(r[27])}, "
            f"{t(r[28])}, {t(r[29])}, {t(r[30])})"
        )
    w(",\n".join(vals))
    w(") as v(id, parroquia_id, zona_codigo, nombre, direccion, telefono, cda, electores, num_juntas, lat, lon,")
    w("       c_cod, c_nom, c_dir, c_dist, c_tiempo, c_tel)")
    w("join public.zona z on z.parroquia_id = v.parroquia_id and z.codigo = v.zona_codigo")
    w("on conflict (id) do update set zona_id = excluded.zona_id, nombre = excluded.nombre, direccion = excluded.direccion,")
    w("  telefono = excluded.telefono, cda = excluded.cda, electores = excluded.electores, num_juntas = excluded.num_juntas,")
    w("  latitud = excluded.latitud, longitud = excluded.longitud, contingencia_codigo = excluded.contingencia_codigo,")
    w("  contingencia_nombre = excluded.contingencia_nombre, contingencia_direccion = excluded.contingencia_direccion,")
    w("  contingencia_distancia = excluded.contingencia_distancia, contingencia_tiempo = excluded.contingencia_tiempo,")
    w("  contingencia_telefono = excluded.contingencia_telefono;")

    # Juntas: numeración CNE (JUN INIF..JUN FINF, JUN INIM..JUN FINM). Electores referenciales:
    # el total del recinto repartido en partes iguales (el Excel no trae electores por junta).
    juntas = []
    for r in filas:
        nums = [("F", n) for n in range(r[16], r[17] + 1)] + [("M", n) for n in range(r[18], r[19] + 1)]
        base, resto = divmod(r[20], len(nums))
        for i, (s, n) in enumerate(nums):
            juntas.append(f"  ({r[8]}, {n}, '{s}', {base + (1 if i < resto else 0)})")
    w("insert into public.junta (recinto_id, numero, sexo, electores) values")
    w(",\n".join(juntas) + "\non conflict (recinto_id, sexo, numero) do nothing;")

    w("insert into public.dignidad (codigo, nombre, ambito, orden) values")
    w(",\n".join(f"  ({q(c)}, {q(n)}, {q(a)}, {o})" for c, n, a, o in DIGNIDADES)
      + "\non conflict (codigo) do update set nombre = excluded.nombre, ambito = excluded.ambito, orden = excluded.orden;")
    w("commit;")

    with open(salida, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"OK: {len(cantones)} cantones, {len(parroquias)} parroquias, {len(zonas)} zonas, "
          f"{len(filas)} recintos, {len(juntas)} juntas -> {salida}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
