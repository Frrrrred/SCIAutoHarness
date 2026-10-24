# SCIAutoHarness

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Scientific Automation Harness** — un arnés para planificar, revisar y completar tareas de investigación con ejecución y recuperación trazables.

Funciona dentro de un agente anfitrión. Convierte una petición compleja en un plan completo, vincula la aprobación humana al plan, avanza mediante dependencias aceptadas y conserva la identidad de la ejecución original al reanudar. Las conclusiones científicas se relacionan con sus fuentes, parámetros y evidencias de ejecución.

## Empezar

Utiliza un entorno Node.js y un agente anfitrión existentes. El núcleo usa módulos integrados de Node.js y no necesita instalar dependencias.

```powershell
git clone https://github.com/Frrrrred/SCIAutoHarness.git
cd SCIAutoHarness
npm run help
```

Sigue la [guía de instalación y uso](docs/GETTING_STARTED.md) para revisar los destinos antes de aplicar el plan. En una sesión nueva de Codex, invoca `$sciautoharness`.

## Flujo de trabajo

1. Define el resultado, las fuentes, los permisos y los criterios de aceptación.
2. Revisa el plan completo antes de ejecutar.
3. Avanza cuando las dependencias tengan evidencias aceptadas.
4. Reanuda desde la entrada original, conservando la aprobación y la identidad de ejecución.

Las preguntas sencillas y las ediciones aisladas de bajo riesgo pueden resolverse directamente. La investigación también requiere procedencia de datos, elección de parámetros, incertidumbre y controles antes del uso posterior.

```text
Use $sciautoharness to plan this research task: …
Use the existing research-sci environment. Define inputs, outputs,
permissions and acceptance. Wait for my review before execution.
```

## Anfitriones y permisos

Hay perfiles para Codex, Claude Code y DeepSeek Harness. El descubrimiento, las credenciales y las llamadas al modelo pertenecen al anfitrión elegido. Instalar la habilidad no instala el anfitrión, configura proveedores ni autoriza acciones externas. Consulta [anfitriones](docs/HOSTS.md) y [compatibilidad](docs/COMPATIBILITY.md).

## Documentación

- [Instalación y uso](docs/GETTING_STARTED.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Anfitriones](docs/HOSTS.md) y [compatibilidad](docs/COMPATIBILITY.md)
- [Contribución](CONTRIBUTING.md) y [seguridad](SECURITY.md)

## Licencia y fuentes

Disponible bajo la [licencia MIT](LICENSE). Las atribuciones y referencias de diseño están en [fuentes](ATTRIBUTION.md).
