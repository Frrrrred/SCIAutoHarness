# Agent Task Harness

<a id="codex-task-harness"></a>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md)

**Crea automáticamente un Harness completo y revisable para tareas complejas con Codex, Claude Code o DeepSeek Harness oficial.**

Cuando la habilidad está cargada y corresponde a una tarea compleja, el entorno anfitrión redacta el documento principal, todas las etapas sustantivas, protocolos, recuperación, entregables, dependencias y criterios de aceptación. La ejecución formal espera tu revisión y aprobación directa de la versión completa. Las preguntas sencillas, los diagnósticos acotados y los cambios aislados de bajo riesgo pueden resolverse directamente. El anfitrión redacta y trabaja con sus herramientas; Node.js gestiona contratos, dependencias, identidad y evidencia. draft solo genera una estructura inicial y acciones de elaboración, no un plan sustantivo completo ni su aprobación. Sin autorización para crear archivos, el plan completo se presenta en la conversación.

## Funciones principales

| Funciones principales | Harness |
| --- | --- |
| Creación automática de un Harness completo | Convierte una tarea compleja en un plan con documento principal, etapas, protocolos, recuperación y aceptación para revisión humana |
| Planificación completa y revisión humana | Todas las etapas pertenecen a una versión revisada; la aprobación se vincula al contenido real |
| Carga progresiva | Reanuda desde el documento principal y recuperación; carga la etapa actual y los resúmenes de dependencias necesarios |
| Avance por dependencias | Un DAG define la responsabilidad de los entregables y exige dependencias verificadas |
| Ejecución y aceptación separadas | begin establece la identidad; submit registra los hechos del cierre; verify comprueba la aceptación |
| Vigencia de la evidencia | Cambiar entradas afecta a la aprobación; cambiar resultados o evidencia vuelve stale los resultados afectados y sus dependientes |
| Recuperación de la ejecución original | Conserva run ID activos, registra cierres stale y permite repetir recibos completos e idénticos sin reescribir el historial |
| Controles de ejecución compartidos | El trabajo activo o ambiguo bloquea inicios y verificaciones incompatibles y conserva diagnósticos |
| Varios tipos de aceptación | artifact, command y review conservan fallos, registros y hechos del proceso |
| Vista previa y reversión de instalación | Revisa cambios exactos, protege los bytes e identidades originales y rechaza alteraciones inseguras |
| Tres perfiles explícitos | Una habilidad y un motor ofrecen trabajo nativo y run con autorización independiente |
| Rigor de evidencia científica | Mantiene trazables fuentes, campos, parámetros, decisiones de uso de dependencias y resultados negativos |

## Instalación, uso y reversión

Ejecuta desde un clon completo. El núcleo usa módulos integrados de Node.js y módulos incluidos; no necesita npm install. Elige un anfitrión ya disponible y sus directorios reales de inicio y de habilidades. El instalador no instala clientes, configura proveedores ni concede permisos. El ejemplo usa Codex; para otro anfitrión sustituye los valores de la tabla. Revisa la vista previa, aplícala tras la aprobación de sus cambios exactos y conserva el rollbackManifest devuelto. Revisa también los efectos de revertir.

```powershell
git clone https://github.com/Frrrrred/agent-task-harness.git
cd agent-task-harness
npm run check:skill
npm run help
```

```powershell
$cli = Join-Path (Get-Location).Path 'skills/agent-task-harness/scripts/harness.mjs'
$harnessHost = 'codex'
$harnessHome = Join-Path $HOME '.codex'
$skillParent = Join-Path $HOME '.agents/skills'
$planFile = Join-Path ([IO.Path]::GetTempPath()) ('agent-task-harness-' + [guid]::NewGuid() + '.json')
node $cli install-preview --host $harnessHost --host-home $harnessHome --skill-root $skillParent --out $planFile
Get-Content -LiteralPath $planFile -Raw
```

Tras revisar y aprobar esta vista previa exacta, ejecuta:

```powershell
node $cli install --plan $planFile
```

Conserva rollbackManifest y revisa los efectos antes de revertir:

```powershell
node $cli rollback --manifest 'ABSOLUTE_RETURNED_MANIFEST'
```

| ID del anfitrión | Ejemplo de inicio | Directorio padre de habilidades | Instrucciones |
| --- | --- | --- | --- |
| `codex` | `~/.codex` | `~/.agents/skills` | `AGENTS.md` |
| `claude-code` | `~/.claude` | `~/.claude/skills` | `CLAUDE.md` |
| `deepseek-harness` | `$DSH_HOME` or `~/.dsh` | `<home>/skills` | `AGENTS.md` |


## Ejecución, tareas existentes y recuperación

```text
Trabajo nativo: context → begin → trabajo real y fin confirmado → submit de hechos reales → verify
CLI independiente: context → run → comprobar cierre y recibo reales → verify
```

run inicia y supervisa su propio proceso y presenta sus hechos. No llames primero a begin ni repitas una presentación normal. Usa --host codex|claude-code|deepseek-harness y, opcionalmente, --executable LOCAL_ENTRY; --codex sigue siendo un alias exclusivo de Codex. run puede invocar un modelo y requiere autorización de ejecución y recursos. La primera presentación ok elegible pasa a pending_acceptance y failed a failed. Un original que perdió elegibilidad puede cerrar sus hechos y seguir stale. Solo evidencia vigente establece verified; salida 0, archivos o un mensaje final no demuestran por sí solos la corrección.

**Tarea nueva**

```text
Usa agent-task-harness para preparar un Harness completo para esta tarea compleja: … Presenta documento principal, etapas sustantivas, protocolos, recuperación y aceptación para mi revisión. Tras mi aprobación directa, avanza por dependencias verificadas.
```

**Continuación**

```text
Reanuda [ruta absoluta a HARNESS.md]. Lee el documento principal y recuperación, después context. Conserva aprobación, step, runId, anfitrión y modo originales; consulta evidencia histórica solo para una laguna concreta.
```

**Fallo de aceptación**

```text
Distingue fallo del criterio, rechazo del control y cambios de evidencia. Conserva el intento fallido y organiza corrección y nueva verificación. Un rechazo no invalida por sí solo un resultado verified vigente.
```

**Recuperación**

```text
Confirma si el proceso original terminó realmente. Conserva su identidad y presenta solo hechos reales de finalización. Repite únicamente hechos completos e idénticos; un cierre stale no restaura aprobación ni elegibilidad.
```

## Compatibilidad de nombres e instalación

El nombre canónico es agent-task-harness. Confirma el descubrimiento en una sesión nueva: `$agent-task-harness` en Codex, `/agent-task-harness` en Claude Code, o pide a DSH cargar la habilidad con el proveedor del sistema de archivos y el consumidor correspondientes. Los antiguos `$codex-task-harness`, `/codex-task-harness` y las rutas CLI documentadas se reenvían mediante entradas ligeras de archivos ordinarios al mismo motor, sin otro estado ni aprobaciones. Solo la entrada canónica de Codex permite invocación implícita. Los demás anfitriones tienen sus propios mecanismos.

Las nuevas vistas previas usan safety3 y vinculan los roles de directorio canónico, compatibilidad e instrucciones fijas. Una instalación antigua completa reconocida requiere una vista previa nueva revisada con --replace-skill --migrate-legacy. Se rechazan archivos desconocidos, código antiguo modificado, marcadores mixtos o duplicados y bloques personalizados. Los cambios personalizados revisados por separado usan una entrada API before/after exacta; la CLI no los sobrescribe silenciosamente.

La migración mueve los originales antiguos en el mismo volumen a almacenamiento de recuperación vinculado fuera del descubrimiento de habilidades, con posiciones numeradas .bin. Conserva los directorios vacíos y metadatos antiguos. Una reversión correcta restaura identidad, ACL y flujos NTFS originales; después se puede volver a usar el manifiesto safety1/2 original. No se reescriben los manifiestos antiguos; las vistas previas se regeneran. Revertir primero el manifiesto antiguo se rechaza por cambios.

Una instalación o reversión fallida puede ser parcial. Conserva manifiestos, copias, originales trasladados, causa y progreso confirmado. Los registros prepared incluyen operaciones confirmadas; una interrupción anterior al registro de identidad de un archivo nuevo requiere revisión manual. Solo instalaciones completadas admiten reversión automática. No borres por coincidencia de hash, reintentes a ciegas ni elimines bloqueos.

No cambian schema1 de tareas, los bytes de plantillas1–4, la política revisada de anfitriones, las rutas actual `harness/<id>/` y antigua `.codex/harness/<id>/` ni las identidades de ejecución y recibo. Las tareas approved, pending_acceptance, verified y active mantienen sus aprobaciones y reglas de cierre originales.

## Permisos, evidencia y límites

Cargar la habilidad, seleccionar anfitrión o registrar aprobación no añade acceso a archivos, herramientas, red, instalaciones ni presupuesto de modelos. Los permisos difieren entre anfitriones; el motor no proporciona autenticación del operador, aislamiento del SO ni prueba científica automática. Programación, servicios, MCP, compactación y equipos completos siguen siendo capacidades del anfitrión o externas.

[VALIDATION](docs/VALIDATION.md) indica recuentos y entornos reales. No se ejecutaron modelos reales de ningún anfitrión; las sondas de versión/ayuda y procesos sintéticos son evidencias distintas. DSH se limita al commit oficial 687f282e8625c6b8d11ff58211a90524be2e4317 (@deepseek-ai/dsh 0.2.1-rc.2). DSH no se instaló ni se verificó en un entorno real. Código y fixtures estrictos no demuestran descubrimiento real, integración de proveedores o ejecución de modelos.

**No se ejecutaron los 84 casos originales de actualización entre entornos de ejecución.** Falta la línea base externa congelada correspondiente. Las regresiones principales, goldens, continuaciones actuales y migraciones no los sustituyen. La línea base local establecida es Windows / Node v26.12.1; la batería completa también usa Python, pwsh, enlaces, ACL y flujos NTFS. No establece compatibilidad con otros SO ni una versión mínima de Node.

## Origen y licencia

Desarrollado a partir de los principios de ingeniería Harness de [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code), s01–s17. Ofrece una habilidad compartida y un motor local de evidencia; el [mapa del curso](docs/LEARN_CLAUDE_CODE.md) distingue referencias de diseño, implementación y capacidades del anfitrión. Es independiente, no oficial de OpenAI, Anthropic, DeepSeek o shareAI Lab, y no afirma ser una copia directa del agente completo del tutorial. Conserva avisos MIT, atribución y procedencia de los goldens.

[Getting started](docs/GETTING_STARTED.md) · [Host profiles](docs/HOSTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Compatibility](docs/COMPATIBILITY.md) · [Attribution](ATTRIBUTION.md) · [MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)
