# Configuration UI Feature Documentation

## Overview
This extension now includes a basic configuration UI that allows users to set custom temperature values for any given model.

## How to Use

### Setting a Custom Temperature

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run the command: `Configure Model Temperature`
3. Select a model from the list (shows current temperature if set)
4. Enter a temperature value between 0 and 2 (or leave empty for default)
5. The temperature will be saved and applied to future requests

### Features

- **Per-Model Configuration**: Each model can have its own custom temperature setting
- **Default Behavior**: If no custom temperature is set, the model uses its default behavior
- **Visual Feedback**: The model selection list shows the current temperature (or "Default")
- **Validation**: Input is validated to ensure values are between 0 and 2
- **Easy Reset**: Leave the input empty to reset a model to default temperature

### Configuration Storage

Temperature settings are stored in VS Code's global configuration under `synthetic.modelTemperatures`.

You can also view/edit these settings in VS Code's Settings UI:
- Open Settings (`Ctrl+,` / `Cmd+,`)
- Search for "Synthetic"
- Find "Model Temperatures" setting

### Example Configuration

```json
{
  "synthetic.modelTemperatures": {
    "gpt-4": 0.7,
    "claude-2": 1.2,
    "llama-2-70b": 0.5
  }
}
```

## Technical Details

### Implementation

- **Configuration Schema**: Added to `package.json` under `contributes.configuration`
- **Command**: `synthetic.configureTemperature` registered in extension activation
- **Module**: New `config.ts` module handles temperature storage and UI
- **Provider Integration**: `provider.ts` applies custom temperatures before API calls

### Temperature Range

The temperature parameter controls randomness in the model's output:
- **0**: More deterministic and focused
- **1**: Balanced (often the default)
- **2**: More random and creative

Note: Some models may not support the full 0-2 range or may have their own defaults.
