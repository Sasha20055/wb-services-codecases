# wb-services-codecases

Подборка исходного кода платформы микрофронтендов и сервисов аналитики маркетплейса. Здесь собраны механизмы интеграции приложений, обновления данных, фоновой обработки данных. Закрытые формулы аналитики заменены заглушками.

Код перенесён из рабочего проекта с сохранением структуры каталогов и реализации. Удалены поясняющие комментарии; технические директивы, влияющие на инструменты, сохранены. Расчётные модули содержат заглушки, а не бизнес-формулы. Конфигурация окружений, ключи, подключения к рабочей инфраструктуре и данные пользователей не включены.

Это репозиторий для чтения кода и запуска выбранных тестов. Он не содержит весь продукт: страницы, HTTP-маршруты, часть зависимых модулей, инфраструктура и внешняя система авторизации остаются за его пределами. Полная сборка приложений здесь не предусмотрена.

## С чего начать

| Кейс | Точка входа | Что смотреть |
| --- | --- | --- |
| Динамические микрофронтенды | [projectsLoader.ts](apps/host/frontend/src/lib/projectsLoader.ts) | Загрузка контейнеров, shared scope, манифесты, маршруты и виджеты |
| Общие UI и авторизация | [ui-proxy-plugin.ts](apps/supplier-analytics/frontend/src/plugins/ui-proxy-plugin.ts) | Подмена импортов UI и контракт между shell и remote |
| Обновления в реальном времени | [live-updates.ts](apps/supplier-analytics/backend/src/live-updates.ts) | Change Streams, SSE, фильтрация подписчиков и presence |
| Ограничение нагрузки | [concurrency-limit.ts](apps/supplier-analytics/backend/src/utils/concurrency-limit.ts) | FIFO, таймаут ожидания, ограничение очереди |
| Фоновый Excel-экспорт | [excel-export-runner.ts](apps/supplier-analytics/backend/src/actions/excel-export-runner.ts) | Обработка задания и формирование результата; расчёты замоканы |
| Синхронизация внешнего API | [http-client.ts](apps/workers/worker-wb-data/src/service/wb-api/http-client.ts) | Очереди запросов, интервалы, retries и отмена |
| Закрытые расчёты | [forecast.ts](apps/supplier-analytics/frontend/src/pagesFSD/dashboard/lib/forecast.ts) | Публичные заглушки вместо бизнес-формул |

## 1. Динамическая композиция микрофронтендов

Бэкенд хранит реестр проектов и отдаёт shell адреса remote-контейнеров, их имена и список модулей. Shell загружает контейнеры во время выполнения, передаёт общие зависимости и собирает маршруты приложения.

Порядок чтения:

1. [Модель проекта и DTO](apps/host/backend/projects_models.go), [чтение реестра](apps/host/backend/projects_repo.go), [HTTP-обработчик](apps/host/backend/projects_handlers.go).
2. [Загрузчик контейнеров](apps/host/frontend/src/lib/projectsLoader.ts): кеш, shared scope React, чтение манифестов, загрузка маршрутов, навигации и виджетов.
3. [Инициализация shell](apps/host/frontend/src/App.tsx) и [его layout](apps/host/frontend/src/ShellLayout.tsx).
4. [Конфигурация remote](apps/supplier-analytics/frontend/vite.config.ts), [манифест](apps/supplier-analytics/frontend/src/manifest.ts), [маршруты](apps/supplier-analytics/frontend/src/routes.tsx) и [навигация](apps/supplier-analytics/frontend/src/Nav.tsx).
5. [Динамический dev-прокси](apps/host/frontend/src/plugins/dynamicApiProxy.ts), использующий реестр для маршрутизации API-запросов.

Реестр определяет, какой код будет исполняться в браузере, поэтому в реальной системе относится к доверенной конфигурации. Ошибки загрузки remote обрабатываются загрузчиком; изоляцию любых ошибок рендера этот механизм сам по себе не обеспечивает.

## 2. Общий UI-kit и контекст авторизации

[UI-kit](apps/ui-kit/src/shared/ui) публикуется отдельным federation-контейнером. [Манифест](apps/ui-kit/src/manifest.ts) описывает доступные компоненты, а shell загружает их в `window.__UI__`.

[Vite-плагин](apps/supplier-analytics/frontend/src/plugins/ui-proxy-plugin.ts) обрабатывает импорты `ui/*` при production-сборке и связывает их с реестром компонентов. Здесь также сохранены стили, вспомогательные функции и [конфигурация экспорта UI-kit](apps/ui-kit/vite.config.ts).

[AuthProvider](apps/host/frontend/src/auth/AuthProvider.tsx) и [потребитель контекста в remote](apps/supplier-analytics/frontend/src/features/auth/ui.tsx) используют общий объект `window.__AUTH_CONTEXT__`. [API-слой shell](apps/host/frontend/src/lib/api.ts) объединяет одновременные попытки обновления сессии в один запрос — single-flight refresh.

Компромисс подхода: глобальные реестры требуют согласования контрактов и порядка инициализации. Клиентский контекст не заменяет серверную проверку прав.

## 3. Change Streams → SSE → React Query

[Сервер](apps/supplier-analytics/backend/src/live-updates.ts) наблюдает за коллекциями MongoDB и рассылает события подписчикам с учётом доступных кабинетов. Heartbeat поддерживает соединение; закрытие потока освобождает подписку и таймер.

[Клиентский provider](apps/supplier-analytics/frontend/src/appFSD/providers/live-updates-provider.tsx) восстанавливает соединение с exponential backoff и jitter. Watchdog обнаруживает соединения, переставшие получать события. Инвалидации React Query объединяются в коротком временном окне.

Дополнительно реализовано присутствие пользователей в заданиях: [hook активности](apps/supplier-analytics/frontend/src/shared/lib/hooks/use-packer-task-active.ts), [индикатор](apps/supplier-analytics/frontend/src/shared/ui/task-presence-indicator.tsx), серверные снимки присутствия и удаление устаревших сессий.

Presence и подписчики хранятся в памяти процесса. Это не CRDT и не распределённый механизм совместного редактирования. Для Change Streams требуется MongoDB replica set или sharded cluster; маршруты с авторизацией в подборку не включены.

## 4. Защита тяжёлых запросов от перегрузки

[Семафор](apps/supplier-analytics/backend/src/utils/concurrency-limit.ts) ограничивает параллельное выполнение, ставит ожидающие задачи в FIFO-очередь и отклоняет ожидание при таймауте или переполнении. Слот освобождается через `finally`, в том числе при исключении.

[Тесты](apps/supplier-analytics/backend/src/utils/concurrency-limit.test.ts) проверяют лимит, порядок допуска, переполнение, таймаут и освобождение слота после ошибки.

[Memory guard](apps/supplier-analytics/backend/src/memory-guard.ts) отдельно учитывает количество тяжёлых запросов и RSS, возвращая `503` с `Retry-After` при превышении порогов. [Настройки семафоров](apps/supplier-analytics/backend/src/lib/semaphores.ts) показывают применение ограничителя к разным операциям.

Ограничения действуют в пределах одного процесса и снижают риск перегрузки, но не гарантируют отсутствие OOM.

## 5. Фоновый экспорт Excel

[Модель заданий и файлов](apps/supplier-analytics/backend/src/actions/excel-exports.ts) содержит состояния `pending`, `running`, `completed`, `failed`, `canceled`, прогресс и сохранённое состояние обработки. Файлы хранятся в GridFS; история ограничивается и очищается вместе с соответствующими файлами.

[Runner](apps/supplier-analytics/backend/src/actions/excel-export-runner.ts) организует подготовку документов с вызовами расчётных модулей. [Клиентский provider](apps/supplier-analytics/frontend/src/appFSD/providers/export-job-provider.tsx) сопровождает экспорт в интерфейсе.

В коде есть обработка прерванных заданий и запрос отмены. HTTP-маршруты, запуск runner и часть доменных сервисов не входят в подборку; отдельной гарантии exactly-once здесь не заявляется.

## 6. Синхронизация внешнего API

[HTTP-клиент](apps/workers/worker-wb-data/src/service/wb-api/http-client.ts) регулирует частоту запросов, использует очереди по ключам и повторяет временно неуспешные запросы. Отдельно обрабатываются ошибки авторизации, `429`, deadline и отмена через `AbortSignal`.

[Сервис синхронизации](apps/workers/worker-wb-data/src/service/sync-service.ts) показывает координацию загрузки данных. [Репозиторий](apps/workers/worker-wb-data/src/db/repos/data.repo.ts) выполняет пакетные записи и обновления снимков. [Контроль состояния токена](apps/workers/worker-wb-data/src/service/token-health.ts) связывает ошибки доступа с состоянием синхронизации.

Конкретные подключения, token resolver и большая часть API-адаптеров исключены. Ограничители частоты работают внутри процесса; запуск нескольких воркеров требует отдельно учитывать суммарную нагрузку.

## 7. Заглушки расчётов

Расчёты товарной аналитики, включая прогнозы, закупку, распределение по складам и связанные функции серверного экспорта, являются закрытой информацией. В публичной подборке исходные реализации заменены заглушками. Заглушки сообщают об отсутствии реализации и не возвращают фиктивные финансовые показатели.

Имена экспортируемых функций оставлены для понимания связей между модулями. Их точные типовые контракты и работоспособность аналитических сценариев в публичной подборке не гарантируются. Исходные тесты расчётов исключены.

## Проверка кода

Для тестов используется Bun. Тесты проверяют семафор и то, что заглушки расчётов не выполняют закрытую логику. Подключение к базе, внешним API или env-файлы не требуются:

```sh
bun run test
```

Конфигурации Vite и TypeScript оставлены как часть архитектурных примеров. Репозиторий не содержит всех зависимостей приложений, а также оригинальной реализации аналитики, поэтому полноценная сборка и запуск продукта здесь не предусмотрены.
