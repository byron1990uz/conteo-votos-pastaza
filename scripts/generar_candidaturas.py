"""Genera sql/03_candidaturas_2027.sql con organizaciones y candidaturas de Pastaza 2027.

Fuente: Papeletas_Pastaza_2027_A4_29_hojas.pdf (CNE), transcritas a mano porque el PDF es escaneado.
Veracruz y Río Tigre (vocales) no están en el PDF: se cargan solo las listas, sin nombres de candidatos.

Uso:  python scripts/generar_candidaturas.py
"""
from pathlib import Path

# lista -> (sigla, nombre, color)
ORGS = {
    '1':       ('CD',     'MOVIMIENTO CENTRO DEMOCRÁTICO', '#1e3a8a'),
    '2':       ('UP',     'PARTIDO UNIDAD POPULAR', '#dc2626'),
    '3':       ('PSP',    'PARTIDO SOCIEDAD PATRIÓTICA 21 DE ENERO', '#b91c1c'),
    '7':       ('ADN',    'MOVIMIENTO ACCIÓN DEMOCRÁTICA NACIONAL, ADN', '#7e22ce'),
    '18':      ('MUPP',   'MOVIMIENTO DE UNIDAD PLURINACIONAL PACHAKUTIK', '#ea580c'),
    '61':      ('UPP',    'MOVIMIENTO POLÍTICO UNIDOS POR PASTAZA', '#ca8a04'),
    '62':      ('MIPC',   'MOVIMIENTO POLÍTICO INTEGRACIÓN, PROGRESO Y CAMBIO "MIPC"', '#4d7c0f'),
    '101':     ('MCP',    'MOVIMIENTO CANTONAL DEL PUEBLO', '#166534'),
    '63-20':   ('SEMILLA', 'ALIANZA SOMOS SEMILLA, SEREMOS BOSQUE', '#0d9488'),
    '18-17':   ('PROGRESO MI PUEBLO', 'ALIANZA POR EL PROGRESO DE MI PUEBLO', '#c2410c'),
    '18-17-2': ('UNIDAD PLURINACIONAL', 'ALIANZA UNIDAD PLURINACIONAL', '#f97316'),
    '18-2-8':  ('TUKULLA', 'ALIANZA ¡TUKULLA HATARISHUNCHIK! ¡LEVANTEMOS TODOS!', '#9a3412'),
    '18-62':   ('UNIDAD COMUNITARIA', 'ALIANZA UNIDAD COMUNITARIA', '#a16207'),
    '18-2-62': ('VALORES', 'ALIANZA POR UNA SOCIEDAD CON VALORES Y PRINCIPIOS ORGANIZATIVOS', '#b45309'),
    '2-18':    ('UNIDAD Y PROGRESO', 'ALIANZA UNIDAD Y PROGRESO', '#e11d48'),
    '17-61':   ('UNIDOS', 'ALIANZA UNIDOS', '#be123c'),
    '61-4':    ('PROGRESO PARA TODOS', 'ALIANZA PROGRESO PARA TODOS', '#eab308'),
    '61-6':    ('UNIDOS DESARROLLO', 'ALIANZA UNIDOS POR EL DESARROLLO', '#d97706'),
    '61-8':    ('UNIDOS PROGRESO', 'ALIANZA UNIDOS POR EL PROGRESO', '#2563eb'),
    '61-8-6':  ('UNIDOS FUTURO', 'ALIANZA UNIDOS POR EL FUTURO', '#0284c7'),
    '62-1':    ('SOMOS PROGRESO', 'ALIANZA SOMOS PROGRESO', '#15803d'),
}

CANTON = {'PASTAZA': 680, 'MERA': 685, 'SANTA CLARA': 880, 'ARAJUNO': 881}
PARROQUIA = {
    'CANELOS': 475, 'CURARAY': 735, '10 DE AGOSTO': 1025, 'FATIMA': 1260, 'EL TRIUNFO': 1275,
    'SAN JOSE': 2100, 'MADRE TIERRA': 2310, 'MONTALVO/ANDOAS': 2450, 'POMONA': 3055,
    'RIO CORRIENTES': 3180, 'RIO TIGRE': 3195, 'ZARAYACU': 3785, 'SHELL': 3840, 'TARQUI': 3985,
    'TNTE. HUGO ORTIZ': 4005, 'VERACRUZ': 4205, 'SIMON BOLIVAR': 4510, 'SHUAR PASTAZA': 4766,
}

# (dignidad, circunscripción, [(lista, nombre_candidatura), ...]) en el orden de la papeleta
PAPELETAS = [
    ('PREFECTO', None, [
        ('1', 'SILVIA SANTI TOSCANO / DANNY GUERRERO'),
        ('3', 'ANTONIO KUBES / CAMILA QUISIRUMBAY'),
        ('7', 'KAROL BARONA / TUPAK CHIMBO'),
        ('18', 'WILFRIDO ARAGON / DANYA JACOME'),
        ('61-4', 'DERLIS TOMAS SILVA LUZURIAGA / KARLA BATALLAS BALLESTEROS'),
        ('63-20', 'ANDRE GRANDA / GLADYS ALVARADO NENQUIMO'),
    ]),
    # ---------------- ALCALDES ----------------
    ('ALCALDE', 'ARAJUNO', [
        ('3', 'HECTOR LLERENA'), ('7', 'JASSON AVILEZ'), ('18-17', 'IVAN MOLINA'),
        ('61-6', 'MARIO LOPEZ'), ('62', 'MARIA ZOILA HUATATOCA GREFA'), ('63-20', 'LINETH CALAPUCHA'),
    ]),
    ('ALCALDE', 'MERA', [
        ('1', 'GALO CABEZAS TOSCANO'), ('7', 'SHIRLEY AGUIRRE'), ('18', 'ROLANDO MORALES'),
        ('61-8', 'CRISTIAN CHIMBORAZO'), ('63-20', 'MILENA CAMPAÑA'),
    ]),
    ('ALCALDE', 'PASTAZA', [
        ('7', 'JIMMY GARCES'), ('18-17-2', 'MARCO ANDINO'), ('61', 'JAIME GUEVARA'), ('63-20', 'MIJAIL ALVAREZ'),
    ]),
    ('ALCALDE', 'SANTA CLARA', [
        ('7', 'JOJANA BORJA'), ('18-2-8', 'CARLOS RODRIGUEZ'), ('61-4', 'JERVIS ARBOLEDA SANABRIA'),
        ('62-1', 'MESIAS VILLACRES'), ('63-20', 'CRISTIAN YANEZ'),
    ]),
    # ---------------- CONCEJALES RURALES ----------------
    ('CONCEJAL_RURAL', 'ARAJUNO', [
        ('7', 'MATILDE ORQUERA, FAUSTO IMA'),
        ('18', 'FERNANDO NIHUA, KARINA CANELOS'),
        ('61-6', 'JENIFFER AGUINDA, SUYU CHIMBO'),
        ('62', 'PORFIRIO ARCENIO ANDI MAYANCHA, SARA NAMEE ENQUERI OMENE'),
        ('63-20', 'JANET INMUNDA, CAMILO HUAMOÑI'),
    ]),
    ('CONCEJAL_RURAL', 'MERA', [
        ('7', 'YESICA BALCAZAR, LUIS JURADO, DAYANARA POZO, VICTOR VALLE'),
        ('18', 'PAOLA CISNEROS, MAURO CALAPUCHA, SONIA AKINTIUA, ADAN SUAREZ'),
        ('61-8', 'PATRICIO FLORES, LADY QUIROZ, HERNAN MARCATOMA, LITZY MAYANCHA'),
        ('63-20', 'MIRTA BUENAÑO, FARID CUEVA, JOHANNA CONZA, RENE SALAZAR'),
        ('101', 'LUIS SILVA ARIAS, AIDE VARGAS, JUAN CARLOS SINGO ESTACIO, YAMILEX SANTI'),
    ]),
    ('CONCEJAL_RURAL', 'PASTAZA', [
        ('3', 'JANETH CHANGO, CARLOS SHIKI, KATHERINE TOAQUIZA, ALEX SANTI'),
        ('7', 'WILVERT CARVAJAL, INES CHUINT YAKUM, MARCELO LEDESMA, ERIKA PAREDES'),
        ('18', 'MARIO VARGAS, ELSA GUALINGA, LUIS KAJEKAI, MISHELL LICUY'),
        ('61', 'MARINA POZO, CESAR DAGUA, YANUA POZO, MARCO PAZ'),
        ('62-1', 'FREDDY ZABALA, MIRIAM AVILA, MARIO YANGUAMI, DANIELA MARMOLEJO'),
        ('63-20', 'ANDRES FIALLOS, ESTEFANIA CHAMORRO, MARCO ANDINO, GISELA ALBAN'),
    ]),
    ('CONCEJAL_RURAL', 'SANTA CLARA', [
        ('7', 'LUIS FERNANDO CHALAN ORDOÑEZ'), ('18', 'MARIA BIRACUCHA'),
        ('61-4', 'LINDA VILLACRES ARREAGA'), ('62', 'JONATHAN ERAZO CHIMBO'), ('63-20', 'MESIAS TAPUY'),
    ]),
    # ---------------- CONCEJALES URBANOS ----------------
    ('CONCEJAL_URBANO', 'ARAJUNO', [
        ('7', 'CESAR GREFA, PAULINA SHIGUANGO, FABIAN ASTUDILLO'),
        ('18', 'DIANA TANGUILA, FREDDY ESPINOSA, MISHELL PEREZ'),
        ('61-6', 'ELISEO VARGAS, ARACELY CHILIQUINGA, FAUSTO ALVARADO'),
        ('62', 'MIRIAN ROSA CALAPUCHA ANDY, JOSE JORGE ANDY AGUINDA, MELISSA EDITH CERDA GREFA'),
        ('63-20', 'JOSE ANDY, MARIA AGUINDA, JUAN SHIGUANGO'),
    ]),
    ('CONCEJAL_URBANO', 'MERA', [
        ('7', 'OLGA MALUCIN'), ('17-61', 'MAURICIO REYES'), ('18', 'JOSE GUEVARA'),
        ('62', 'SAMIA ANAHI LOPEZ'), ('63-20', 'MERY CAMINO'), ('101', 'NATALIA NAYELI VARGAS'),
    ]),
    ('CONCEJAL_URBANO', 'PASTAZA', [
        ('3', 'PACO MEZA, AIDA LANDAZURI, LUIS PEREZ'),
        ('7', 'CRISTHIAN CAJAS, ANAHIS LUZURIAGA, DARIO BARRIONUEVO'),
        ('18-17-2', 'FERNANDO GUEVARA, MARITZA TOSCANO, ZAFIRO LANDAZURY'),
        ('61', 'MARCELO CORTEZ, MARIA BELEN JARAMILLO, VINICIO COX'),
        ('62', 'BYRON DAVID VILLACIS, DAYANA LIZBETH INTE YANEZ, ALEX DANIEL NARANJO ILLANES'),
        ('63-20', 'IVAN ORTEGA, MARIA AUGUSTA CAJAS, JORGE QUIÑONEZ'),
    ]),
    ('CONCEJAL_URBANO', 'SANTA CLARA', [
        ('7', 'ROSA COYAGO, PABLO LICUY, KAREN CARRASCO, RONALDO LICUY'),
        ('18', 'ELENA VARGAS, JESUS TAPUY, KARINA ALVARADO, ISRAEL SHIGUANGO'),
        ('61-4', 'JORGE VINICIO AJILA GIA, VERONICA VARGAS TAPUY, DARWIN OMAR GREFA TAPUY, EDELINA GUATATUCA SANTI'),
        ('62', 'RITA ESLENDY YUMBO VARGAS, MIGUEL GABRIEL AGUINDA GREFA, DAMARIS PILAR GONZALEZ TAPIA, WILLIAM VARGAS ALVARADO'),
        ('63-20', 'TERESA JACOME, MARLON LICUY, MISHELL JARAMILLO, ALEX HUATATOCA'),
    ]),
    # ---------------- VOCALES JUNTAS PARROQUIALES RURALES ----------------
    ('VOCAL_JPR', '10 DE AGOSTO', [
        ('7', 'SOFIA POZO, ALEX ORELLANA, SAMANTHA VILLENA, WILLIAN SANCHEZ, DANIELA YASACA'),
        ('18', 'JULISSA SANTI, MARCELO TARCO, LUZ BERMEO, HERNAN AKINTIUA, RITA GREFA'),
        ('61-8-6', 'DANIEL CARDENAS HERMOZA, JENNIFER NANCY VARGAS USHIGUA, ANGEL FLORESMILO FREIRE, SOLANGE STEFANIA QUINTEROS, JEFFERSON CLAUDIO ASHANGA'),
        ('63-20', 'WILLIAM LOPEZ, NORMA HIDALGO, RAMON MACHOA, MONICA SALAZAR, DARWIN AGUIRRE'),
    ]),
    ('VOCAL_JPR', 'CANELOS', [
        ('7', 'CARLOS ILLANES, NANDA DAGUA, WILLAM ILLANES, JOSELYNE GUALLO, CHARLES CANELOS'),
        ('18', 'KAREN VARGAS, LUIS PULLOPAXI, XIMENA VARGAS, JOSE SANTI, SANDRA MOYA'),
        ('61', 'LUIS ILLANES, JUANA CANELOS, JOHN GARCES, LINDA SANTI, HUGO SANTI'),
        ('63-20', 'LILIANA VARELA, BLADIMIR SANTI, RITA VARGAS, ROBERT ZURITA, KASSANDRA RAMIREZ'),
    ]),
    ('VOCAL_JPR', 'EL TRIUNFO', [
        ('7', 'HUGO VACACELA, CARMEN QUINTEROS, CRISTOBAL FLORES, IRENE CHICAYZA, JOAQUIN QUEVEDO'),
        ('61', 'OSWALDO DIAZ, PAOLA LOZADA, NOE PINEDA, GLADYS ALBAN, CARLOS VARGAS'),
        ('63-20', 'FANNY JERES, CARLOS VALENTE, ANGIE PEREZ, WILMER MARTINEZ, MARCIA YANCHALIQUIN'),
    ]),
    ('VOCAL_JPR', 'FATIMA', [
        ('7', 'DARWIN PEREZ, MAGALI OCAMPO, JASSON ENRIQUEZ, VANESSA MARTINEZ, PEDRO SHIGUANGO'),
        ('61', 'LUIS CALLES, DIANA ENRIQUEZ, JORGE AGUINDA, CHEYENE ROBALINO, GERMAN CALAPUCHA'),
        ('63-20', 'DANIELA ESCOBAR, JUAN CARRASCO, KATTERIN CALI, MICHAEL RUIZ, DORIS SARABIA'),
    ]),
    ('VOCAL_JPR', 'MONTALVO/ANDOAS', [
        ('2', 'MOISES SAANT, TANIA MUCUSHIGUA, LENIN WISHU, ROMELIA CALLERA, MARCELINO KUJA'),
        ('3', 'JULISSA MANYA, JUAN RUIZ, ESTEFANIA VARGAS, BOLIVAR SANTI, NAYELY ILBAY'),
        ('7', 'DELFA MALAVER, LUIS GUALINGA, PACCHA SANTI, HIPOLITO LOJA, JULIANA GUALINGA'),
        ('18-62', 'EDISON GUALINGA, RAQUEL VARGAS, AGUSTIN CUJI, FERNANDA SANTI, MARCELO VARGAS'),
        ('61', 'LUIS MAYANCHA, SHAYRA CANELOS, MAURICIO SANTAMARIA, LESVIA WISHU, KLEVER PINIANTSA'),
        ('63-20', 'CRISTIAN DAGUA, ANGELY SANTI, EDUARDO SANTI, LORGIA TUTI, RUBEN SANTI'),
    ]),
    ('VOCAL_JPR', 'CURARAY', [
        ('18', 'LENIN GUALINGA, ELSA DAHUA, WILLIAM VARGAS, SONIA AKACHU, JAVIER MANYA'),
        ('61-6', 'JOSE NANGO, NEMONTE NENQUIHUI, HENRY GUALINGA, ANA HUANI, OLMEDO SHIGUANGO'),
        ('62', 'TOMAS QUIPA NIHUA YETI, LUZMILA GUALINGA MALAVER, RAMON QUIMONCA HUANI IRUMENGA, ANAHI STEPHANIE GREFA IMA, RUBEN BOYOTAI ENOMENGA'),
        ('63-20', 'HIPOLITO VARGAS, ERMINIA MAYANCHI, TIMOTEO MAMALLACTA, BETTY SEVILLA, ALBERTO BOYOTAI'),
    ]),
    ('VOCAL_JPR', 'MADRE TIERRA', [
        ('2', 'CRISTOBAL SANTI VARGAS, NAYELI ILIANES VARGAS, VINICIO GREFA, NATALY PAUCHI, JUAN VARGAS'),
        ('3', 'GALO HIDALGO, ANGELICA CASHINDO, BRUNO GUALINGA, VALERIA HIDALGO, LENIN VARGAS'),
        ('7', 'EFRAIN ZABALA, CECILIA PILLA, LEONARDO MERINO, JENNY ANDI, ALEJANDRO DAGUA'),
        ('18', 'HENRY LEON, FLOR GUALINGA, EDWIN VILLAMIL, NATIVIDAD VARGAS, HOLGER ARANDA'),
        ('61-8', 'ALEX TUQUERES, SHIRLEY DAGUA, ADAN SANTI, LADY PAPA, MANUEL NACHIMBA'),
        ('62', 'NALDO ANDERSON URQUIZO ROJAS, YESSENIA ELIZABETH DAHUA ANDI, SIXTO VICENTE FLORES GREFA, ELISA ELENA VARGAS TAPUY, OSCAR TITO VARGAS BARGAS'),
        ('63-20', 'VICTOR ULCUANGO, JANETH VARGAS, JONATHAN JUWA, CHIJAYA PIRUCHA, GABRIEL RIVERA'),
        ('101', 'RUTH MONTAGUANO, FRANCO AGUINDA, LISBETH DAHUA, JOAQUIN SALAZAR, ADELAIDA DAGUA TOQUETON'),
    ]),
    ('VOCAL_JPR', 'SHELL', [
        ('2-18', 'JHONY HARO, CARMEN MOPOSITA, RICHARD ANDINO, ODALYS TANGUILA, GEOVANNY SANTI'),
        ('7', 'SANDRA CHIRIBOGA, LUIS ANDRADE, YAJAIRA VARGAS, FREDY HIDALGO, DOUGLISMAR BOADA'),
        ('61-8', 'MARIA ALEXANDRA VILLARREAL, ALBERTO HOYOZ, KAREN JARRIN, SEBASTIAN ESPIN, DOLORES DEL ROCIO LOJA'),
        ('62', 'GISELA ALEXANDRA CANDO LOPEZ, DERLYS JOEL VARGAS MAYANCHA, MADELYNE BARRERA WASHICTA, FRANKLIN GUSTAVO INMUNDA TAPUY, KATHERINE ANDREA CARRILLO'),
        ('63-20', 'ANA BELEN ALVAREZ, CARLOS VILLACRES LLERENA, CECIBEL REINO, JESUS VILLARREAL, ELSA MARIÑO'),
        ('101', 'LUIS EDUARDO TAMAYO, LIZBETH TIXE, WILLIAM ALMEIDA, JACQUELINE ALTAMIRANO, CHRISTIAN VILLARROEL'),
    ]),
    ('VOCAL_JPR', 'RIO CORRIENTES', [
        ('7', 'IPIAK SHARUP, MAYAI TENTETS, SANDRA TENTETS, TANCHIM TENTETS, SONIA ICHINKI'),
        ('62', 'YUMINUA MARIBEL TSEREMP MARIAN, WAMPUCH HERNAN TSEREMP UWIJINT, YOHANA INCHIS SHAKAI ANKUAS, TSENTSAK BOSCO ICHINKI TENTETS, CHICHA SOFIA ICHINKI SEKUNT'),
        ('63-20', 'UYUNKAR TSAKIMP, PIRIPRI TENTETS, JINTIA SHAKAI, URUSI UTITIA, MASHIANT ICHINKI'),
    ]),
    ('VOCAL_JPR', 'SAN JOSE', [
        ('7', 'MAYRA TAPUY, JASSON GUATATUCA, IRMA GUAMBUGUETE, WILFRIDO DAHUA, MARIA QUIROZ'),
        ('18', 'MARIA PIZANGO, PATRICIO TAPUY, ELOISA PIZANGO, LUIS SHIGUANGO, SIZA CERDA'),
        ('61-4', 'FRANCISCO AGUINDA GREFA, DAYSI YEPEZ CUJI, JULIO ASHQUI ASHQUI, VICTORIA LLAMOCA PAREDES, RICHARD MAURICIO CUVI CUBE'),
        ('62', 'THALYA JOSEBETH FLORES RIERA, VICTOR ENRIQUE GREFA TAPUY, ALICIA MAGALY PULIG OCHOG, ABRAHAN FERNANDO CUVI CUBE, NOEMI ZENEIDA GREFA DAHUA'),
        ('63-20', 'PATRICIA GREFA, RONALD LOPEZ, KARINA VILLACRES, LUIS RAMIREZ, CANDY TAPUY'),
    ]),
    ('VOCAL_JPR', 'SHUAR PASTAZA', [
        ('7', 'CLAUDIO JIMPIKIT, CARLA USHAP, TITO CHIRIAP, SHIRAM TANGAMASHI, WACHAPA CHUMPI'),
        ('18', 'ESAT CUJI, REINA NURINKIAS, FIDEL AJUNANCH, CAMILA SHACAY, ENRIQUE AYUI'),
        ('61', 'GRACIELA MUKUCHAM, TIRZO NACAIMBI, ROSA KAJEKAI, CRISTIAN CHUMBIA, THALIA TZENGUSHA'),
        ('63-20', 'MAGALI CHAMICO, GILDO SHAKAI, NATALY NAWECH, SHATIK KAJEKAI, JENNYFER VARGAS'),
    ]),
    ('VOCAL_JPR', 'SIMON BOLIVAR', [
        ('7', 'CAMILO MONCAYO, ERICA VARGAS, OSCAR CAMACHO, LIVIA HERAS, CHARIP TSEREMP'),
        ('18', 'JAIME MONCAYO, LESLIE GARCIA, NANTU KAYAP, NUNKUI YANKUAM, DANIEL VILLALTA'),
        ('61', 'ROCIO AEREOCURI, VICENTE TACURI, CARMEN SANTI, DANIEL GARCIA, GEOCONDA CHUMAPI'),
        ('62', 'ALEX RICARDO GONZALEZ LINARES, ESPERANZA YANGUAMI PUENCHER, JUAN CARLOS ASITIMBAY GUARANGO, TERESA LETICIA CHACON RIERA, HEYNER BLADIMIR CHIGUANGO'),
        ('63-20', 'TANIA TAPIA, EDGAR VALLEJO, AMADA INMUNDA, ARIEL SILVA, ESTHELA YANGUAMI'),
    ]),
    ('VOCAL_JPR', 'TARQUI', [
        ('3', 'LUIS CHAVEZ, JESSICA ZAMBRANO, MARCO HERNANDEZ, GABRIELA CHAVEZ, LUIS CAICEDO'),
        ('7', 'JUAN CARLOS MONTESDEOCA, LESLIE SANAITAN, CARLOS PALMA, JOSELYN VELOZ, BRYAN ANDRADE'),
        ('18', 'KIRINA TOSCANO, BENITO TANCHIM, LUISA SANTI, XAVIER VARGAS, EDELINA SANTI'),
        ('61', 'KEVIN GOMEZ, FANNY GREFA, CARLOS CUVI, LESLIE HARO, JUAN VARGAS'),
        ('63-20', 'JESSICA BARROSO, CESAR ANDY, ELVIA SANTI, FRANKLIN SANTI, FELICIA CASTELO'),
    ]),
    ('VOCAL_JPR', 'TNTE. HUGO ORTIZ', [
        ('18-2-62', 'THONY HUERA, YADIRA MONTAHUANO, EDWIN CHIGUANGO, JAMILEX AMAGUAY, DAVID GREFA'),
        ('61', 'ALICIA LARA, FRED OCAMPO, SUSANA AGUINDA, SEGUNDO LARA, GABRIELA LARA'),
        ('63-20', 'HENRY GREFA, ERIKA GUZÑAY, JAIME LICUY, ANGELICA AGUINDA, SEGUNDO CAIZA'),
    ]),
    ('VOCAL_JPR', 'ZARAYACU', [
        ('7', 'GEORGINA GAYAS, ALEX GUALINGA, ANA GUALINGA, SABINO GUALINGA, LUCINDA SANTI'),
        ('18', 'FRANCISCO FREIRE, ELENA ARANDA, EMERSON ILLANES, EIMI ILLANES, ALBERTO GUALINGA'),
    ]),
    ('VOCAL_JPR', 'POMONA', [
        ('7', 'JUDITH VARGAS, MARCO LOPEZ, BRIGITTE VARGAS, JORDY CHALCO, ERIKA FLORES'),
        ('61', 'NORMA CHARCO, ANGEL LLERENA, ROSA ACAN, ANGEL TOSCANO, XIMENA VARGAS'),
        ('63-20', 'ENRIQUE VARGAS, MARIA ACAN, GUILLERMO ROSERO, KATTY TOSCANO, RICHARD ZABALA'),
    ]),
    # Sin papeleta en el PDF: datos indicados por el usuario (solo listas, sin nombres)
    ('VOCAL_JPR', 'VERACRUZ', [
        ('7', None), ('61', None), ('63-20', None), ('18', None),
    ]),
    ('VOCAL_JPR', 'RIO TIGRE', [
        ('7', None),
    ]),
]

AMBITO_CANTONAL = {'ALCALDE', 'CONCEJAL_URBANO', 'CONCEJAL_RURAL'}


def s(v):
    if v is None:
        return 'null'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    out = [
        '-- Organizaciones y candidaturas — Elecciones Seccionales 2027, Pastaza',
        '-- Generado por scripts/generar_candidaturas.py desde Papeletas_Pastaza_2027_A4_29_hojas.pdf',
        '-- Idempotente: se puede ejecutar varias veces (actualiza nombres/orden, no duplica).',
        '-- No incluye CPCCS (no está en el PDF).',
        'begin;',
        '',
        '-- 1. Organizaciones (una por número de lista; las alianzas son una organización propia)',
        'create temp table _org (lista text, sigla text, nombre text, color text) on commit drop;',
        'insert into _org values',
        ',\n'.join(f'  ({s(l)}, {s(sg)}, {s(n)}, {s(c)})' for l, (sg, n, c) in ORGS.items()) + ';',
        'update public.organizacion o set sigla = t.sigla, nombre = t.nombre, color = t.color',
        '  from _org t where o.lista = t.lista;',
        'insert into public.organizacion (lista, sigla, nombre, color)',
        '  select t.lista, t.sigla, t.nombre, t.color from _org t',
        '  where not exists (select 1 from public.organizacion o where o.lista = t.lista);',
        '',
        '-- 2. Candidaturas',
        'create temp table _cand (dignidad text, lista text, nombre text, canton_id integer, parroquia_id integer, orden integer) on commit drop;',
        'insert into _cand values',
    ]
    filas = []
    for dign, circ, items in PAPELETAS:
        canton = CANTON[circ] if dign in AMBITO_CANTONAL else None
        parroquia = PARROQUIA[circ] if dign == 'VOCAL_JPR' else None
        for orden, (lista, nombre) in enumerate(items, 1):
            assert lista in ORGS, lista
            nombre = nombre or f'LISTA {lista} – {ORGS[lista][1]}'
            filas.append(f'  ({s(dign)}, {s(lista)}, {s(nombre)}, {s(canton)}, {s(parroquia)}, {orden})')
    out.append(',\n'.join(filas) + ';')
    out += [
        '',
        '-- Para vocales el trigger completa canton_id desde la parroquia',
        "update _cand c set canton_id = p.canton_id from public.parroquia p where p.id = c.parroquia_id;",
        '',
        'update public.candidatura k set nombre = c.nombre, orden = c.orden, activa = true',
        '  from _cand c',
        '  join public.dignidad d on d.codigo = c.dignidad',
        '  join public.organizacion o on o.lista = c.lista',
        ' where k.dignidad_id = d.id and k.organizacion_id = o.id',
        '   and k.canton_id is not distinct from c.canton_id',
        '   and k.parroquia_id is not distinct from c.parroquia_id;',
        '',
        'insert into public.candidatura (dignidad_id, organizacion_id, nombre, canton_id, parroquia_id, orden)',
        'select d.id, o.id, c.nombre, c.canton_id, c.parroquia_id, c.orden',
        '  from _cand c',
        '  join public.dignidad d on d.codigo = c.dignidad',
        '  join public.organizacion o on o.lista = c.lista',
        ' where not exists (select 1 from public.candidatura k',
        '                    where k.dignidad_id = d.id and k.organizacion_id = o.id',
        '                      and k.canton_id is not distinct from c.canton_id',
        '                      and k.parroquia_id is not distinct from c.parroquia_id);',
        '',
        f'-- Esperado: {len(ORGS)} organizaciones y {len(filas)} candidaturas de este archivo',
        'commit;',
        '',
        "select d.codigo, count(*) as candidaturas from public.candidatura k join public.dignidad d on d.id = k.dignidad_id group by d.codigo, d.orden order by d.orden;",
        '',
    ]
    dest = Path(__file__).resolve().parent.parent / 'sql' / '03_candidaturas_2027.sql'
    dest.write_text('\n'.join(out), encoding='utf-8')
    print(f'{dest}: {len(ORGS)} organizaciones, {len(filas)} candidaturas')


if __name__ == '__main__':
    main()
