// Спайк 1: TextKit 2 на больших файлах.
// Вопрос: тянет ли NSTextView (TextKit 2) открытие, прокрутку и ввод на файлах 100 МБ и 1 ГБ?
// Запуск: см. native/spikes/README-RU.md
import AppKit

// MARK: - Параметры

let sizesMB: [Int] = [100, 1024]
let lineLength = 80            // символов в строке (включая перенос)
let scrollSteps = 200          // шагов прокрутки на замер
let typingSteps = 200          // нажатий клавиш на замер
let viewport = NSRect(x: 0, y: 0, width: 900, height: 700)

// MARK: - Утилиты замеров

func ms(_ start: UInt64) -> Double {
    Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
}

func percentile(_ values: [Double], _ p: Double) -> Double {
    guard !values.isEmpty else { return .nan }
    let sorted = values.sorted()
    let index = min(sorted.count - 1, Int((Double(sorted.count) * p).rounded(.up)) - 1)
    return sorted[max(0, index)]
}

func report(_ title: String, _ values: [Double]) {
    let p50 = percentile(values, 0.50)
    let p95 = percentile(values, 0.95)
    let worst = values.max() ?? .nan
    print(String(format: "  %-28@ p50 %8.2f мс | p95 %8.2f мс | max %8.2f мс | n=%d",
                 title as NSString, p50, p95, worst, values.count))
}

// MARK: - Генерация тестового файла

func makeTestFile(megabytes: Int) throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("spike-\(megabytes)mb.txt")
    if FileManager.default.fileExists(atPath: url.path) {
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        if size >= megabytes * 1_048_576 { return url }
    }
    // Строки из латиницы и кириллицы, чтобы не было «лёгкого» текста.
    let line = "let value\(Int.random(in: 0...9999)) = компонент_\(lineLength) // тестовая строка for TextKit spike\n"
    var chunk = ""
    chunk.reserveCapacity(1_048_576)
    while chunk.utf8.count < 1_048_576 { chunk += line }
    let handle = try FileHandle(forWritingTo: {
        FileManager.default.createFile(atPath: url.path, contents: nil)
        return url
    }())
    defer { try? handle.close() }
    let chunkData = Data(chunk.utf8)
    for _ in 0..<megabytes { handle.write(chunkData) }
    return url
}

// MARK: - Редактор на TextKit 2

@MainActor
final class SpikeEditor {
    let scrollView = NSScrollView(frame: viewport)
    let textView: NSTextView

    init() {
        // usingTextLayoutManager: true — включает TextKit 2 (NSTextLayoutManager).
        textView = NSTextView(usingTextLayoutManager: true)
        textView.isRichText = false
        textView.allowsUndo = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.frame = viewport
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
    }

    var layoutManager: NSTextLayoutManager? { textView.textLayoutManager }

    /// Один проход разметки видимой области (viewport).
    func layoutVisible() {
        layoutManager?.textViewportLayoutController.layoutViewport()
    }

    func scroll(toFraction fraction: CGFloat) {
        let docHeight = textView.frame.height
        let maxY = max(0, docHeight - viewport.height)
        let y = maxY * fraction
        scrollView.contentView.scroll(to: NSPoint(x: 0, y: y))
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }
}

// MARK: - Сценарии

@MainActor
func runSpike(sizeMB: Int) throws {
    print("\n=== Файл \(sizeMB) МБ ===")
    let url = try makeTestFile(megabytes: sizeMB)
    let editor = SpikeEditor()

    // 1. Чтение файла с диска.
    var t = DispatchTime.now().uptimeNanoseconds
    let text = try String(contentsOf: url, encoding: .utf8)
    print(String(format: "  чтение с диска                 %8.0f мс", ms(t)))

    // 2. Установка текста и первый проход разметки видимой области.
    t = DispatchTime.now().uptimeNanoseconds
    editor.textView.string = text
    let setMs = ms(t)
    t = DispatchTime.now().uptimeNanoseconds
    editor.layoutVisible()
    print(String(format: "  установка текста               %8.0f мс", setMs))
    print(String(format: "  первая разметка видимой части  %8.0f мс", ms(t)))

    // 3. Прокрутка: случайные позиции по всему файлу.
    var scrollTimes: [Double] = []
    for _ in 0..<scrollSteps {
        let t0 = DispatchTime.now().uptimeNanoseconds
        editor.scroll(toFraction: CGFloat.random(in: 0...1))
        editor.layoutVisible()
        scrollTimes.append(ms(t0))
    }
    report("прокрутка (шаг)", scrollTimes)

    // 4. Ввод: символы в середину документа, по одному, с разметкой после каждого.
    let mid = (text as NSString).length / 2
    var typeTimes: [Double] = []
    editor.textView.setSelectedRange(NSRange(location: mid, length: 0))
    for i in 0..<typingSteps {
        let t0 = DispatchTime.now().uptimeNanoseconds
        editor.textView.insertText(String(UnicodeScalar(UInt8(97 + i % 26))),
                                   replacementRange: editor.textView.selectedRange())
        editor.layoutVisible()
        typeTimes.append(ms(t0))
    }
    report("ввод символа (шаг)", typeTimes)

    // 5. Память процесса после загрузки (грубо, RSS).
    print(String(format: "  RSS процесса                   %8.0f МБ", residentMegabytes()))
}

func residentMegabytes() -> Double {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let kr = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
        }
    }
    guard kr == KERN_SUCCESS else { return .nan }
    return Double(info.resident_size) / 1_048_576
}

// MARK: - Точка входа

MainActor.assumeIsolated {
    _ = NSApplication.shared   // инициализация AppKit без окна
    print("TextKit 2 spike — macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
    print("Сборка: release (swift run -c release TextKitSpike)")
    for size in sizesMB {
        do {
            try runSpike(sizeMB: size)
        } catch {
            print("Ошибка на \(size) МБ: \(error)")
        }
    }
    print("\nГотово. Результаты перенести в docs/NATIVE-SPIKE-RU.md.")
}
