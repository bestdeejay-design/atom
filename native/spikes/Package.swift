// swift-tools-version: 5.10
// Спайки этапа 0 (см. docs/NATIVE-REWRITE-PLAN-RU.md). Только системные фреймворки, без зависимостей.
import PackageDescription

let package = Package(
    name: "NativeSpikes",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "TextKitSpike", path: "Sources/TextKitSpike"),
        .executableTarget(name: "JSCSpike", path: "Sources/JSCSpike"),
    ]
)
