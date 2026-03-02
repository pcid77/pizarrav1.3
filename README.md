# Pizarra Infinita

Aplicación web ligera para organizar proyectos en pizarras separadas, con elementos visuales conectables.

## Funcionalidades

- Pizarras múltiples (una por proyecto).
- Elementos: nota, imagen, enlace/video y línea de tiempo.
- Línea de tiempo con:
  - eventos con fecha
  - periodos con fecha de inicio y fin
- Conexiones visuales entre elementos (modo **Conectar**).
- Espacio infinito con desplazamiento (Shift + arrastrar) y zoom (rueda del mouse).
- Persistencia local en el navegador (`localStorage`).

## Ejecutar

Abre `index.html` directamente o inicia un servidor local:

```bash
python3 -m http.server 4173
```

Luego visita `http://localhost:4173`.

## Formato de línea de tiempo

Al crear un nodo de línea de tiempo, puedes usar líneas como estas:

```text
evento|Inicio|2026-01-10
periodo|Implementación|2026-01-15|2026-02-20
evento|Entrega|2026-03-01
```
