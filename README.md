# 🤗 Synthetic Provider for GitHub Copilot Chat

Use frontier open LLMs like Kimi K2, DeepSeek V3.1, GLM 4.5 and more in VS Code with GitHub Copilot Chat powered by the Synthetic provider, which enables integration with custom or experimental LLM endpoints for advanced chat capabilities. 🔥

---

## ⚡ Quick Start
1. Install the Synethic Copilot Chat extension.
2. Open VS Code's chat interface.
3. Click the model picker and click "Manage Models...".
4. Select "Synthetic" provider.
5. Provide your Synthetic API Token.
6. Choose the models you want to add to the model picker. 🥳

## ✨ Why use the Synthetic provider in Copilot
* Integrate custom or experimental LLM endpoints directly into VS Code Copilot Chat.
* Flexibly test and use models not available through standard providers.
* Designed for extensibility and rapid prototyping of new chat model integrations.

💡 The Synthetic provider allows you to connect to your own model endpoints or experimental APIs, making it ideal for advanced users and developers who want full control over their chat experience.

---

## Requirements
* VS Code 1.104.0 or higher.

## 🛠️ Development
```bash
git clone the repo
npm install
npm run compile
```
Press F5 to launch an Extension Development Host.

Common scripts:
* Build: `npm run compile`
* Watch: `npm run watch`
* Lint: `npm run lint`
* Format: `npm run format`

---

## 📚 Learn more
* VS Code Chat Provider API: https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider

---

