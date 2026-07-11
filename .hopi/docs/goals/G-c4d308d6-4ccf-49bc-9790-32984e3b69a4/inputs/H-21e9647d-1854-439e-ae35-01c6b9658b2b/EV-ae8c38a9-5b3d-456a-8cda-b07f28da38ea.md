---
sourceHomeId: H-21e9647d-1854-439e-ae35-01c6b9658b2b
sourceEventId: EV-ae8c38a9-5b3d-456a-8cda-b07f28da38ea
sourceDigest: 51a935ccc3fc927d76bf834bd46b8ba8b709f34530a3f50d35fe228d3967125a
attachments: []
---
Preview 的宿主实测暴露了新的合同问题：当前 scripts/hopi/preview 固定使用 127.0.0.1:8080，而这个端口已被另一个本地进程占用；依赖安装完成后，脚本还在 Vite 真正可用之前就输出了 HOPI_PREVIEW_URL，随后 Vite 因端口冲突退出。请不要要求我停止或修改本地用户进程。先判断是否已有等价非终态修复；否则更新这个 Goal 的 design，使适配器选择可用的 loopback 端口，并且只在 endpoint 实际可达后输出 HOPI_PREVIEW_URL，然后走正常 Planning、Engineering、Review 和集成。完整失败日志位于 .hopi/runtime/preview/P-e1d61c49-c862-46c3-aeba-efebcecc7ac8/preview-d136e6a7-d46b-4f00-9d97-0e084691a725/preview.log。
