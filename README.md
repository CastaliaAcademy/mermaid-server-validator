# Castalia Mermaid Validator

Отдельный приватный ESM-пакет для серверной проверки **сырого Mermaid**, не Markdown с тройными обратными кавычками. Не требует браузера, HTTP-сервера или изменения mini-app.

## Установка и требования

Node.js **^22.22.2 || ^24.15.0 || >=26.0.0** (ограничение jsdom 30.1.3); pnpm 11.3.0 для разработки. Прямые зависимости зафиксированы: `mermaid: 12.1.0`, `jsdom: 30.1.3`. На момент установки версия jsdom проверена через npm registry; ответы сохранены в `reports/registry-*.json`. `pnpm-lock.yaml` фиксирует транзитивные зависимости разработки; потребитель tarball при установке npm получает транзитивные версии согласно зависимостям пакетов, не наш pnpm lock.

```sh
cd /home/everchaser/Projects/castalia/mermaid-validator
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm smoke
pnpm audit
```

Пакет намеренно `private: true`; лицензия на пользовательский код не назначалась. Это не запрещает локальную упаковку/установку:

```sh
pnpm pack --pack-destination "$TMPDIR"
# В отдельном backend-проекте:
npm install /path/to/castalia-mermaid-validator-0.1.0.tgz
```

## API

```js
import { validateMermaid } from '@castalia/mermaid-validator';

const result = await validateMermaid(
  'flowchart TD\n A["Привет"] --> B["Мир"]',
  { timeoutMs: 5000 },
);
if (result.valid) {
  console.log(result.diagramType); // flowchart-v2
} else {
  console.error(result.error.kind, result.error.message);
}
```

Экспортирована одна функция `validateMermaid(source, options?)`. `source` проверяется во время исполнения; объявления TypeScript принимают `unknown`. Единственная опция — `timeoutMs`, целое число **1…30000**, по умолчанию **5000 мс**. Произвольный Mermaid config API не принимает; неизвестные опции отклоняются.

Результат — дискриминированное объединение:

```ts
type Result =
  | { valid: true; diagramType: string }
  | { valid: false; error: {
      kind: 'input' | 'syntax' | 'timeout' | 'internal' | 'busy';
      message: string;
      line?: number;
    }};
```

- `input`: не строка, пустая/пробельная строка, превышение лимита, неверные опции; в CLI также ошибка чтения/UTF-8/аргументов. До выделения worker.
- `syntax`: распознанная ошибка парсера (Jison `hash`), неизвестный тип диаграммы, ошибка YAML frontmatter.
- `timeout`: истёк общий бюджет запуска worker + jsdom + импорта Mermaid + разбора. Worker **terminate()**, не один `Promise.race`.
- `internal`: сбой импорта/движка/DOMPurify/worker либо неизвестное исключение, которое нельзя уверенно назвать синтаксическим. Не все внутренние ошибки Mermaid имеют стабильный тип: консервативно неизвестные семантические ошибки также могут попасть сюда.
- `busy`: уже запущены две проверки; очереди нет, вызывающая сторона может повторить запрос с собственным ограниченным backoff.

`diagramType` возвращается без переименования из публичного `mermaid.parse()`: например, `sequence`, `flowchart-v2`, `classDiagram`, **`stateDiagram`** для `stateDiagram-v2`. Дополнительный `line` — 1-based строка от парсера; после preprocessing Mermaid она может не совпасть с исходной. Сообщение движка ограничено 2000 UTF-16 code units, может содержать исходный недоверенный текст; экранируйте его при выводе в HTML и не логируйте конфиденциальные диаграммы без необходимости.

## CLI

```sh
castalia-mermaid-validate diagram.mmd
printf 'sequenceDiagram\n Alice->>Bob: Привет\n' | castalia-mermaid-validate
castalia-mermaid-validate --timeout-ms 3000 - < diagram.mmd
node src/cli.js diagram.mmd
```

stdout содержит ровно один JSON-объект и перевод строки; сообщения Mermaid туда не попадают. `--help` возвращает JSON с `usage`. Вход UTF-8: файл либо stdin (`-`/нет пути); неверные UTF-8 байты не заменяются молча. Чтение потоковое и ограничено 100000 байт, без неограниченного `readFile`/сборки stdin. Таймаут относится к валидации, **не** ожиданию поступления stdin; для сетевого ingestion задавайте собственный upstream deadline.

Коды завершения: **0** valid (или help), **1** syntax, **2** input, **3** timeout, **4** internal, **5** busy. Обычный один CLI-запуск не создаёт конкурирующие запросы и сам по себе `busy` не выдаёт.

## Ограничения ресурсов и безопасности

- Максимум **50000 UTF-16 code units** и независимо **100000 UTF-8 байт**. Проверяется исходный текст, включая комментарии/directives/frontmatter. Кириллица/эмодзи расходуют байты иначе, чем JS `.length`.
- Максимум **2 активных worker на загруженный экземпляр модуля в одном Node isolate**, без очереди. Счётчик освобождается только после завершения worker на успехе, ошибке или таймауте. Несколько копий пакета, host worker threads, процессов или CLI — отдельные лимиты; общий deployment admission control обязан обеспечивать backend.
- Worker V8 limits: old generation **128 MiB**, young generation **16 MiB**, stack **4 MiB**. Это **не** предел RSS процесса: native memory, ArrayBuffer и runtime overhead не покрываются. Требуется запас памяти на Mermaid/jsdom и холодный импорт для каждого запроса.
- Дедлайн проверяется в host thread, вызывает реальное завершение worker, и Promise ждёт cleanup. Если host event loop заблокирован, callback таймера может опоздать; возврат результата также включает время termination. Для строгой OS-level изоляции/лимитов используйте отдельный процесс/container, CPU/memory/network policies.
- DOM создаётся только внутри одноразового worker **до динамического импорта Mermaid**. Основной поток не получает `window/document/Element` и не импортирует Mermaid/jsdom. Это исправляет фактически воспроизведённое `TypeError: DOMPurify.addHook is not a function` при голом Node-импорте.
- jsdom не получает `runScripts` и `resources: "usable"`: встроенные скрипты/HTML event-handler attributes не выполняются и subresources не загружаются. Диаграммы не рендерятся. Это защита по конфигурации, **не OS sandbox**: у исполняемого кода зависимостей остаются возможности Node. `execArgv: []` не переносит host `--input-type`/debug/preload CLI-флаги в file worker; окружение, включая доверенный `NODE_OPTIONS`, остаётся окружением приложения. Недоверенный код не следует запускать в host/loader/preload.

## Соответствие mini-app

Используется официальный публичный `mermaid.parse()`, не копия внутренних парсеров. Конфигурация соответствует семантическим ограничениям mini-app: `securityLevel: strict`, `htmlLabels: false`, `suppressErrorRendering: true`, `startOnLoad: false`, `theme: base`.

Заблокирован список `secure`: `secure`, `securityLevel`, `startOnLoad`, `maxTextSize`, `maxEdges`, `suppressErrorRendering`, `dompurifyConfig`, `themeCSS`, `htmlLabels`, `theme`, `themeVariables`. Обе формы пользовательской конфигурации (init-directives и YAML frontmatter) обрабатываются самим Mermaid с этим secure list. Остальные разрешённые самим Mermaid настройки из текста **не удаляются**: это намеренно сохраняет поведение mini-app. Цвета из браузерных CSS themeVariables backend не воспроизводит; на синтаксис они не влияют.

**Синтаксическая корректность не гарантирует успешный render.** Нет браузерного layout, SVG, проверки размеров, шрифтов, accessibility или исполнения click callbacks. Этот модуль не является HTML/SVG sanitizer для результатов другого renderer. В backend передавайте тот же raw source, который затем получит mini-app, и всё равно обрабатывайте ошибки `mermaid.render()` в браузере.

## Проверки и воспроизводимость

`test/fixtures/castalia.json` — копия трёх реальных примеров приложения; `compatibility.json` — 21 источник с ожидаемым результатом, включая эти три, базовые типы, Unicode/HTML labels, config overrides и ошибочные диаграммы. Базовый Chromium parse/render отдельно проверяет вызывающий проект; backend-тесты используют **настоящий** Mermaid, не mocks. Для наблюдения effective config test-only worker импортирует приватный `engine.js`; публичных injection hooks нет.

Есть проверки input/байтов, timeout/termination/повторного запроса, peak concurrent workers/cleanup через async_hooks, actual bare-Node DOMPurify failure и повреждённой установки зависимости, неожиданного завершения worker, CLI/UTF-8 и TS narrowing. `pnpm smoke` делает **npm pack и pnpm pack**, чистую установку tarball через npm в `$TMPDIR`, проверяет ESM API, declarations import и установленный bin, затем удаляет временные файлы. Итоговые логи и краткие RED→GREEN циклы находятся в `reports/`.

`pnpm audit` при первоначальной проверке нашёл **1 low** в транзитивном `mermaid > katex@0.16.47`, GHSA-238p-pmpm-9mq7 (prototype pollution prerequisite; patched >=0.18.2). Не скрыто и не исправлено принудительным несовместимым override: Mermaid 12.1.0 зафиксирован для parity. Это не означает отсутствие других рисков; проверьте текущий `reports/audit.json` и запускайте audit при обновлении. Основное приложение и соседние проекты модуль не изменяет.
