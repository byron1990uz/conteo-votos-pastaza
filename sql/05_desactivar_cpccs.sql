-- Migración: el sistema no lleva el conteo del CPCCS.
-- Desactiva sus tres dignidades para que no aparezcan en Digitación, Resultados ni Administración.
-- No borra nada: para volver a usarlas, ejecutar lo mismo con "activa = true".
-- Se puede volver a ejecutar. (02_datos_pastaza.sql no cambia "activa", así que no las reactiva.)

update public.dignidad set activa = false where codigo like 'CPCCS%';

select codigo, nombre, activa from public.dignidad order by orden;
