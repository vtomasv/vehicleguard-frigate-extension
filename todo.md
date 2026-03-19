# Sistema de Control de Acceso de Vehículos - TODO

## Base de Datos
- [x] Schema: tabla cameras (cámara 1 camiones, cámara 2 autos/personas)
- [x] Schema: tabla access_events (eventos de entrada/salida con descripción LLM)
- [x] Schema: tabla video_uploads (videos subidos con URL S3 y estado de procesamiento)
- [x] Schema: tabla person_counts (conteo único de personas por cámara 2)
- [x] Migración de base de datos (pnpm db:push)

## Backend - API tRPC
- [x] Router: cameras (listar, obtener estado)
- [x] Router: videoUpload (subir video a S3, iniciar procesamiento)
- [x] Router: videoAnalysis (extraer frames, invocar LLM visión, parsear respuesta)
- [x] Router: accessEvents (listar, filtrar por fecha/hora/tipo/dirección)
- [x] Router: dashboard (estadísticas: conteos por hora, tipo, dirección)
- [x] Router: personCount (conteo único de personas cámara 2)
- [x] Notificaciones automáticas al owner en eventos críticos

## Frontend - UI
- [x] Login page con autenticación simulada (Manus OAuth)
- [x] DashboardLayout con sidebar de navegación
- [x] Panel de cámaras: vista dual con upload de video por cámara
- [x] Reproductor de video con indicador de procesamiento en tiempo real
- [x] Tabla de registros de acceso con filtros (fecha, tipo, dirección)
- [x] Dashboard analítico con gráficos (recharts): entradas/salidas por hora
- [x] Indicadores de conteo de personas en cámara 2
- [x] Badge de estado de procesamiento (pendiente/procesando/completado/error)
- [x] Modal de detalle de evento con descripción LLM y frame capturado

## Integración LLM de Visión
- [x] Extracción de frames clave del video (cada N segundos)
- [x] Prompt estructurado para análisis de camiones (dirección, carga, características)
- [x] Prompt estructurado para análisis de autos y personas
- [x] Detección de dirección: derecha=entrada, izquierda=salida
- [x] Conteo único de personas (evitar duplicados entre frames)
- [x] Almacenamiento de frames como evidencia en S3

## Almacenamiento S3
- [x] Upload de videos originales a S3
- [x] Upload de frames extraídos como evidencia
- [x] URLs permanentes en base de datos

## Notificaciones
- [x] Notificación al owner en detección de vehículo
- [x] Notificación en anomalías (vehículo no identificado, error de procesamiento)

## Tests
- [x] Test: videoUpload router
- [x] Test: accessEvents router
- [x] Test: dashboard stats router

## Bug Fixes
- [x] Fix: vehicleType="none" y direction="unknown" del LLM causan error en ENUM de MySQL
- [x] Fix: normalizar valores LLM antes de insertar en access_events
- [x] Fix: EventDetailModal recibe evento del mouse en lugar del dato de acceso (TypeError: Cannot read properties of undefined reading 'eventType')
- [x] Fix: Query SQL getDashboardStats usa event_timestamp (snake_case) pero columna es eventTimestamp (camelCase)

## Nuevas Funcionalidades (Sprint 2)
- [x] Schema: agregar campos directionConfig (JSON) en tabla cameras para guardar flechas de dirección
- [x] Migrar base de datos con nuevo campo directionConfig
- [x] Router: cameras.updateDirectionConfig para guardar configuración de flechas
- [x] Prompts LLM completamente en español (descripciones, notas de seguridad, características)
- [x] Contexto de flechas enviado al LLM como parte del prompt de análisis
- [x] UI: Canvas interactivo en CameraPanel para dibujar flecha verde (entrada) y roja (salida)
- [x] UI: Herramienta de dibujo de flechas con drag para definir inicio y fin de cada flecha
- [x] UI: Guardar y mostrar flechas configuradas sobre el preview de la cámara
- [x] UI: Indicador visual de que la cámara tiene flechas configuradas antes de procesar video
- [x] Integrar directionConfig en el flujo de análisis de video (videoAnalysis.ts)
- [x] Fix: HOUR(drizzle_column_ref) en getDashboardStats falla en TiDB/MySQL — corregido usando sql raw con nombre literal de columna

## Sprint 3 — Atributos enriquecidos y corrección de dirección
- [x] Analizar frames de videos de muestra para verificar el problema de dirección
- [x] Agregar atributos únicos al schema: matricula, marca, modelo, estado carrocería, accesorios, remolque, tipo carga, color secundario, año estimado, estado vidrios, etc.
- [x] Migrar DB con nuevos campos de atributos
- [x] Reescribir prompt LLM para camiones con 20+ atributos únicos de identificación
- [x] Reescribir prompt LLM para autos con 20+ atributos únicos de identificación
- [x] Corregir lógica de interpretación de flechas: el LLM debe recibir descripción clara de qué flecha indica entrada y cuál salida con coordenadas de inicio/fin
- [x] Agregar visualización de flechas sobre el frame analizado para depuración
- [x] Actualizar UI de registros para mostrar los nuevos atributos enriquecidos

## Sprint 4 — Corrección detección dirección cámara 2
- [x] Analizar frames del video de salida del auto rojo (161731.mp4) para entender trayectoria
- [x] Diagnosticar por qué las flechas configuradas no determinan correctamente la salida del auto rojo
- [x] Mejorar el prompt LLM para que interprete mejor las flechas configuradas vs movimiento real del vehículo
- [x] Agregar matching angular server-side entre dirección del vehículo y flechas configuradas (matchDirectionToArrows)
- [x] Expandir ENUM direction con diagonales: forward-right, forward-left, backward-right, backward-left
- [x] Migrar DB con nuevo ENUM direction
- [x] Actualizar prompt LLM para reportar dirección diagonal con mayor precisión
- [x] Agregar 11 tests para matchDirectionToArrows y nuevas direcciones diagonales (56 tests totales)

## Sprint 5 — Detección de múltiples vehículos por video
- [x] Analizar video 161731 para contar cuántos vehículos distintos aparecen (auto rojo sale, auto plateado entra)
- [x] Rediseñar analyzeVideoFrames: agregar detectVehicleSegments con checkFramePresence por frame
- [x] Implementar detección de "ventanas de presencia": agrupar frames donde hay vehículo vs frames vacíos (MAX_GAP=2)
- [x] Generar un VehicleAnalysisResult independiente por cada segmento de vehículo detectado
- [x] Agregar analyzeVideoFramesMulti que retorna array de resultados (uno por vehículo)
- [x] Actualizar routers.ts para crear múltiples access_events por video (uno por vehículo detectado)
- [x] Actualizar UI CameraPanel para mostrar cuantos eventos se crearon por video (badge "N vehículos detectados")
- [x] Aumentar frames extraídos de 5 a 12 para mejor cobertura de videos largos
- [x] Agregar 4 tests para analyzeVideoFramesMulti y detectVehicleSegments (60 tests totales)

## Sprint 6 — Editor de prompts, análisis detallado y reporte forense

### Base de Datos
- [x] Schema: agregar campo customPrompt y customSystemPrompt en tabla cameras
- [x] Schema: nueva tabla analysis_reports (reporte detallado por evento: frames anotados, decisiones, razonamiento)
- [x] Migrar DB con nuevos campos y tabla

### Backend
- [x] Router: cameras.updatePrompts para guardar prompts personalizados por cámara
- [x] Router: cameras.getPrompts para obtener prompts actuales
- [x] Extender videoAnalysis.ts para generar DetailedAnalysisReport cuando detailedMode=true
- [x] Generar frames anotados con flechas superpuestas usando canvas server-side (sharp/canvas)
- [x] Router: analysisReports.getByEvent para obtener reporte detallado de un evento
- [x] Guardar reporte detallado en S3 como JSON + imágenes anotadas

### Frontend
- [x] Página de Configuración (/settings): editor de prompts y skills por cámara con textarea editable
- [x] Mostrar prompt actual de cada cámara con opción de restaurar al default
- [x] Switch "Análisis Detallado" en CameraPanel (toggle visible antes de procesar)
- [x] Cuando switch activo: pasar detailedMode=true al processVideo
- [x] Botón "Ver Análisis Detallado" en cada fila de AccessRecords (visible solo si tiene reporte)
- [x] Modal/página de reporte detallado: timeline de frames con flechas superpuestas, decisiones del agente por frame, razonamiento final
- [x] Agregar enlace a Configuración en el sidebar de navegación

## Sprint 7 — Agrupación de eventos por video en Registros

- [x] Backend: incluir videoUploadId y videoFilename en la respuesta de getAccessEvents
- [x] Frontend: agrupar filas de AccessRecords.tsx por videoUploadId
- [x] Frontend: header de grupo con nombre de archivo, fecha, cámara y conteo de vehículos detectados
- [x] Frontend: indicador visual de color por grupo (borde lateral) para distinguir grupos
- [x] Frontend: colapsar/expandir grupo con chevron
- [x] Frontend: badge "N vehículos" en el header del grupo

## Sprint 8 — Deduplicación/tracking cross-segmento de vehículos

- [x] Analizar el flujo actual de detectVehicleSegments y analyzeVideoFramesMulti
- [x] Implementar deduplicateVehicleResults: fusionar segmentos del mismo vehículo por similitud de atributos (color, tipo, marca, dirección)
- [x] Algoritmo de similitud: score basado en vehicleType + vehicleColor + vehicleSubtype + vehicleBrand + vehiclePlate + eventType (umbral 0.65)
- [x] Cuando dos segmentos son el mismo vehículo: conservar el segmento con más frames y mejor confianza
- [x] Agregar campo mergedFrom en resultado para trazabilidad
- [x] Actualizar analyzeVideoFramesMulti para aplicar deduplicateVehicleResults antes de retornar
- [x] Agregar tests para vehicleSimilarityScore y deduplicateVehicleResults (73 tests pasando)

## Sprint 9 — Configuración de APIs/Modelos y repositorio público

- [x] DB: tabla llm_config (provider, apiKey, model, baseUrl, temperature, maxTokens, topP, topK, presenceCheck model, detailedAnalysis model)
- [x] DB: migrar con pnpm db:push
- [x] Backend: router settings.getLLMConfig / settings.saveLLMConfig (protectedProcedure)
- [x] Backend: integrar llm_config en invokeLLM para usar proveedor/modelo/key configurados
- [x] Frontend: página /settings/api con formulario de configuración de APIs y modelos
- [x] Frontend: soporte para OpenAI, Anthropic, Google Gemini, Ollama (local), OpenAI-compatible
- [x] Frontend: campos: API Key, Base URL, modelo para presencia, modelo para análisis detallado, temperatura, max tokens, top-p
- [x] Frontend: botón "Probar conexión" que valida la API key y modelo
- [x] Frontend: agregar enlace "APIs & Modelos" en sidebar bajo Configuración
- [x] GitHub: crear repo público vehicleguard-frigate-extension
- [x] GitHub: docker-compose.yml con servicios: app (Node), MySQL, MinIO, adminer
- [x] GitHub: README.md completo con instrucciones de instalación y configuración
- [x] GitHub: .env.example con todas las variables necesarias

## Sprint 9 — Fix

- [x] Corregir LLMSettings para usar AccessControlLayout en lugar de DashboardLayout genérico
