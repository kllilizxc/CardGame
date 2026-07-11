---
id: G-c4d308d6-4ccf-49bc-9790-32984e3b69a4
title: Create the managed Preview adapter
lifecycle: active
priority: 0
contractRevision: 3
completionAttentionId: null
---
## Objective

Create a reviewed foreground Preview adapter at `scripts/hopi/preview` for the managed integration worktree. Keep the scope minimal: use the existing project startup path where possible, run from the managed integration root, follow HOPI Preview adapter conventions for `HOPI_PROJECT_ROOT`, `HOPI_PREVIEW_RUNTIME_DIR`, optional `HOPI_PREVIEW_URL=<url>`, and clean foreground shutdown behavior, and avoid unrelated product changes.

## Constraints

- None recorded.

## Non-Goals

- None recorded.

## Success Criteria

- The desired outcome is delivered against measurable criteria recorded in design and Engineering Work.

## Accepted Inbox Instruction EV-3cdf291a-f3f6-49d8-938f-af7709ddb8e3

Preview could not start through /home/kllilizxc/Code/hopi-auto/.hopi/projects/P-e1d61c49-c862-46c3-aeba-efebcecc7ac8/integration/scripts/hopi/preview. The reviewed scripts/hopi/preview contract is one-click startup from a clean managed integration worktree; the adapter owns preparing project-specific runtime prerequisites, and a clear missing-dependency error is diagnosis rather than successful Preview. First check whether an equivalent nonterminal Goal or Work is already creating or repairing this adapter and reuse it. A terminal setup Goal whose adapter is still missing, non-executable, or startup-failing is not an active repair: reopen it or request the smallest Planning repair instead of declaring the failure already accepted. 

Startup logs:

```
HOPI preview adapter error: vite is required but was not found; install project dependencies under /home/kllilizxc/Code/hopi-auto/.hopi/projects/P-e1d61c49-c862-46c3-aeba-efebcecc7ac8/integration before launching Preview
```

## Accepted Inbox Instruction EV-ae8c38a9-5b3d-456a-8cda-b07f28da38ea

Preview 的宿主实测暴露了新的合同问题：当前 scripts/hopi/preview 固定使用 127.0.0.1:8080，而这个端口已被另一个本地进程占用；依赖安装完成后，脚本还在 Vite 真正可用之前就输出了 HOPI_PREVIEW_URL，随后 Vite 因端口冲突退出。请不要要求我停止或修改本地用户进程。先判断是否已有等价非终态修复；否则更新这个 Goal 的 design，使适配器选择可用的 loopback 端口，并且只在 endpoint 实际可达后输出 HOPI_PREVIEW_URL，然后走正常 Planning、Engineering、Review 和集成。完整失败日志位于 .hopi/runtime/preview/P-e1d61c49-c862-46c3-aeba-efebcecc7ac8/preview-d136e6a7-d46b-4f00-9d97-0e084691a725/preview.log。
