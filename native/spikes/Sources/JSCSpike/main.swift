// Спайк 3: JavaScriptCore как среда для плагинов (ADR-0004).
// Проверяем:
//   1. Стоимость создания изолированного контекста на плагин.
//   2. Стоимость вызова нативной функции из JS (передача команд, текста).
//   3. Что видно плагину: только то, что явно передано (capabilities).
//   4. Останавливается ли бесконечный цикл сам по себе (главный риск).
// Запуск: см. native/spikes/README-RU.md
import Foundation
import JavaScriptCore

let mode = CommandLine.arguments.dropFirst().first ?? "tests"

// Режим «loop»: дочерний процесс, который просто крутит бесконечный цикл.
// Родитель запускает его и смотрит, остановится ли он сам.
if mode == "loop" {
    let ctx = JSContext()!
    _ = ctx.evaluateScript("while (true) {}")
    exit(0)
}

func ms(_ start: UInt64) -> Double {
    Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
}

print("JavaScriptCore spike — macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")

// 1. Создание контекстов.
do {
    let n = 200
    let t0 = DispatchTime.now().uptimeNanoseconds
    for _ in 0..<n { _ = JSContext() }
    print(String(format: "1. Создание контекста: %.3f мс в среднем (n=%d)", ms(t0) / Double(n), n))
}

// 2. Песочница с capabilities: плагин видит только переданный объект.
let ctx = JSContext()!
var pluginErrors: [String] = []
ctx.exceptionHandler = { _, exception in
    pluginErrors.append(exception?.toString() ?? "unknown")
}

// Нативная функция, разрешённая capability `text.read`.
let readSelection: @convention(block) () -> String = { "выделенный текст" }
// Нативная функция, которой у плагина НЕТ (сеть). Не передаём её в контекст вовсе.

let editorAPI = JSValue(object: ["readSelection": readSelection], in: ctx)!
ctx.setObject(editorAPI, forKeyedSubscript: "editor" as NSString)

// 2a. Доступ к разрешённому API.
let allowed = ctx.evaluateScript("editor.readSelection()")?.toString() ?? "nil"
print("2a. Разрешённый вызов: \(allowed)")

// 2b. Попытка доступа к неразрешённому (сеть) — должна быть ошибка или undefined.
let fetchType = ctx.evaluateScript("typeof fetch + ' / ' + typeof XMLHttpRequest + ' / ' + typeof require")?.toString() ?? "nil"
print("2b. Глобалы сети/модулей в контексте: \(fetchType)  (ожидаем: undefined / undefined / undefined)")

// 3. Стоимость вызова нативной функции из JS.
let counter: @convention(block) (Int) -> Int = { $0 + 1 }
ctx.setObject(counter, forKeyedSubscript: "bump" as NSString)
ctx.evaluateScript("var acc = 0; function run(n) { for (var i = 0; i < n; i++) { acc = bump(acc); } return acc; }")
do {
    let calls = 100_000
    let t0 = DispatchTime.now().uptimeNanoseconds
    let result = ctx.evaluateScript("run(\(calls))")?.toInt32() ?? -1
    let total = ms(t0)
    print(String(format: "3. %d вызовов нативной функции: %.1f мс, %.2f мкс на вызов (результат %d)",
                 calls, total, total * 1000 / Double(calls), result))
}

// 4. Чистый JS без нативных вызовов (ориентир скорости движка).
do {
    let t0 = DispatchTime.now().uptimeNanoseconds
    _ = ctx.evaluateScript("var s = 0; for (var i = 0; i < 10000000; i++) { s += i; } s")
    print(String(format: "4. Чистый цикл 10 млн итераций: %.1f мс", ms(t0)))
}

// 5. Ошибки плагина не должны ронять хост.
_ = ctx.evaluateScript("throw new Error('ошибка плагина')")
print("5. Перехваченные ошибки плагина: \(pluginErrors)")

// 6. Бесконечный цикл: запускаем себя в режиме loop и ждём 3 секунды.
do {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
    process.arguments = ["loop"]
    try process.run()
    let started = DispatchTime.now().uptimeNanoseconds
    while process.isRunning && ms(started) < 3000 {
        Thread.sleep(forTimeInterval: 0.05)
    }
    if process.isRunning {
        process.terminate()
        print("6. Бесконечный цикл НЕ остановился сам за 3 с → нужен механизм лимита времени (см. ADR-0004).")
    } else {
        print("6. Бесконечный цикл остановился сам (неожиданно — проверить вручную).")
    }
}

print("\nГотово. Результаты перенести в docs/NATIVE-SPIKE-RU.md.")
