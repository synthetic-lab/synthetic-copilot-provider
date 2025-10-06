# 🤗 [Synthetic](https://synthetic.new) Provider for GitHub Copilot Chat

Use frontier open LLMs like Kimi K2, DeepSeek V3.1, GLM 4.5 and more in VS Code with GitHub Copilot Chat powered by the Synthetic provider, which enables integration with custom or experimental LLM endpoints for advanced chat capabilities. 🔥

---

## ⚡ Quick Start
1. Install the [Github Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension.
3. Open VS Code's chat interface.
   - **Windows/Linux** default: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>I</kbd>
   - **Mac** default: <kbd>Cmd</kbd> + <kbd>Ctrl</kbd> + <kbd>I</kbd>
   - or: View > Chat
4. Click the model picker and click "Manage Models...".

   <img src="./assets/docs_manage_models.png" width="500">

6. Select "Synthetic" provider.

   <img src="./assets/docs_select_provider.png" width="500">

8. Provide your Synthetic API Token. (Get yours here: https://synthetic.new/user-settings/api)

   <img src="./assets/docs_enter_api_key.png" width="500">

10. Choose the models you want to add to the model picker. 🥳

    <img src="./assets/docs_model_list.png" width="500">

## ✨ Why use the Synthetic provider in Copilot
* Integrate custom or experimental LLM endpoints directly into VS Code Copilot Chat.
* Flexibly test and use models not available through standard providers.
* Designed for extensibility and rapid prototyping of new chat model integrations.

💡 The Synthetic provider allows you to use dozens of open-weight models via API, making it ideal for advanced users and developers who want full control over their chat experience.

---

## Requirements
* VS Code 1.104.0 or higher.

## 🛠️ Development

```bash
git clone https://github.com/mcowger/synthetic-vscode-chat.git

cd synthetic-vscode-chat

npm run package

# Ctrl+Shift+P / Cmd+Shift+P > "Extensions: Install from VSIX" OR
code --install-extension synthetic-vscode-chat.vsix
```

Common scripts:
* Build: `npm run compile`
* Watch: `npm run watch`
* Lint: `npm run lint`
* Format: `npm run format`

---

## 📚 Learn more
* VS Code Chat Provider API: https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider

---


