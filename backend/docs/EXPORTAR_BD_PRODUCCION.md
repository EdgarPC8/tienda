# Exportar BD de producción e importar en local

Guía para traer la base `softed` del servidor institucional a tu PC (EdDeli / desarrollo).

## Tras `git clone` (servidor o PC)

`backup.json` **no va al repositorio** (datos locales). Sube tu JSON en **Comandos** o cópialo con `scp` a `backend/src/database/backup.json`, luego `npm run db:reset`.

## Red y acceso

| Dónde | Cómo |
|--------|------|
| Dentro de la institución | Servidor MySQL/MariaDB en `192.168.10.25` |
| Desde casa | Puente SSH: `ssh user@100.94.237.31` |

Usa siempre la IP/host con el que **sí te conectas por SSH** desde casa (`100.94.237.31`).

---

## 1. En el servidor (por SSH)

Crear el volcado completo de la base:

```bash
mysqldump -u root -p --single-transaction softed > /home/user/softed-completa.sql
```

Comprobar que el archivo tiene tamaño (no 0 bytes):

```bash
ls -lh /home/user/softed-completa.sql
```

Solo turnos de caja (opcional):

```bash
mysqldump -u root -p --single-transaction --no-create-info --complete-insert softed \
  ERP_cash_shifts ERP_cash_shift_movements > /home/user/turnos.sql
```

---

## 2. En tu PC (terminal local, **no** dentro del SSH)

Descargar el archivo del servidor a tu máquina:

```bash
scp user@100.94.237.31:/home/user/softed-completa.sql /home/edgarpc8/Descargas/softed-completa.sql
```

- **Origen:** `usuario@servidor:/ruta/en/servidor/archivo.sql`
- **Destino:** ruta local **con nombre de archivo** (no solo la carpeta)

Si usas otra carpeta de destino:

```bash
scp user@100.94.237.31:/home/user/softed-completa.sql /ruta/local/softed-completa.sql
```

**No ejecutar `scp` dentro de la sesión SSH del servidor** (da `Permission denied` o errores raros).

---

## 3. Importar en MariaDB/MySQL local

Copia opcional al proyecto:

```bash
cp ~/Descargas/softed-completa.sql "/home/edgarpc8/Escritorio/Empresa Softed/eddeli/backend/src/database/"
```

Importar (reemplaza tablas y datos según el dump):

```bash
mysql -u root -p softed < "/home/edgarpc8/Escritorio/Empresa Softed/eddeli/backend/src/database/softed-completa.sql"
```

Verificar turnos:

```bash
mysql -u root -p softed -e "SELECT COUNT(*) AS turnos FROM ERP_cash_shifts;"
```

---

## 4. Alternativas si `scp` falla

- **Cursor / VS Code Remote SSH:** abrir el archivo en el servidor → clic derecho → Download.
- **SFTP interactivo:**

```bash
sftp user@100.94.237.31
cd /home/user
get softed-completa.sql
bye
```

---

## 5. Después de importar

1. Reiniciar el backend EdDeli (`npm run dev`).
2. Opcional: en Comandos → **Guardar copia en servidor** para regenerar `backup.json` con los datos nuevos (incluidos turnos).
