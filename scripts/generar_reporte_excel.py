"""Genera reportes/Revision_Organizaciones_Candidaturas_2027.xlsx para revisar contra las papeletas.

Usa los mismos datos que scripts/generar_candidaturas.py (lo que se carga en Supabase).
Uso:  python scripts/generar_reporte_excel.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from generar_candidaturas import AMBITO_CANTONAL, CANTON, ORGS, PAPELETAS, PARROQUIA, PARROQUIA_CANTON

DIGNIDAD_TXT = {
    'PREFECTO': 'Prefecto/a y Viceprefecto/a',
    'ALCALDE': 'Alcalde/sa',
    'CONCEJAL_URBANO': 'Concejales urbanos',
    'CONCEJAL_RURAL': 'Concejales rurales',
    'VOCAL_JPR': 'Vocales juntas parroquiales rurales',
}
# Página del PDF de cada papeleta, en el mismo orden que PAPELETAS (None = dato del usuario)
PAGINAS = [13, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] + list(range(14, 30)) + [None, None]
assert len(PAGINAS) == len(PAPELETAS)

CANTON_NOM = {v: k for k, v in CANTON.items()}
PARROQUIA_NOM = {v: k for k, v in PARROQUIA.items()}

F = 'Arial'
TITULO = Font(name=F, size=14, bold=True, color='1E3A8A')
NOTA = Font(name=F, size=9, italic=True, color='555555')
CAB = Font(name=F, size=10, bold=True, color='FFFFFF')
CAB_FILL = PatternFill('solid', start_color='1E3A8A')
NORMAL = Font(name=F, size=10)
NEGRITA = Font(name=F, size=10, bold=True)
EDITAR = PatternFill('solid', start_color='FFF9C4')   # columnas para que el revisor llene
BORDE = Border(*(Side(style='thin', color='CCCCCC'),) * 4)
ENVOLVER = Alignment(wrap_text=True, vertical='top')


def tabla(ws, fila_cab, cabeceras, filas, anchos, editables=()):
    for c, (h, w) in enumerate(zip(cabeceras, anchos), 1):
        cel = ws.cell(fila_cab, c, h)
        cel.font, cel.fill, cel.alignment, cel.border = CAB, CAB_FILL, Alignment(wrap_text=True, vertical='center'), BORDE
        ws.column_dimensions[get_column_letter(c)].width = w
    for r, fila in enumerate(filas, fila_cab + 1):
        for c, v in enumerate(fila, 1):
            cel = ws.cell(r, c, v)
            cel.font, cel.border, cel.alignment = NORMAL, BORDE, ENVOLVER
            if cabeceras[c - 1] in editables:
                cel.fill = EDITAR
    ultima = fila_cab + len(filas)
    ws.freeze_panes = ws.cell(fila_cab + 1, 1)
    ws.auto_filter.ref = f'A{fila_cab}:{get_column_letter(len(cabeceras))}{ultima}'
    return ultima


def revisado(ws, col, desde, hasta):
    dv = DataValidation(type='list', formula1='"OK,CORREGIR"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f'{col}{desde}:{col}{hasta}')
    rango = f'A{desde}:{get_column_letter(ws.max_column)}{hasta}'
    ws.conditional_formatting.add(rango, FormulaRule(formula=[f'${col}{desde}="CORREGIR"'], fill=PatternFill('solid', start_color='FDE2E2')))
    ws.conditional_formatting.add(rango, FormulaRule(formula=[f'${col}{desde}="OK"'], fill=PatternFill('solid', start_color='E3F4E1')))


def main():
    cands, personas = [], []
    for (dign, circ, items), pag in zip(PAPELETAS, PAGINAS):
        if dign in AMBITO_CANTONAL:
            canton, parroquia = circ, ''
        elif dign == 'VOCAL_JPR':
            parroquia, canton = circ, CANTON_NOM[PARROQUIA_CANTON[PARROQUIA[circ]]]
        else:
            canton, parroquia = 'PROVINCIA', ''
        fuente = f'PDF pág. {pag}' if pag else 'Indicado por el usuario (sin papeleta)'
        for orden, (lista, nombre) in enumerate(items, 1):
            sigla, org, _ = ORGS[lista]
            if nombre is None:
                gente = []
            elif dign == 'PREFECTO':
                gente = [('Prefecto/a', n.strip()) for n in nombre.split('/')[:1]] + [('Viceprefecto/a', nombre.split('/')[1].strip())]
            elif dign == 'ALCALDE':
                gente = [('Candidato/a', nombre)]
            else:
                gente = [(f'Puesto {i}', n.strip()) for i, n in enumerate(nombre.split(','), 1)]
            cands.append([DIGNIDAD_TXT[dign], canton, parroquia, orden, lista, sigla, org,
                          nombre or '(sin nombres de candidatos)', len(gente), fuente, None, None])
            for pos, persona in gente:
                personas.append([DIGNIDAD_TXT[dign], canton, parroquia, lista, sigla, pos, persona, fuente, None, None])

    wb = Workbook()

    # ---------- Resumen ----------
    ws = wb.active
    ws.title = 'Resumen'
    ws['A1'], ws['A1'].font = 'Revisión de organizaciones y candidaturas — Pastaza 2027', TITULO
    ws['A2'] = ('Fuente: Papeletas_Pastaza_2027_A4_29_hojas.pdf (CNE). Veracruz y Río Tigre: listas indicadas por el usuario, '
                'sin papeleta. No incluye CPCCS. Mismos datos que sql/03_candidaturas_2027.sql.')
    ws['A3'] = 'Cómo revisar: en cada hoja, marque la columna "Revisado" (OK / CORREGIR) y anote la corrección en "Observación" (celdas amarillas).'
    for c in ('A2', 'A3'):
        ws[c].font = NOTA
    n_c, n_p, n_o = len(cands) + 1, len(personas) + 1, len(ORGS) + 1
    filas = []
    for d in DIGNIDAD_TXT.values():
        filas.append([d,
                      f"=COUNTIF(Candidaturas!$A$2:$A${n_c},A{6 + len(filas)})",
                      f"=SUMIF(Candidaturas!$A$2:$A${n_c},A{6 + len(filas)},Candidaturas!$I$2:$I${n_c})",
                      f"=COUNTIFS(Candidaturas!$A$2:$A${n_c},A{6 + len(filas)},Candidaturas!$K$2:$K${n_c},\"OK\")",
                      f"=COUNTIFS(Candidaturas!$A$2:$A${n_c},A{6 + len(filas)},Candidaturas!$K$2:$K${n_c},\"CORREGIR\")"])
    ult = tabla(ws, 5, ['Dignidad', 'Candidaturas', 'Candidatos', 'Revisadas OK', 'A corregir'], filas, [40, 14, 14, 14, 14])
    t = ult + 1
    ws.cell(t, 1, 'TOTAL').font = NEGRITA
    for c in range(2, 6):
        col = get_column_letter(c)
        cel = ws.cell(t, c, f'=SUM({col}6:{col}{ult})')
        cel.font, cel.border = NEGRITA, BORDE
    ws.cell(t + 2, 1, 'Organizaciones (listas)').font = NEGRITA
    ws.cell(t + 2, 2, f'=COUNTA(Organizaciones!$A$2:$A${n_o})').font = NEGRITA
    ws.cell(t + 3, 1, 'Organizaciones sin candidaturas').font = NORMAL
    ws.cell(t + 3, 2, f'=COUNTIF(Organizaciones!$E$2:$E${n_o},0)').font = NORMAL
    ws.freeze_panes = None
    ws.auto_filter.ref = None

    # ---------- Organizaciones ----------
    ws = wb.create_sheet('Organizaciones')
    filas = []
    for i, (lista, (sigla, nombre, color)) in enumerate(ORGS.items(), 2):
        tipo = 'Alianza' if '-' in lista else 'Partido / movimiento'
        filas.append([lista, sigla, nombre, tipo, f'=SUMPRODUCT(--(Candidaturas!$E$2:$E${n_c}=A{i}))', color, None, None])
    ult = tabla(ws, 1, ['Lista', 'Sigla', 'Nombre', 'Tipo', 'Nº candidaturas', 'Color en el sistema', 'Revisado', 'Observación'],
                filas, [10, 22, 58, 20, 14, 16, 12, 40], editables=('Revisado', 'Observación'))
    for r in range(2, ult + 1):
        color = ws.cell(r, 6).value.lstrip('#')
        ws.cell(r, 6).fill = PatternFill('solid', start_color=color)
        ws.cell(r, 6).font = Font(name=F, size=10, color='FFFFFF', bold=True)
        ws.cell(r, 1).font = NEGRITA
    revisado(ws, 'G', 2, ult)

    # ---------- Candidaturas ----------
    ws = wb.create_sheet('Candidaturas')
    ult = tabla(ws, 1, ['Dignidad', 'Cantón', 'Parroquia', 'Orden papeleta', 'Lista', 'Sigla', 'Organización',
                        'Candidatura (como aparece en el sistema)', 'Nº candidatos', 'Fuente', 'Revisado', 'Observación'],
                cands, [30, 13, 18, 9, 9, 18, 40, 60, 10, 18, 12, 36], editables=('Revisado', 'Observación'))
    revisado(ws, 'K', 2, ult)

    # ---------- Candidatos (una fila por persona) ----------
    ws = wb.create_sheet('Candidatos')
    ult = tabla(ws, 1, ['Dignidad', 'Cantón', 'Parroquia', 'Lista', 'Sigla', 'Posición', 'Nombre', 'Fuente', 'Revisado', 'Observación'],
                personas, [30, 13, 18, 9, 18, 15, 38, 18, 12, 36], editables=('Revisado', 'Observación'))
    revisado(ws, 'I', 2, ult)

    for hoja in wb.worksheets:
        hoja.page_setup.orientation = 'landscape'
        hoja.page_setup.fitToWidth, hoja.page_setup.fitToHeight = 1, 0
        hoja.sheet_properties.pageSetUpPr.fitToPage = True

    wb.calculation.fullCalcOnLoad = True  # Excel calcula las fórmulas al abrir
    dest = Path(__file__).resolve().parent.parent / 'reportes' / 'Revision_Organizaciones_Candidaturas_2027.xlsx'
    dest.parent.mkdir(exist_ok=True)
    wb.save(dest)
    print(f'{dest}: {len(ORGS)} organizaciones, {len(cands)} candidaturas, {len(personas)} candidatos')


if __name__ == '__main__':
    main()
