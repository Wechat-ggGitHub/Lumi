import Foundation
import CoreGraphics
import ApplicationServices

@_cdecl("node_register_module_v1")
public func node_register_module_v1(
    env: OpaquePointer,
    exports: OpaquePointer
) -> OpaquePointer? {
    // N-API 注册：导出 startListening / stopListening 函数
    // startListening: 创建 CGEventTap 监听 kVK_RightCommand (0x36)
    // stopListening: 移除 CGEventTap
    //
    // 回调通过 N-API napi_call_function 将 keydown/keyup 事件
    // 传递回 JavaScript 回调函数

    let rightCmdKeyCode: UInt16 = 0x36

    // 注册 N-API 函数（使用 node_api_create_function）
    // 伪代码框架：
    // 1. startListening(env, callback) -> 启动 CGEventTap
    //    - CGEventTapCreate(.cgSessionEventTap, .headInsertEventTap,
    //        .defaultTap, .keyDownMask | .keyUpMask,
    //        { _, _, event, _ in
    //            let keyCode = CGEventGetIntegerValueField(event, .keyboardEventKeycode)
    //            if keyCode == rightCmdKeyCode {
    //                let type = CGEventGetType(event) == .keyDown ? "keydown" : "keyup"
    //                callback(type) // 调用 JS 回调
    //                return nil // 消费事件，防止传递
    //            }
    //            return Unmanaged.passUnretained(event)
    //        })
    //    - Add tap to current RunLoop
    //    - Check AXIsProcessTrusted()，如未授权则返回错误
    //
    // 2. stopListening() -> CGEventTapEnable(tap, false), remove from RunLoop

    return exports
}
