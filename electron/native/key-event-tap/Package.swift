// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "KeyEventTap",
    products: [
        .library(name: "KeyEventTap", type: .dynamic, targets: ["KeyEventTap"]),
    ],
    targets: [
        .systemLibrary(name: "CNodeAPI"),
        .target(
            name: "KeyEventTap",
            dependencies: ["CNodeAPI"],
            path: "Sources"
        ),
    ]
)
